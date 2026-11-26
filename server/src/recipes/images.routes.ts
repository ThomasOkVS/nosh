import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../db/client.js";
import type { AppEnv } from "../http/context.js";
import { MAX_IMAGE_BYTES, processImage, type Refused } from "../images/process.js";
import { UnsafeFileNameError, type ImageStore } from "../images/store.js";
import { parseImageId, parseRecipeId } from "./ids.js";
import { createRecipeRepository } from "./repository.js";

const TOO_LARGE = "Image must be 5 MB or smaller";

/** REC-14: the message for each refusal. */
const REFUSAL: Record<Refused["reason"], string> = {
  type: "Only JPEG, PNG, WEBP or HEIC images are allowed",
  mismatch: "The file's contents don't match its type",
  "too-many-pixels": "That image is too large to process",
  unreadable: "That image couldn't be read",
};

/** design §6.2: a replaced image has a new id and so a new URL, so the bytes never change. */
const CACHE_CONTROL = "private, max-age=31536000, immutable";

/** The only types an original is served as; anything else in a row (a bad v1 import) is plain bytes. */
const SERVED_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
const servedType = (stored: string) =>
  SERVED_TYPES.has(stored) ? stored : "application/octet-stream";

/** Matches only the upload route; app.ts exempts it from the global 100 KiB limit (SEC-27). */
export const IMAGE_UPLOAD_PATH = /^\/api\/recipes\/[^/]+\/images$/;

/** The path's recipe id, or the 400/404 answer for it (REC-08). */
function recipeIdOf(c: Context<AppEnv>): number | Response {
  const parsed = parseRecipeId(c.req.param("id") ?? "");
  if (parsed.ok) return parsed.id;
  return parsed.status === 400
    ? c.json({ error: "Invalid recipe id" }, 400)
    : c.json({ error: "Recipe not found" }, 404);
}

/** The path's image id, or the 400/404 answer for it; a huge id never reaches Postgres. */
function imageIdOf(c: Context<AppEnv>): number | Response {
  const parsed = parseImageId(c.req.param("imageId") ?? "");
  if (parsed.ok) return parsed.id;
  return parsed.status === 400
    ? c.json({ error: "Invalid image id" }, 400)
    : c.json({ error: "Image not found" }, 404);
}

/** Opens a stored file; null when it is missing on disk. */
async function openStored(path: string): Promise<FileHandle | null> {
  try {
    return await open(path, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Cover photo upload, serving and removal (REC-14 to REC-17, SEC-24, SEC-25).
 * Mounted inside recipeRoutes, behind requireAuth, which sets `user` (SEC-23).
 */
export function imageRoutes(deps: { db: Db; images: ImageStore }) {
  const repo = createRecipeRepository(deps.db);

  /** Removes files whose rows are already gone; a failure is logged, never the answer. */
  async function removeQuietly(fileNames: string[], what: string) {
    try {
      await deps.images.remove(fileNames);
    } catch (err) {
      console.error(`${what}: image files remain`, err);
    }
  }

  return new Hono<AppEnv>()
    .post(
      "/:id/images",
      // The global 100 KiB limit skips this route (app.ts); a 5 MB file plus multipart framing.
      bodyLimit({
        maxSize: MAX_IMAGE_BYTES + 64 * 1024,
        onError: (c) => c.json({ error: TOO_LARGE }, 400),
      }),
      async (c) => {
        const user = c.get("user");
        if (!user) return c.json({ error: "Not authenticated" }, 401);
        const recipeId = recipeIdOf(c);
        if (recipeId instanceof Response) return recipeId;
        if (!(await repo.owns(user.id, recipeId))) {
          return c.json({ error: "Recipe not found" }, 404);
        }

        let body: Record<string, unknown>;
        try {
          body = await c.req.parseBody();
        } catch {
          return c.json({ error: "Invalid request" }, 400); // SEC-27: malformed multipart
        }
        const file = body["file"];
        if (!(file instanceof File)) return c.json({ error: "No image file was sent" }, 400);
        if (file.size > MAX_IMAGE_BYTES) return c.json({ error: TOO_LARGE }, 400);

        // The multipart part's own type: a bare MIME type, which processImage requires.
        const processed = await processImage(Buffer.from(await file.arrayBuffer()), file.type, {
          allowHeic: true,
        });
        if (!processed.ok) return c.json({ error: REFUSAL[processed.reason] }, 400);

        // Nothing is left on disk without a row: whatever this upload saved goes on any failure.
        const saved: string[] = [];
        let added: Awaited<ReturnType<typeof repo.addCover>>;
        try {
          const fileName = await deps.images.save(processed.original, processed.ext);
          saved.push(fileName);
          const cardFileName = await deps.images.save(processed.card, "webp");
          saved.push(cardFileName);
          added = await repo.addCover(user.id, recipeId, {
            fileName,
            cardFileName,
            contentType: processed.contentType,
          });
        } catch (err) {
          await removeQuietly(saved, `upload to recipe ${recipeId} failed`);
          throw err;
        }
        if (!added) {
          // The recipe was deleted while the photo was being processed.
          await removeQuietly(saved, `upload to deleted recipe ${recipeId}`);
          return c.json({ error: "Recipe not found" }, 404);
        }

        // REC-15: the old cover's row is gone with the commit; now its files go too.
        await removeQuietly(added.replaced, `cover of recipe ${recipeId} replaced`);
        return c.json(added.image, 201);
      },
    )
    .get("/:id/images/:imageId", async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const recipeId = recipeIdOf(c);
      if (recipeId instanceof Response) return recipeId;
      const imageId = imageIdOf(c);
      if (imageId instanceof Response) return imageId;
      if (!(await repo.owns(user.id, recipeId))) {
        return c.json({ error: "Recipe not found" }, 404);
      }
      const image = await repo.getImage(user.id, recipeId, imageId);
      if (!image) return c.json({ error: "Image not found" }, 404);

      // design §6.1: an image without a card copy (a v1 import) serves its original.
      const card = c.req.query("size") === "card" && image.cardFileName !== null;
      // SEC-24: only names stored in the database reach the file system, never URL input.
      const fileName = card && image.cardFileName !== null ? image.cardFileName : image.fileName;
      let filePath: string;
      try {
        filePath = deps.images.path(fileName);
      } catch (err) {
        // A stored name that is not a plain file name (a bad v1 row) is never opened.
        if (err instanceof UnsafeFileNameError) return c.json({ error: "Image not found" }, 404);
        throw err;
      }
      const handle = await openStored(filePath);
      if (!handle) return c.json({ error: "Image not found" }, 404);

      let size: number;
      try {
        ({ size } = await handle.stat());
      } catch (err) {
        await handle.close();
        throw err;
      }
      const imageHeaders = {
        "Content-Type": card ? "image/webp" : servedType(image.contentType),
        "Content-Length": String(size),
        "Cache-Control": CACHE_CONTROL,
      };
      // Hono answers HEAD through this handler and drops the body: a stream would never
      // be read, so its handle would stay open until garbage collection.
      if (c.req.method === "HEAD") {
        await handle.close();
        return c.body(null, 200, imageHeaders);
      }
      const stream = Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;
      // X-Content-Type-Options: nosniff comes from the global securityHeaders (SEC-60).
      return c.body(stream, 200, imageHeaders);
    })
    .delete("/:id/images/:imageId", async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const recipeId = recipeIdOf(c);
      if (recipeId instanceof Response) return recipeId;
      const imageId = imageIdOf(c);
      if (imageId instanceof Response) return imageId;
      if (!(await repo.owns(user.id, recipeId))) {
        return c.json({ error: "Recipe not found" }, 404);
      }
      const removed = await repo.removeImage(user.id, recipeId, imageId);
      if (!removed) return c.json({ error: "Image not found" }, 404);
      // REC-17: the row is gone; a missing file is not an error, a stuck one is only logged.
      await removeQuietly(removed.fileNames, `image ${imageId} deleted`);
      return c.body(null, 204);
    });
}

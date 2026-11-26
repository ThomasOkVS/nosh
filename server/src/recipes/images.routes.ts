import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { imageFromUrlBody } from "@nosh/shared";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { Db } from "../db/client.js";
import type { AppEnv } from "../http/context.js";
import { FixedWindowLimiter, tooMany } from "../http/rateLimit.js";
import { jsonBody } from "../http/validate.js";
import { MAX_IMAGE_BYTES, processImage, type Processed, type Refused } from "../images/process.js";
import { UnsafeFileNameError, type ImageStore } from "../images/store.js";
import { checkUrl } from "../net/addresses.js";
import { safeFetch, type SafeFetchFailureKind } from "../net/safeFetch.js";
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

/** REC-19: a fetched photo that is not a JPEG, PNG or WEBP image of those bytes. */
const NOT_SUPPORTED = "That URL isn't a supported image";
const COULD_NOT_FETCH = "Couldn't fetch that image"; // SEC-40: never the raw error

/** REC-19, SEC-39, SEC-40: the answer for each failed fetch; none is a 500. */
const FETCH_FAILURE: Record<SafeFetchFailureKind, { status: 400 | 422 | 502; error: string }> = {
  // A redirect to a blocked address is refused like the first URL (SEC-39).
  blocked: { status: 400, error: "This URL cannot be imported" },
  "too-many-redirects": { status: 502, error: "The image URL redirected too many times" },
  "too-large": { status: 422, error: TOO_LARGE },
  "no-location": { status: 502, error: COULD_NOT_FETCH },
  timeout: { status: 502, error: COULD_NOT_FETCH },
  network: { status: 502, error: COULD_NOT_FETCH },
  http: { status: 502, error: COULD_NOT_FETCH },
};

/** REC-18, SEC-41: a photo fetch takes at most 10 seconds and 5 MB, following up to 5 redirects. */
const FETCH_LIMITS = { timeoutMs: 10_000, maxBytes: MAX_IMAGE_BYTES, maxRedirects: 5 };

/** SEC-22: photo-from-URL requests per user per hour. */
const FROM_URL_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

/** The declared type without parameters: `image/jpeg; charset=binary` is `image/jpeg`. */
const bareType = (header: string | null) => header?.split(";")[0]?.trim().toLowerCase() ?? "";

/** design §6.2: a replaced image has a new id and so a new URL, so the bytes never change. */
const CACHE_CONTROL = "private, max-age=31536000, immutable";

/** The only types an original is served as; anything else in a row (a bad v1 import) is plain bytes. */
const SERVED_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
const servedType = (stored: string) =>
  SERVED_TYPES.has(stored) ? stored : "application/octet-stream";

/** The guarded fetch the photo-from-URL route uses (REC-18); tests inject one. */
export type FetchImage = typeof safeFetch;

/** Matches only the upload route; app.ts exempts it from the global 100 KiB limit (SEC-27). */
export const IMAGE_UPLOAD_PATH = /^\/api\/recipes\/[^/]+\/images$/;

/** AppEnv plus the owned recipe's id, set once ownership is checked. */
type OwnedRecipeEnv = AppEnv & { Variables: { recipeId: number } };

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
 * Cover photo upload, attach from a URL, serving and removal (REC-14 to REC-19,
 * SEC-22, SEC-24, SEC-25). Mounted inside recipeRoutes, behind requireAuth,
 * which sets `user` (SEC-23).
 */
export function imageRoutes(deps: { db: Db; images: ImageStore; fetchImage?: FetchImage }) {
  const repo = createRecipeRepository(deps.db);
  const fetchImage = deps.fetchImage ?? safeFetch;
  const fromUrlPerUser = new FixedWindowLimiter(FROM_URL_LIMIT);

  /** Removes files whose rows are already gone; a failure is logged, never the answer. */
  async function removeQuietly(fileNames: string[], what: string) {
    try {
      await deps.images.remove(fileNames);
    } catch (err) {
      console.error(`${what}: image files remain`, err);
    }
  }

  /**
   * Saves both files and makes them the cover (REC-15), for an upload and a
   * photo from a URL alike. Nothing is left on disk without a row: whatever was
   * saved goes on any failure. Null when the recipe was deleted meanwhile.
   */
  async function storeCover(userId: string, recipeId: number, processed: Processed) {
    const saved: string[] = [];
    let added: Awaited<ReturnType<typeof repo.addCover>>;
    try {
      const fileName = await deps.images.save(processed.original, processed.ext);
      saved.push(fileName);
      const cardFileName = await deps.images.save(processed.card, "webp");
      saved.push(cardFileName);
      added = await repo.addCover(userId, recipeId, {
        fileName,
        cardFileName,
        contentType: processed.contentType,
      });
    } catch (err) {
      await removeQuietly(saved, `photo for recipe ${recipeId} failed`);
      throw err;
    }
    if (!added) {
      await removeQuietly(saved, `photo for deleted recipe ${recipeId}`);
      return null;
    }
    // REC-15: the old cover's row is gone with the commit; now its files go too.
    await removeQuietly(added.replaced, `cover of recipe ${recipeId} replaced`);
    return added.image;
  }

  /**
   * REC-18, SEC-22: the recipe must be the user's, then the user must be within
   * the hourly limit, before the body is even read. A 404 never counts.
   */
  const ownedWithinLimit = createMiddleware<OwnedRecipeEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    // Answered inline rather than by recipeIdOf: an untyped Response would erase the
    // route's response types for the typed client.
    const parsed = parseRecipeId(c.req.param("id") ?? "");
    if (!parsed.ok) {
      return parsed.status === 400
        ? c.json({ error: "Invalid recipe id" }, 400)
        : c.json({ error: "Recipe not found" }, 404);
    }
    if (!(await repo.owns(user.id, parsed.id))) {
      return c.json({ error: "Recipe not found" }, 404);
    }
    const hit = fromUrlPerUser.hit(user.id);
    if (!hit.ok) return tooMany(c, hit.retryAfterSec);
    c.set("recipeId", parsed.id);
    await next();
  });

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

        const image = await storeCover(user.id, recipeId, processed);
        // The recipe was deleted while the photo was being processed.
        if (!image) return c.json({ error: "Recipe not found" }, 404);
        return c.json(image, 201);
      },
    )
    // REC-18, REC-19: the server fetches the photo itself through the SSRF guard. The
    // order is id, ownership and rate limit (ownedWithinLimit), then body, URL, fetch.
    .post("/:id/images/from-url", ownedWithinLimit, jsonBody(imageFromUrlBody), async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const recipeId = c.get("recipeId");

      // SEC-34: refused before any request. safeFetch checks again on every hop (SEC-39).
      const { url } = c.req.valid("json");
      const checked = checkUrl(url);
      if (!checked.ok) return c.json({ error: checked.error }, 400);

      const fetched = await fetchImage(url, FETCH_LIMITS);
      if (!fetched.ok) {
        const failure = FETCH_FAILURE[fetched.kind];
        return c.json({ error: failure.error }, failure.status);
      }

      // The declared type decides and must match the bytes (SEC-25). No HEIC from a URL.
      const type = bareType(fetched.headers.get("content-type"));
      const processed = await processImage(fetched.body, type, { allowHeic: false });
      if (!processed.ok) return c.json({ error: NOT_SUPPORTED }, 422);

      const image = await storeCover(user.id, recipeId, processed);
      if (!image) return c.json({ error: "Recipe not found" }, 404);
      return c.json(image, 201);
    })
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

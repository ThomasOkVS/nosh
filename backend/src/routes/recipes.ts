import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth";
import {
  addRecipeImage,
  createRecipe,
  deleteRecipe,
  deleteRecipeImage,
  findRecipeById,
  findRecipeOwnerId,
  getRecipeImage,
  listRecipesByUser,
  searchRecipes,
  updateRecipe,
} from "../repositories/recipes";
import {
  fetchImageFromUrl,
  IMAGE_MIME_EXTENSIONS,
  ImageFetchError,
  ImageTooLargeError,
  UnsupportedImageTypeError,
} from "../services/imageFromUrl";
import { InvalidUrlError } from "../services/recipeExtraction";
import { importRequestSchema } from "../validation/import";
import { recipeSchema } from "../validation/recipes";

function statusForImageFetchError(err: unknown): number {
  if (err instanceof InvalidUrlError) return 400;
  if (err instanceof UnsupportedImageTypeError) return 422;
  if (err instanceof ImageTooLargeError) return 422;
  if (err instanceof ImageFetchError) return 502;
  return 500;
}

function parseId(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireRecipeOwnership(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid recipe id" });
      return;
    }
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const ownerId = await findRecipeOwnerId(pool, id);
      if (ownerId === null || ownerId !== userId) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function handleUpload(uploadMiddleware: ReturnType<ReturnType<typeof multer>["single"]>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    uploadMiddleware(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
        return;
      }
      next();
    });
  };
}

export function createRecipesRouter(
  pool: Pool,
  uploadsDir: string,
  fetchImpl: typeof fetch = fetch,
): Router {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, callback) => {
        const extension = IMAGE_MIME_EXTENSIONS[file.mimetype] ?? "";
        callback(null, `${randomUUID()}${extension}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (!(file.mimetype in IMAGE_MIME_EXTENSIONS)) {
        callback(new Error("Unsupported image type"));
        return;
      }
      callback(null, true);
    },
  });

  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req, res, next) => {
    const parsed = recipeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const recipe = await createRecipe(pool, userId, parsed.data);
      res.status(201).json(recipe);
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const recipes = await listRecipesByUser(pool, userId);
      res.json(recipes);
    } catch (err) {
      next(err);
    }
  });

  router.get("/search", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query === "") {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    try {
      const recipes = await searchRecipes(pool, userId, query);
      res.json(recipes);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireRecipeOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid recipe id" });
      return;
    }

    try {
      const recipe = await findRecipeById(pool, id);
      if (!recipe) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      res.json(recipe);
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", requireRecipeOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid recipe id" });
      return;
    }
    const parsed = recipeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    try {
      const recipe = await updateRecipe(pool, id, parsed.data);
      if (!recipe) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      res.json(recipe);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requireRecipeOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid recipe id" });
      return;
    }

    try {
      const imageFilePaths = await deleteRecipe(pool, id);
      if (imageFilePaths === null) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      await Promise.all(
        imageFilePaths.map((filePath) =>
          fsPromises.unlink(path.join(uploadsDir, filePath)).catch(() => undefined),
        ),
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/images",
    requireRecipeOwnership(pool),
    handleUpload(upload.single("image")),
    async (req, res, next) => {
      const id = parseId(req.params.id);
      if (id === null) {
        res.status(400).json({ error: "Invalid recipe id" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "No image file uploaded" });
        return;
      }

      try {
        const image = await addRecipeImage(pool, id, req.file.filename);
        res.status(201).json(image);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * Auto-attaches the recipe's source photo right after an import is saved:
   * `imageUrl` is discovered server-side during `/import` (schema.org
   * `image`, an og:image meta tag, or a yt-dlp thumbnail) and handed back to
   * the browser, which calls this once it has a real recipe id to attach to.
   * Deliberately best-effort from the frontend's point of view — a failure
   * here shouldn't undo an otherwise-successful save.
   */
  router.post(
    "/:id/images/from-url",
    requireRecipeOwnership(pool),
    async (req, res, next) => {
      const id = parseId(req.params.id);
      if (id === null) {
        res.status(400).json({ error: "Invalid recipe id" });
        return;
      }
      const parsed = importRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
        return;
      }

      try {
        const { buffer, extension } = await fetchImageFromUrl(parsed.data.url, fetchImpl);
        const filename = `${randomUUID()}${extension}`;
        await fsPromises.writeFile(path.join(uploadsDir, filename), buffer);
        const image = await addRecipeImage(pool, id, filename);
        res.status(201).json(image);
      } catch (err) {
        if (
          err instanceof InvalidUrlError ||
          err instanceof UnsupportedImageTypeError ||
          err instanceof ImageTooLargeError ||
          err instanceof ImageFetchError
        ) {
          res.status(statusForImageFetchError(err)).json({ error: err.message });
          return;
        }
        next(err);
      }
    },
  );

  router.get("/:id/images/:imageId", requireRecipeOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);
    if (id === null || imageId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const image = await getRecipeImage(pool, id, imageId);
      if (!image) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      res.sendFile(image.filePath, { root: uploadsDir }, (err) => {
        if (err) next(err);
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/images/:imageId", requireRecipeOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);
    if (id === null || imageId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const filePath = await deleteRecipeImage(pool, id, imageId);
      if (filePath === null) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      await fsPromises.unlink(path.join(uploadsDir, filePath)).catch(() => undefined);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

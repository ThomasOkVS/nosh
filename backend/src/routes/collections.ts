import fsPromises from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth";
import {
  createCollection,
  deleteCollection,
  findCollectionOwnerId,
  getCollectionById,
  getCollectionSubtreeImagePaths,
  listCollectionsByUser,
  updateCollection,
  wouldCreateCycle,
} from "../repositories/collections";
import { listRecipesByCollection } from "../repositories/recipes";
import { collectionSchema } from "../validation/collections";

function parseId(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireCollectionOwnership(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const ownerId = await findCollectionOwnerId(pool, id);
      if (ownerId === null || ownerId !== userId) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createCollectionsRouter(pool: Pool, uploadsDir: string): Router {
  const router = Router();
  router.use(requireAuth);

  /** A `parentId` supplied in a request body is just a number until it's
   * checked -- this confirms it's a real collection belonging to the caller
   * before it's allowed to become another collection's parent, the same way
   * every other body-supplied foreign id in this app is checked. */
  async function requireOwnedParentOrNull(
    userId: number,
    parentId: number | null,
    res: Response,
  ): Promise<boolean> {
    if (parentId === null) {
      return true;
    }
    const ownerId = await findCollectionOwnerId(pool, parentId);
    if (ownerId === null || ownerId !== userId) {
      res.status(404).json({ error: "Parent collection not found" });
      return false;
    }
    return true;
  }

  router.post("/", async (req, res, next) => {
    const parsed = collectionSchema.safeParse(req.body);
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
      if (!(await requireOwnedParentOrNull(userId, parsed.data.parentId, res))) {
        return;
      }
      const collection = await createCollection(pool, userId, parsed.data.name, parsed.data.parentId);
      res.status(201).json(collection);
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
      const collections = await listCollectionsByUser(pool, userId);
      res.json(collections);
    } catch (err) {
      next(err);
    }
  });

  /** Renames and/or reparents a collection in one call -- see
   * `updateCollection`'s doc comment for why these are treated as one "edit
   * collection" action rather than two endpoints. */
  router.put("/:id", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    const userId = req.session.userId;
    if (id === null || userId === undefined) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }
    const parsed = collectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    try {
      if (!(await requireOwnedParentOrNull(userId, parsed.data.parentId, res))) {
        return;
      }
      if (parsed.data.parentId !== null && (await wouldCreateCycle(pool, id, parsed.data.parentId))) {
        res.status(400).json({ error: "A collection can't be moved inside itself or its own contents" });
        return;
      }

      const collection = await updateCollection(pool, id, {
        name: parsed.data.name,
        parentId: parsed.data.parentId,
      });
      if (!collection) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.json(collection);
    } catch (err) {
      next(err);
    }
  });

  /** Deleting a collection cascades at the database level to every
   * sub-collection and recipe nested inside it (see the migration and
   * `getCollectionSubtreeImagePaths`'s doc comment), so this collects every
   * image file path in that subtree *before* deleting -- the rows won't
   * exist to query afterward -- and unlinks them best-effort afterward, the
   * same pattern the single-recipe delete route already uses. */
  router.delete("/:id", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const imageFilePaths = await getCollectionSubtreeImagePaths(pool, id);
      const deleted = await deleteCollection(pool, id);
      if (!deleted) {
        res.status(404).json({ error: "Collection not found" });
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

  router.get("/:id/recipes", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    const userId = req.session.userId;
    if (id === null || userId === undefined) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const [collection, allCollections, recipes] = await Promise.all([
        getCollectionById(pool, id),
        listCollectionsByUser(pool, userId),
        listRecipesByCollection(pool, id),
      ]);
      if (!collection) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      const subCollections = allCollections.filter((c) => c.parentId === id);
      res.json({ collection, subCollections, recipes });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

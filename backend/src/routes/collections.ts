import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth";
import {
  addRecipeToCollection,
  createCollection,
  deleteCollection,
  findCollectionOwnerId,
  getCollectionById,
  listCollectionsByUser,
  listRecipesInCollection,
  removeRecipeFromCollection,
  renameCollection,
} from "../repositories/collections";
import { findRecipeOwnerId } from "../repositories/recipes";
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

export function createCollectionsRouter(pool: Pool): Router {
  const router = Router();
  router.use(requireAuth);

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
      const collection = await createCollection(pool, userId, parsed.data.name);
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

  router.put("/:id", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }
    const parsed = collectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    try {
      const collection = await renameCollection(pool, id, parsed.data.name);
      if (!collection) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.json(collection);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const deleted = await deleteCollection(pool, id);
      if (!deleted) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/recipes", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const [collection, recipes] = await Promise.all([
        getCollectionById(pool, id),
        listRecipesInCollection(pool, id),
      ]);
      if (!collection) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.json({ collection, recipes });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Linking a recipe into a collection touches two owned resources, so
   * `requireCollectionOwnership` above only proves the *collection* belongs
   * to this user — without this extra check, a user could still link
   * someone else's recipe id into their own collection.
   */
  async function requireOwnRecipe(req: Request, res: Response): Promise<number | null> {
    const recipeId = parseId(req.params.recipeId);
    if (recipeId === null) {
      res.status(400).json({ error: "Invalid recipe id" });
      return null;
    }
    const ownerId = await findRecipeOwnerId(pool, recipeId);
    if (ownerId === null || ownerId !== req.session.userId) {
      res.status(404).json({ error: "Recipe not found" });
      return null;
    }
    return recipeId;
  }

  router.post("/:id/recipes/:recipeId", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const recipeId = await requireOwnRecipe(req, res);
      if (recipeId === null) {
        return;
      }
      await addRecipeToCollection(pool, recipeId, id);
      res.status(201).end();
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/recipes/:recipeId", requireCollectionOwnership(pool), async (req, res, next) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid collection id" });
      return;
    }

    try {
      const recipeId = await requireOwnRecipe(req, res);
      if (recipeId === null) {
        return;
      }
      await removeRecipeFromCollection(pool, recipeId, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

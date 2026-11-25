import { recipeBody } from "@nosh/shared";
import { Hono } from "hono";
import type { Db } from "../db/client.js";
import type { AppEnv } from "../http/context.js";
import { jsonBody } from "../http/validate.js";
import type { ImageStore } from "../images/store.js";
import { parseRecipeId } from "./ids.js";
import { imageRoutes } from "./images.routes.js";
import { createRecipeRepository } from "./repository.js";

/** Mounted behind requireAuth, which sets `user` (REC-01, SEC-23). */
export function recipeRoutes(deps: { db: Db; images: ImageStore }) {
  const repo = createRecipeRepository(deps.db);

  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      // REC-10: an empty tag is ignored by the repository.
      const tag = c.req.query("tag");
      return c.json(await repo.list(user.id, tag === undefined ? {} : { tag }));
    })
    .post("/", jsonBody(recipeBody), async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const body = c.req.valid("json");
      // REC-11: no collections exist yet, so any given id is unknown. COL replaces this
      // with an ownership lookup. Nothing has been written at this point.
      if (body.collectionId !== undefined && body.collectionId !== null) {
        return c.json({ error: "Collection not found" }, 404);
      }
      return c.json(await repo.create(user.id, body), 201);
    })
    .get("/:id", async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const parsed = parseRecipeId(c.req.param("id"));
      if (!parsed.ok) {
        return parsed.status === 400
          ? c.json({ error: "Invalid recipe id" }, 400)
          : c.json({ error: "Recipe not found" }, 404);
      }
      const recipe = await repo.get(user.id, parsed.id);
      if (!recipe) return c.json({ error: "Recipe not found" }, 404);
      return c.json(recipe);
    })
    .put("/:id", jsonBody(recipeBody), async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const parsed = parseRecipeId(c.req.param("id"));
      if (!parsed.ok) {
        return parsed.status === 400
          ? c.json({ error: "Invalid recipe id" }, 400)
          : c.json({ error: "Recipe not found" }, 404);
      }
      // REC-12: the collection is never changed by an update, so body.collectionId is ignored.
      const recipe = await repo.update(user.id, parsed.id, c.req.valid("json"));
      if (!recipe) return c.json({ error: "Recipe not found" }, 404);
      return c.json(recipe);
    })
    .delete("/:id", async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Not authenticated" }, 401);
      const parsed = parseRecipeId(c.req.param("id"));
      if (!parsed.ok) {
        return parsed.status === 400
          ? c.json({ error: "Invalid recipe id" }, 400)
          : c.json({ error: "Recipe not found" }, 404);
      }
      const removed = await repo.remove(user.id, parsed.id);
      if (!removed) return c.json({ error: "Recipe not found" }, 404);
      // The rows are already gone; a file that cannot be removed is logged, not a failed delete.
      try {
        await deps.images.remove(removed.fileNames);
      } catch (err) {
        console.error(`recipe ${parsed.id} deleted but image files remain`, err);
      }
      return c.body(null, 204);
    })
    .route("/", imageRoutes(deps));
}

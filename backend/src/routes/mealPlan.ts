import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import {
  deleteMealPlanEntry,
  listMealPlanEntriesInRange,
  upsertMealPlanEntry,
} from "../repositories/mealPlan";
import { findRecipeOwnerId } from "../repositories/recipes";
import { mealPlanEntrySchema, mealPlanRangeSchema } from "../validation/mealPlan";

const dateParamSchema = z.iso.date();

// A range this wide has no legitimate use from the week-at-a-time frontend
// UI and would otherwise let the endpoint be used to dump a user's entire
// meal-plan history in one request.
const MAX_RANGE_DAYS = 366;

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

export function createMealPlanRouter(pool: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  /** Range-based, not week-based -- the frontend always calls this with a
   * 7-day range, but the shape is deliberately general so the future
   * "grocery list generation from planned meals" roadmap item can query
   * "everything planned in date range X-Y" against this same endpoint. */
  router.get("/", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const parsed = mealPlanRangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { start, end } = parsed.data;
    const span = daysBetween(start, end);
    if (span < 0) {
      res.status(400).json({ error: "end must not be before start" });
      return;
    }
    if (span > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `Range must not exceed ${MAX_RANGE_DAYS} days` });
      return;
    }

    try {
      const entries = await listMealPlanEntriesInRange(pool, userId, start, end);
      res.json(entries);
    } catch (err) {
      next(err);
    }
  });

  /** Set-or-replace the recipe planned for `:date` -- PUT because the slot
   * is addressed by date and the write is an idempotent set-or-replace, the
   * same reasoning as `PUT /collections/:id`. */
  router.put("/:date", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const dateParsed = dateParamSchema.safeParse(req.params.date);
    if (!dateParsed.success) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }
    const bodyParsed = mealPlanEntrySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    try {
      const ownerId = await findRecipeOwnerId(pool, bodyParsed.data.recipeId);
      if (ownerId === null || ownerId !== userId) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      const entry = await upsertMealPlanEntry(pool, userId, dateParsed.data, bodyParsed.data.recipeId);
      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:date", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const dateParsed = dateParamSchema.safeParse(req.params.date);
    if (!dateParsed.success) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }

    try {
      const deleted = await deleteMealPlanEntry(pool, userId, dateParsed.data);
      if (!deleted) {
        res.status(404).json({ error: "Meal plan entry not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

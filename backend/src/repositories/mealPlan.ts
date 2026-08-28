import type { Pool } from "pg";
import { RECIPE_COLUMNS, assembleRecipes, findRecipeById, type Recipe, type RecipeRow } from "./recipes";

export interface MealPlanEntry {
  id: number;
  userId: number;
  date: string;
  recipe: Recipe;
}

interface MealPlanEntryRow {
  id: number;
  user_id: number;
  date: string;
  recipe_id: number;
}

/** All of a user's meal-plan entries whose day falls within `[start, end]`
 * (inclusive, both `"YYYY-MM-DD"`). `planned_on::text` is cast explicitly
 * here rather than left as `pg`'s default `Date` -- `pg` parses a `DATE`
 * column at local midnight, and serializing that back out with
 * `JSON.stringify` converts to UTC, which silently shifts the date a day
 * earlier on a host east of UTC. Casting to text in SQL sidesteps that
 * entirely: the string that comes back is exactly what Postgres stored. */
export async function listMealPlanEntriesInRange(
  pool: Pool,
  userId: number,
  start: string,
  end: string,
): Promise<MealPlanEntry[]> {
  const entriesResult = await pool.query<MealPlanEntryRow>(
    `SELECT id, user_id, planned_on::text AS date, recipe_id
     FROM meal_plan_entries
     WHERE user_id = $1 AND planned_on BETWEEN $2 AND $3
     ORDER BY planned_on`,
    [userId, start, end],
  );
  const entryRows = entriesResult.rows;
  if (entryRows.length === 0) {
    return [];
  }

  const recipeIds = entryRows.map((row) => row.recipe_id);
  const recipesResult = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes WHERE id = ANY($1)`,
    [recipeIds],
  );
  const recipes = await assembleRecipes(pool, recipesResult.rows);
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return entryRows.flatMap((row) => {
    const recipe = recipesById.get(row.recipe_id);
    // Only reachable if the recipe was deleted between the two queries above
    // -- ON DELETE CASCADE removes the entry too, just not necessarily
    // before this read observed it. Drop the entry from the response rather
    // than surface a reference to a recipe that no longer exists.
    return recipe ? [{ id: row.id, userId: row.user_id, date: row.date, recipe }] : [];
  });
}

/** Set-or-replace the recipe planned for `date`, matching the "one recipe
 * per day, per user" rule enforced by `meal_plan_entries`'
 * `UNIQUE(user_id, planned_on)` constraint: a second call for the same date
 * replaces the recipe rather than erroring or creating a second row. */
export async function upsertMealPlanEntry(
  pool: Pool,
  userId: number,
  date: string,
  recipeId: number,
): Promise<MealPlanEntry> {
  const result = await pool.query<{ id: number; date: string }>(
    `INSERT INTO meal_plan_entries (user_id, planned_on, recipe_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, planned_on) DO UPDATE SET recipe_id = EXCLUDED.recipe_id
     RETURNING id, planned_on::text AS date`,
    [userId, date, recipeId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into meal_plan_entries returned no row");
  }
  const recipe = await findRecipeById(pool, recipeId);
  if (!recipe) {
    throw new Error("Recipe not found immediately after assigning it to a meal plan entry");
  }
  return { id: row.id, userId, date: row.date, recipe };
}

export async function deleteMealPlanEntry(pool: Pool, userId: number, date: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM meal_plan_entries WHERE user_id = $1 AND planned_on = $2`,
    [userId, date],
  );
  return (result.rowCount ?? 0) > 0;
}

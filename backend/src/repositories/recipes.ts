import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/transaction";
import { groupBy } from "../utils/groupBy";
import type { RecipeInput } from "../validation/recipes";

export interface Ingredient {
  id: number;
  position: number;
  quantity: string | null;
  unit: string | null;
  name: string;
}

export interface Step {
  id: number;
  position: number;
  instruction: string;
}

export interface RecipeImage {
  id: number;
  filePath: string;
  position: number;
}

export interface Recipe {
  id: number;
  userId: number;
  /** `null` means the recipe sits directly at Home, the top of the library. */
  collectionId: number | null;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  images: RecipeImage[];
}

export interface RecipeRow {
  id: number;
  user_id: number;
  collection_id: number | null;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export const RECIPE_COLUMNS = `
  id, user_id, collection_id, title, description, servings, prep_time_minutes, cook_time_minutes,
  source_url, created_at, updated_at
`;

async function insertIngredients(
  client: PoolClient,
  recipeId: number,
  ingredients: RecipeInput["ingredients"],
): Promise<void> {
  for (const [index, ingredient] of ingredients.entries()) {
    await client.query(
      `INSERT INTO ingredients (recipe_id, position, quantity, unit, name)
       VALUES ($1, $2, $3, $4, $5)`,
      [recipeId, index, ingredient.quantity, ingredient.unit, ingredient.name],
    );
  }
}

async function insertSteps(
  client: PoolClient,
  recipeId: number,
  steps: RecipeInput["steps"],
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    await client.query(`INSERT INTO steps (recipe_id, position, instruction) VALUES ($1, $2, $3)`, [
      recipeId,
      index,
      step.instruction,
    ]);
  }
}

async function syncTags(client: PoolClient, recipeId: number, tagNames: string[]): Promise<void> {
  await client.query(`DELETE FROM recipe_tags WHERE recipe_id = $1`, [recipeId]);

  for (const name of tagNames) {
    const tagResult = await client.query<{ id: number }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name],
    );
    const tagRow = tagResult.rows[0];
    if (!tagRow) {
      continue;
    }
    await client.query(
      `INSERT INTO recipe_tags (recipe_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [recipeId, tagRow.id],
    );
  }
}

function toRecipe(
  row: RecipeRow,
  ingredients: Ingredient[],
  steps: Step[],
  tags: string[],
  images: RecipeImage[],
): Recipe {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepTimeMinutes: row.prep_time_minutes,
    cookTimeMinutes: row.cook_time_minutes,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients,
    steps,
    tags,
    images,
  };
}

export async function assembleRecipes(pool: Pool, rows: RecipeRow[]): Promise<Recipe[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);

  const [ingredientRows, stepRows, tagRows, imageRows] = await Promise.all([
    pool.query<{ recipe_id: number } & Ingredient>(
      `SELECT recipe_id, id, position, quantity, unit, name
       FROM ingredients WHERE recipe_id = ANY($1) ORDER BY position`,
      [ids],
    ),
    pool.query<{ recipe_id: number } & Step>(
      `SELECT recipe_id, id, position, instruction
       FROM steps WHERE recipe_id = ANY($1) ORDER BY position`,
      [ids],
    ),
    pool.query<{ recipe_id: number; name: string }>(
      `SELECT rt.recipe_id, t.name
       FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
       WHERE rt.recipe_id = ANY($1) ORDER BY t.name`,
      [ids],
    ),
    pool.query<{ recipe_id: number; id: number; file_path: string; position: number }>(
      `SELECT recipe_id, id, file_path, position
       FROM recipe_images WHERE recipe_id = ANY($1) ORDER BY position`,
      [ids],
    ),
  ]);

  const ingredientsByRecipe = groupBy(ingredientRows.rows, (row) => row.recipe_id);
  const stepsByRecipe = groupBy(stepRows.rows, (row) => row.recipe_id);
  const tagsByRecipe = groupBy(tagRows.rows, (row) => row.recipe_id);
  const imagesByRecipe = groupBy(imageRows.rows, (row) => row.recipe_id);

  return rows.map((row) =>
    toRecipe(
      row,
      ingredientsByRecipe.get(row.id) ?? [],
      stepsByRecipe.get(row.id) ?? [],
      (tagsByRecipe.get(row.id) ?? []).map((tag) => tag.name),
      (imagesByRecipe.get(row.id) ?? []).map((image) => ({
        id: image.id,
        filePath: image.file_path,
        position: image.position,
      })),
    ),
  );
}

export async function createRecipe(
  pool: Pool,
  userId: number,
  input: RecipeInput,
): Promise<Recipe> {
  const recipeId = await withTransaction(pool, async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO recipes (user_id, collection_id, title, description, servings, prep_time_minutes, cook_time_minutes, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        userId,
        input.collectionId,
        input.title,
        input.description,
        input.servings,
        input.prepTimeMinutes,
        input.cookTimeMinutes,
        input.sourceUrl,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Insert into recipes returned no row");
    }

    await insertIngredients(client, row.id, input.ingredients);
    await insertSteps(client, row.id, input.steps);
    await syncTags(client, row.id, input.tags);

    return row.id;
  });

  const recipe = await findRecipeById(pool, recipeId);
  if (!recipe) {
    throw new Error("Recipe not found immediately after creation");
  }
  return recipe;
}

export async function findRecipeById(pool: Pool, id: number): Promise<Recipe | null> {
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const [recipe] = await assembleRecipes(pool, [row]);
  return recipe ?? null;
}

export async function findRecipeOwnerId(pool: Pool, id: number): Promise<number | null> {
  const result = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM recipes WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? row.user_id : null;
}

export interface RecipeFilters {
  tag?: string;
  /** Only recipes *directly* in this collection -- `"root"` means Home. */
  collection?: number | "root";
  /** Only recipes in this collection or anywhere beneath it. */
  within?: number;
}

/** Turns `RecipeFilters` into extra `AND ...` conditions for a
 * `SELECT ... FROM recipes WHERE user_id = $1 ...` query. `firstParamIndex`
 * is the next free `$n` placeholder in the caller's query, so fragments can
 * be appended without clashing with the caller's own parameters.
 *
 * Built by concatenation, not template literals -- these fragments are
 * themselves interpolated into the callers' query template literals. */
function filterClauses(
  filters: RecipeFilters,
  firstParamIndex: number,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown): string => {
    params.push(value);
    return "$" + (firstParamIndex + params.length - 1);
  };

  if (filters.tag) {
    // An `EXISTS` subquery rather than a `JOIN` against `recipe_tags`/`tags`
    // -- a join would multiply each matching recipe's row once per matching
    // tag, which would both double-count recipes tagged more than once and
    // disturb `ORDER BY` (search's `ts_rank` in particular).
    clauses.push(
      "AND EXISTS (" +
        " SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id" +
        " WHERE rt.recipe_id = recipes.id AND t.name = " +
        next(filters.tag) +
        ")",
    );
  }
  if (filters.collection === "root") {
    clauses.push("AND recipes.collection_id IS NULL");
  } else if (filters.collection !== undefined) {
    clauses.push("AND recipes.collection_id = " + next(filters.collection));
  }
  if (filters.within !== undefined) {
    // The same recursive-CTE tree walk `wouldCreateCycle` in
    // ./collections.ts documents: seed with the collection itself, then
    // repeatedly pull in the next level of children until none are left.
    clauses.push(
      "AND recipes.collection_id IN (" +
        " WITH RECURSIVE subtree AS (" +
        "   SELECT id FROM collections WHERE id = " +
        next(filters.within) +
        "   UNION" +
        "   SELECT c.id FROM collections c JOIN subtree s ON c.parent_id = s.id" +
        " ) SELECT id FROM subtree)",
    );
  }
  return { sql: clauses.join(" "), params };
}

export async function listRecipesByUser(
  pool: Pool,
  userId: number,
  filters: RecipeFilters = {},
): Promise<Recipe[]> {
  const filter = filterClauses(filters, 2);
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes
     WHERE user_id = $1 ${filter.sql}
     ORDER BY created_at DESC`,
    [userId, ...filter.params],
  );
  return assembleRecipes(pool, result.rows);
}

/** Moves a recipe to a different collection (or to Home, with `null`) -- the only way a recipe's
 * collection ever changes; `updateRecipe` below deliberately never touches
 * `collection_id`. No ownership checks here -- the route layer verifies both
 * the recipe and the target collection belong to the caller before calling
 * this. */
export async function moveRecipe(
  pool: Pool,
  id: number,
  collectionId: number | null,
): Promise<Recipe | null> {
  const result = await pool.query(`UPDATE recipes SET collection_id = $2 WHERE id = $1`, [
    id,
    collectionId,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return findRecipeById(pool, id);
}

export async function updateRecipe(
  pool: Pool,
  id: number,
  input: RecipeInput,
): Promise<Recipe | null> {
  const updated = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE recipes
       SET title = $2, description = $3, servings = $4, prep_time_minutes = $5, cook_time_minutes = $6,
           source_url = $7
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.title,
        input.description,
        input.servings,
        input.prepTimeMinutes,
        input.cookTimeMinutes,
        input.sourceUrl,
      ],
    );
    if (result.rows.length === 0) {
      return false;
    }

    await client.query(`DELETE FROM ingredients WHERE recipe_id = $1`, [id]);
    await client.query(`DELETE FROM steps WHERE recipe_id = $1`, [id]);
    await insertIngredients(client, id, input.ingredients);
    await insertSteps(client, id, input.steps);
    await syncTags(client, id, input.tags);

    return true;
  });

  if (!updated) {
    return null;
  }
  return findRecipeById(pool, id);
}

export async function deleteRecipe(pool: Pool, id: number): Promise<string[] | null> {
  return withTransaction(pool, async (client) => {
    const recipeResult = await client.query(`SELECT id FROM recipes WHERE id = $1`, [id]);
    if (recipeResult.rows.length === 0) {
      return null;
    }

    const imagesResult = await client.query<{ file_path: string }>(
      `DELETE FROM recipe_images WHERE recipe_id = $1 RETURNING file_path`,
      [id],
    );
    await client.query(`DELETE FROM recipes WHERE id = $1`, [id]);

    return imagesResult.rows.map((row) => row.file_path);
  });
}

export async function searchRecipes(
  pool: Pool,
  userId: number,
  query: string,
  filters: RecipeFilters = {},
): Promise<Recipe[]> {
  const filter = filterClauses(filters, 3);
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes
     WHERE user_id = $1 AND search_vector @@ plainto_tsquery('english', $2) ${filter.sql}
     ORDER BY ts_rank(search_vector, plainto_tsquery('english', $2)) DESC`,
    [userId, query, ...filter.params],
  );
  return assembleRecipes(pool, result.rows);
}

export async function addRecipeImage(
  pool: Pool,
  recipeId: number,
  filePath: string,
): Promise<RecipeImage> {
  const result = await pool.query<{ id: number; file_path: string; position: number }>(
    `INSERT INTO recipe_images (recipe_id, file_path, position)
     VALUES (
       $1, $2,
       COALESCE((SELECT MAX(position) + 1 FROM recipe_images WHERE recipe_id = $1), 0)
     )
     RETURNING id, file_path, position`,
    [recipeId, filePath],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into recipe_images returned no row");
  }
  return { id: row.id, filePath: row.file_path, position: row.position };
}

export async function getRecipeImage(
  pool: Pool,
  recipeId: number,
  imageId: number,
): Promise<{ filePath: string } | null> {
  const result = await pool.query<{ file_path: string }>(
    `SELECT file_path FROM recipe_images WHERE id = $1 AND recipe_id = $2`,
    [imageId, recipeId],
  );
  const row = result.rows[0];
  return row ? { filePath: row.file_path } : null;
}

export async function deleteRecipeImage(
  pool: Pool,
  recipeId: number,
  imageId: number,
): Promise<string | null> {
  const result = await pool.query<{ file_path: string }>(
    `DELETE FROM recipe_images WHERE id = $1 AND recipe_id = $2 RETURNING file_path`,
    [imageId, recipeId],
  );
  const row = result.rows[0];
  return row ? row.file_path : null;
}

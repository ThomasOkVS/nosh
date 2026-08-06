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
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  images: RecipeImage[];
}

interface RecipeRow {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  created_at: Date;
  updated_at: Date;
}

const RECIPE_COLUMNS = `
  id, user_id, title, description, servings, prep_time_minutes, cook_time_minutes,
  created_at, updated_at
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
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepTimeMinutes: row.prep_time_minutes,
    cookTimeMinutes: row.cook_time_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients,
    steps,
    tags,
    images,
  };
}

async function assembleRecipes(pool: Pool, rows: RecipeRow[]): Promise<Recipe[]> {
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
      `INSERT INTO recipes (user_id, title, description, servings, prep_time_minutes, cook_time_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        userId,
        input.title,
        input.description,
        input.servings,
        input.prepTimeMinutes,
        input.cookTimeMinutes,
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

export async function listRecipesByUser(pool: Pool, userId: number): Promise<Recipe[]> {
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return assembleRecipes(pool, result.rows);
}

export async function updateRecipe(
  pool: Pool,
  id: number,
  input: RecipeInput,
): Promise<Recipe | null> {
  const updated = await withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE recipes
       SET title = $2, description = $3, servings = $4, prep_time_minutes = $5, cook_time_minutes = $6
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.title,
        input.description,
        input.servings,
        input.prepTimeMinutes,
        input.cookTimeMinutes,
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

export async function searchRecipes(pool: Pool, userId: number, query: string): Promise<Recipe[]> {
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes
     WHERE user_id = $1 AND search_vector @@ plainto_tsquery('english', $2)
     ORDER BY ts_rank(search_vector, plainto_tsquery('english', $2)) DESC`,
    [userId, query],
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

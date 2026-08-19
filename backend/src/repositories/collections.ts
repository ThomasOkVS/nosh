import type { Pool } from "pg";
import { assembleRecipes, RECIPE_COLUMNS, type Recipe, type RecipeRow } from "./recipes";

export interface Collection {
  id: number;
  userId: number;
  name: string;
  createdAt: Date;
  recipeCount: number;
}

interface CollectionRow {
  id: number;
  user_id: number;
  name: string;
  created_at: Date;
  recipe_count: string;
}

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    // COUNT(...) comes back from `pg` as a string (Postgres bigint), since a
    // JS `number` can't safely represent every bigint value.
    recipeCount: Number(row.recipe_count),
  };
}

export async function listCollectionsByUser(pool: Pool, userId: number): Promise<Collection[]> {
  const result = await pool.query<CollectionRow>(
    `SELECT c.id, c.user_id, c.name, c.created_at, COUNT(rc.recipe_id) AS recipe_count
     FROM collections c
     LEFT JOIN recipe_collections rc ON rc.collection_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.name`,
    [userId],
  );
  return result.rows.map(toCollection);
}

export async function createCollection(pool: Pool, userId: number, name: string): Promise<Collection> {
  const result = await pool.query<{ id: number; user_id: number; name: string; created_at: Date }>(
    `INSERT INTO collections (user_id, name) VALUES ($1, $2)
     RETURNING id, user_id, name, created_at`,
    [userId, name],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into collections returned no row");
  }
  return { ...row, userId: row.user_id, createdAt: row.created_at, recipeCount: 0 };
}

export async function getCollectionById(pool: Pool, id: number): Promise<Collection | null> {
  const result = await pool.query<CollectionRow>(
    `SELECT c.id, c.user_id, c.name, c.created_at, COUNT(rc.recipe_id) AS recipe_count
     FROM collections c
     LEFT JOIN recipe_collections rc ON rc.collection_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  const row = result.rows[0];
  return row ? toCollection(row) : null;
}

export async function findCollectionOwnerId(pool: Pool, id: number): Promise<number | null> {
  const result = await pool.query<{ user_id: number }>(`SELECT user_id FROM collections WHERE id = $1`, [
    id,
  ]);
  const row = result.rows[0];
  return row ? row.user_id : null;
}

export async function renameCollection(
  pool: Pool,
  id: number,
  name: string,
): Promise<Collection | null> {
  const result = await pool.query<CollectionRow>(
    `UPDATE collections c SET name = $2
     WHERE c.id = $1
     RETURNING c.id, c.user_id, c.name, c.created_at,
       (SELECT COUNT(*) FROM recipe_collections rc WHERE rc.collection_id = c.id) AS recipe_count`,
    [id, name],
  );
  const row = result.rows[0];
  return row ? toCollection(row) : null;
}

export async function deleteCollection(pool: Pool, id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM collections WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listRecipesInCollection(pool: Pool, collectionId: number): Promise<Recipe[]> {
  const result = await pool.query<RecipeRow>(
    `SELECT ${RECIPE_COLUMNS} FROM recipes r
     JOIN recipe_collections rc ON rc.recipe_id = r.id
     WHERE rc.collection_id = $1
     ORDER BY r.created_at DESC`,
    [collectionId],
  );
  return assembleRecipes(pool, result.rows);
}

export async function addRecipeToCollection(
  pool: Pool,
  recipeId: number,
  collectionId: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO recipe_collections (recipe_id, collection_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [recipeId, collectionId],
  );
}

export async function removeRecipeFromCollection(
  pool: Pool,
  recipeId: number,
  collectionId: number,
): Promise<void> {
  await pool.query(`DELETE FROM recipe_collections WHERE recipe_id = $1 AND collection_id = $2`, [
    recipeId,
    collectionId,
  ]);
}

export async function listCollectionsForRecipe(
  pool: Pool,
  recipeId: number,
): Promise<{ id: number; name: string }[]> {
  const result = await pool.query<{ id: number; name: string }>(
    `SELECT c.id, c.name FROM collections c
     JOIN recipe_collections rc ON rc.collection_id = c.id
     WHERE rc.recipe_id = $1
     ORDER BY c.name`,
    [recipeId],
  );
  return result.rows;
}

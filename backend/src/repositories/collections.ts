import type { Pool } from "pg";

export interface Collection {
  id: number;
  userId: number;
  parentId: number | null;
  name: string;
  createdAt: Date;
  recipeCount: number;
}

interface CollectionRow {
  id: number;
  user_id: number;
  parent_id: number | null;
  name: string;
  created_at: Date;
  recipe_count: string;
}

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    // COUNT(...) comes back from `pg` as a string (Postgres bigint), since a
    // JS `number` can't safely represent every bigint value.
    recipeCount: Number(row.recipe_count),
  };
}

export async function listCollectionsByUser(pool: Pool, userId: number): Promise<Collection[]> {
  const result = await pool.query<CollectionRow>(
    `SELECT c.id, c.user_id, c.parent_id, c.name, c.created_at, COUNT(r.id) AS recipe_count
     FROM collections c
     LEFT JOIN recipes r ON r.collection_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.name`,
    [userId],
  );
  return result.rows.map(toCollection);
}

export async function createCollection(
  pool: Pool,
  userId: number,
  name: string,
  parentId: number | null,
): Promise<Collection> {
  const result = await pool.query<{
    id: number;
    user_id: number;
    parent_id: number | null;
    name: string;
    created_at: Date;
  }>(
    `INSERT INTO collections (user_id, parent_id, name) VALUES ($1, $2, $3)
     RETURNING id, user_id, parent_id, name, created_at`,
    [userId, parentId, name],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into collections returned no row");
  }
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    recipeCount: 0,
  };
}

export async function findCollectionOwnerId(pool: Pool, id: number): Promise<number | null> {
  const result = await pool.query<{ user_id: number }>(`SELECT user_id FROM collections WHERE id = $1`, [
    id,
  ]);
  const row = result.rows[0];
  return row ? row.user_id : null;
}

/** Renames and/or reparents a collection in one call -- editing a
 * collection's name and editing where it sits in the tree are really one
 * "edit collection" action, not two. Reparenting itself isn't validated for
 * cycles here -- callers must check `wouldCreateCycle` first, since only they
 * know whether `parentId` actually changed. */
export async function updateCollection(
  pool: Pool,
  id: number,
  input: { name: string; parentId: number | null },
): Promise<Collection | null> {
  const result = await pool.query<CollectionRow>(
    `UPDATE collections c SET name = $2, parent_id = $3
     WHERE c.id = $1
     RETURNING c.id, c.user_id, c.parent_id, c.name, c.created_at,
       (SELECT COUNT(*) FROM recipes r WHERE r.collection_id = c.id) AS recipe_count`,
    [id, input.name, input.parentId],
  );
  const row = result.rows[0];
  return row ? toCollection(row) : null;
}

/** Would moving collection `id` under `newParentId` create a cycle (make it
 * a descendant of itself, directly or transitively)?
 *
 * A recursive CTE is SQL's way of writing a loop: the first branch below
 * seeds the recursion with the collection itself, and the second branch
 * repeatedly joins the accumulating `descendants` result back onto
 * `collections` to pull in each next level down, until no new child rows are
 * found. It's the standard way to walk a tree of unknown depth in one round
 * trip instead of one query per level -- used here to make sure a reparent
 * never moves a collection underneath its own descendant, which would
 * disconnect that whole branch from the tree. `UNION` (not `UNION ALL`)
 * de-duplicates rows as they're found, which also keeps this safe even
 * against a cycle that somehow already existed. */
export async function wouldCreateCycle(
  pool: Pool,
  id: number,
  newParentId: number,
): Promise<boolean> {
  const result = await pool.query<{ would_cycle: boolean }>(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM collections WHERE id = $1
       UNION
       SELECT c.id FROM collections c JOIN descendants d ON c.parent_id = d.id
     )
     SELECT $2 = ANY(SELECT id FROM descendants) AS would_cycle`,
    [id, newParentId],
  );
  return result.rows[0]?.would_cycle ?? false;
}

/** Every image file path anywhere in a collection's subtree (itself plus
 * every nested sub-collection, recursively). Deleting a collection cascades
 * at the database level -- Postgres removes the collection, sub-collection,
 * recipe, and recipe_images *rows* in one statement via the `ON DELETE
 * CASCADE` chain -- but that cascade never touches the filesystem, so the
 * caller must collect these paths *before* deleting (the rows won't exist to
 * query afterward) and unlink the actual files itself. */
export async function getCollectionSubtreeImagePaths(pool: Pool, id: number): Promise<string[]> {
  const result = await pool.query<{ file_path: string }>(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM collections WHERE id = $1
       UNION
       SELECT c.id FROM collections c JOIN subtree s ON c.parent_id = s.id
     )
     SELECT ri.file_path
     FROM recipe_images ri
     JOIN recipes r ON r.id = ri.recipe_id
     WHERE r.collection_id IN (SELECT id FROM subtree)`,
    [id],
  );
  return result.rows.map((row) => row.file_path);
}

export async function deleteCollection(pool: Pool, id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM collections WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

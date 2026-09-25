import type { Pool } from "pg";
import type { ImportStage } from "../services/recipeExtraction";
import type { RecipeInput } from "../validation/recipes";

export type ImportJobStatus = "running" | "done" | "error" | "cancelled";

export interface ImportJob {
  id: number;
  userId: number;
  url: string;
  /** The folder to pre-file the recipe in (`null` = Home). */
  collectionId: number | null;
  status: ImportJobStatus;
  seenStages: ImportStage[];
  recipe: RecipeInput | null;
  imageUrl: string | null;
  /** Translation was wanted but couldn't happen; the recipe is in its
   * original language. */
  translationSkipped: boolean;
  errorStatus: number | null;
  errorMessage: string | null;
  reviewed: boolean;
  createdAt: string;
}

interface ImportJobRow {
  id: number;
  user_id: number;
  url: string;
  collection_id: number | null;
  status: ImportJobStatus;
  seen_stages: ImportStage[];
  recipe: RecipeInput | null;
  image_url: string | null;
  translation_skipped: boolean;
  error_status: number | null;
  error_message: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

const COLUMNS = `id, user_id, url, collection_id, status, seen_stages, recipe, image_url,
  translation_skipped, error_status, error_message, reviewed_at, created_at`;

function toImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    collectionId: row.collection_id,
    status: row.status,
    seenStages: row.seen_stages,
    recipe: row.recipe,
    imageUrl: row.image_url,
    translationSkipped: row.translation_skipped,
    errorStatus: row.error_status,
    errorMessage: row.error_message,
    reviewed: row.reviewed_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createImportJob(
  pool: Pool,
  userId: number,
  url: string,
  collectionId: number | null,
): Promise<ImportJob> {
  const result = await pool.query<ImportJobRow>(
    `INSERT INTO import_jobs (user_id, url, collection_id) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [userId, url, collectionId],
  );
  return toImportJob(result.rows[0]!);
}

/** Scoped to the owner: another user's job id reads as "not found", the same
 * way recipe routes treat ids they don't own. */
export async function findImportJob(pool: Pool, userId: number, id: number): Promise<ImportJob | null> {
  const result = await pool.query<ImportJobRow>(
    `SELECT ${COLUMNS} FROM import_jobs WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = result.rows[0];
  return row ? toImportJob(row) : null;
}

/** Jobs the app should still surface on launch: running ones, and finished
 * ones the user hasn't saved or dismissed yet. Cancelled jobs are never
 * pending — the user already chose to drop them. */
export async function listPendingImportJobs(pool: Pool, userId: number): Promise<ImportJob[]> {
  const result = await pool.query<ImportJobRow>(
    `SELECT ${COLUMNS} FROM import_jobs
     WHERE user_id = $1 AND reviewed_at IS NULL AND status <> 'cancelled'
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(toImportJob);
}

/** Only ever moves a *running* job forward — a job cancelled while its
 * extraction was still in flight must not be resurrected by a late write. */
export async function appendImportJobStage(pool: Pool, id: number, stage: ImportStage): Promise<void> {
  await pool.query(
    `UPDATE import_jobs SET seen_stages = array_append(seen_stages, $2), updated_at = now()
     WHERE id = $1 AND status = 'running'`,
    [id, stage],
  );
}

export async function completeImportJob(
  pool: Pool,
  id: number,
  recipe: RecipeInput,
  imageUrl: string | null,
  translationSkipped = false,
): Promise<ImportJob | null> {
  const result = await pool.query<ImportJobRow>(
    `UPDATE import_jobs
     SET status = 'done', recipe = $2, image_url = $3, translation_skipped = $4, updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING ${COLUMNS}`,
    [id, JSON.stringify(recipe), imageUrl, translationSkipped],
  );
  const row = result.rows[0];
  return row ? toImportJob(row) : null;
}

export async function failImportJob(
  pool: Pool,
  id: number,
  errorStatus: number,
  errorMessage: string,
): Promise<ImportJob | null> {
  const result = await pool.query<ImportJobRow>(
    `UPDATE import_jobs SET status = 'error', error_status = $2, error_message = $3, updated_at = now()
     WHERE id = $1 AND status = 'running' RETURNING ${COLUMNS}`,
    [id, errorStatus, errorMessage],
  );
  const row = result.rows[0];
  return row ? toImportJob(row) : null;
}

/** Returns whether a running job was actually cancelled (false if it had
 * already finished, or isn't the user's). */
export async function cancelImportJob(pool: Pool, userId: number, id: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE import_jobs SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'running'`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markImportJobReviewed(pool: Pool, userId: number, id: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE import_jobs SET reviewed_at = COALESCE(reviewed_at, now()), updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Run once at boot. Jobs run in-process, so any row still `running` when
 * the server starts belongs to a process that no longer exists (a deploy, a
 * Watchtower update, a crash) and will never finish — without this it would
 * spin in the UI forever. Also prunes old finished jobs so the table
 * doesn't grow without bound; a week is far longer than anyone waits to
 * review an import.
 */
export async function recoverImportJobs(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE import_jobs
     SET status = 'error', error_status = 500,
         error_message = 'The import was interrupted by a server restart — please try again',
         updated_at = now()
     WHERE status = 'running'`,
  );
  await pool.query(
    `DELETE FROM import_jobs WHERE status <> 'running' AND updated_at < now() - interval '7 days'`,
  );
}

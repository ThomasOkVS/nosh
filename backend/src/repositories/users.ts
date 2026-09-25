import type { Pool } from "pg";
import { DEFAULT_UNIT_PREFERENCES, type RecipeLanguage, type UnitPreferences } from "@nosh/units";

export interface User {
  id: number;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

interface UserRow {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export async function createUser(
  pool: Pool,
  email: string,
  username: string,
  passwordHash: string,
): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, username, password_hash, created_at`,
    [email, username, passwordHash],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Insert into users returned no row");
  }
  return toUser(row);
}

export async function findUserByEmail(pool: Pool, email: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, username, password_hash, created_at FROM users WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function findUserByUsername(pool: Pool, username: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, username, password_hash, created_at FROM users WHERE username = $1`,
    [username],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

/** The user's saved magic-import model, or null for "automatic". */
export async function findImportModel(pool: Pool, userId: number): Promise<string | null> {
  const result = await pool.query<{ import_model: string | null }>(
    `SELECT import_model FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0]?.import_model ?? null;
}

export async function setImportModel(
  pool: Pool,
  userId: number,
  model: string | null,
): Promise<void> {
  await pool.query(`UPDATE users SET import_model = $2 WHERE id = $1`, [userId, model]);
}

/** What a user's recipes are shown (and imported) in. */
export interface RecipePreferences extends UnitPreferences {
  /** Language imports are translated into; null = keep the original. */
  language: RecipeLanguage | null;
}

interface RecipePreferencesRow {
  recipe_language: RecipeLanguage | null;
  unit_system: UnitPreferences["unitSystem"];
  temperature_unit: UnitPreferences["temperatureUnit"];
  keep_spoons: boolean;
}

export async function findRecipePreferences(
  pool: Pool,
  userId: number,
): Promise<RecipePreferences> {
  const result = await pool.query<RecipePreferencesRow>(
    `SELECT recipe_language, unit_system, temperature_unit, keep_spoons FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return { language: null, ...DEFAULT_UNIT_PREFERENCES };
  return {
    language: row.recipe_language,
    unitSystem: row.unit_system,
    temperatureUnit: row.temperature_unit,
    keepSpoons: row.keep_spoons,
  };
}

/** Updates only the fields present in `changes`. */
export async function updateRecipePreferences(
  pool: Pool,
  userId: number,
  changes: Partial<RecipePreferences>,
): Promise<void> {
  const columns: Record<keyof RecipePreferences, string> = {
    language: "recipe_language",
    unitSystem: "unit_system",
    temperatureUnit: "temperature_unit",
    keepSpoons: "keep_spoons",
  };
  const sets: string[] = [];
  const values: unknown[] = [userId];
  for (const key of Object.keys(columns) as (keyof RecipePreferences)[]) {
    if (changes[key] === undefined) continue;
    values.push(changes[key]);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (sets.length === 0) return;
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, values);
}

export async function findUserById(pool: Pool, id: number): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, username, password_hash, created_at FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

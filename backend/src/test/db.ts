import { Pool } from "pg";
import { createPool } from "../db/pool";
import { migrateDatabase } from "./migrate";

const ALL_TABLES = [
  "recipe_images",
  "recipe_tags",
  "tags",
  "steps",
  "ingredients",
  "recipes",
  "users",
];

export function getTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? "postgres://nosh:nosh@localhost:5432/nosh_test";
}

let pool: Pool | undefined;

export function getTestPool(): Pool {
  pool ??= createPool(getTestDatabaseUrl());
  return pool;
}

export function setupTestDatabase(): void {
  migrateDatabase(getTestDatabaseUrl());
}

export async function truncateAllTables(): Promise<void> {
  await getTestPool().query(`TRUNCATE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeTestPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

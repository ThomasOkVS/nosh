import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Db } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://nosh:nosh@localhost:5433/nosh_test";
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Connects to the test database and applies migrations (a missing or empty
 * migrations folder is fine until the first migration is generated). */
export async function getTestDb(): Promise<{ db: Db; close(): Promise<void> }> {
  const handle = createDb(TEST_URL);
  if (existsSync(migrationsFolder) && readdirSync(migrationsFolder).length > 0) {
    await migrate(handle.db, { migrationsFolder });
  }
  return handle;
}

/** Truncates every app table, restarting identities. */
export async function resetDb(db: Db): Promise<void> {
  const tables = Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => sql.identifier(getTableName(table)));
  if (tables.length === 0) return;
  await db.execute(sql`truncate table ${sql.join(tables, sql`, `)} restart identity cascade`);
}

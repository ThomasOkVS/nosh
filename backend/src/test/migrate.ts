import { spawnSync } from "node:child_process";
import path from "node:path";

const backendRoot = path.join(__dirname, "../..");
const migrateBin = path.join(backendRoot, "node_modules/node-pg-migrate/bin/node-pg-migrate.js");

export function migrateDatabase(databaseUrl: string): void {
  const result = spawnSync(process.execPath, [migrateBin, "up"], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("node-pg-migrate up failed for test database");
  }
}

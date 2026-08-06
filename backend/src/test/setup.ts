import { afterAll, beforeAll, beforeEach } from "vitest";
import { closeTestPool, setupTestDatabase, truncateAllTables } from "./db";

beforeAll(() => {
  setupTestDatabase();
});

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await closeTestPool();
});

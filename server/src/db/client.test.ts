import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getTestDb } from "../../test/db.js";

const handle = await getTestDb();
afterAll(() => handle.close());

describe("db client", () => {
  it("connects to the test database", async () => {
    const rows = await handle.db.execute<{ one: number }>(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });
});

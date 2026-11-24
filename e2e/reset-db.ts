import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL ?? "postgres://nosh:nosh@localhost:5433/nosh_test";

/** Empties the account tables so each test starts with no owner. */
export async function resetAccounts(): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await sql`truncate table users, sessions restart identity cascade`;
  } finally {
    await sql.end();
  }
}

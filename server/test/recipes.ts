import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { createAuthService } from "../src/auth/service.js";
import { loadConfig } from "../src/config/env.js";
import type { Db } from "../src/db/client.js";
import { sessions, users } from "../src/db/schema.js";
import { createImageStore } from "../src/images/store.js";
import { getTestDb, resetDb } from "./db.js";

const SECRET = "test-session-secret-test-session-secret";
const COOKIE = "nosh.sid";

export type Headers = Record<string, string>;

/**
 * A real app on the test database with an image store in a temp dir. Call once at
 * the top of a test file: it resets the database before each test and closes it
 * (and removes the temp dir) afterwards.
 */
export async function makeRecipeApp() {
  const handle = await getTestDb();
  const { db } = handle;
  const uploadsDir = await mkdtemp(join(tmpdir(), "nosh-recipes-"));
  const config = loadConfig({ DATABASE_URL: "postgres://unused" });
  const app = createApp({
    config,
    auth: createAuthService({ db, sessionSecret: SECRET }),
    db,
    images: createImageStore(uploadsDir),
    getPeer: () => "127.0.0.1",
    failureDelayMs: 0,
  });
  beforeEach(() => resetDb(db));
  afterAll(async () => {
    await handle.close();
    await rm(uploadsDir, { recursive: true, force: true });
  });
  return { app, db, uploadsDir };
}

/** Inserts a user with a live session and returns the cookie header for it (no argon2 cost). */
export async function signedInHeaders(db: Db, username = "alice"): Promise<Headers> {
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: "unused" })
    .returning({ id: users.id });
  if (!user) throw new Error("user insert failed");
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: createHmac("sha256", SECRET).update(token).digest("hex"),
    userId: user.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { cookie: `${COOKIE}=${token}` };
}

type App = Awaited<ReturnType<typeof makeRecipeApp>>["app"];

/** POSTs a recipe body as JSON with the given session. */
export function createRecipe(app: App, headers: Headers, body: unknown) {
  return app.request("/api/recipes", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

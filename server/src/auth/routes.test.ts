import { count, eq } from "drizzle-orm";
import { hc } from "hono/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb, resetDb } from "../../test/db.js";
import { createApp, type AppType } from "../app.js";
import { loadConfig } from "../config/env.js";
import { users } from "../db/schema.js";
import { hashPassword } from "./password.js";
import { DEFAULT_FAILURE_DELAY_MS } from "./routes.js";
import { createAuthService } from "./service.js";

// Real argon2 runs on every login here; 20+ of them can pass Vitest's 5 s default.
vi.setConfig({ testTimeout: 30_000 });

const handle = await getTestDb();
const { db } = handle;
afterAll(() => handle.close());

const PROXY = "172.20.0.2";
const SECRET = "test-session-secret-test-session-secret";
const COOKIE = "nosh.sid";
const NOT_AUTHENTICATED = { error: "Not authenticated" };
const BAD_CREDENTIALS = { error: "Invalid username or password" };
const TOO_MANY = { error: "Too many attempts — try again later" };

function makeApp(opts: { allowSignup?: boolean; failureDelayMs?: number } = {}) {
  const config = loadConfig({
    DATABASE_URL: "postgres://unused",
    TRUSTED_PROXIES: PROXY,
    ALLOW_SIGNUP: opts.allowSignup ? "true" : undefined,
  });
  const app = createApp({
    config,
    auth: createAuthService({ db, sessionSecret: SECRET }),
    getPeer: (c) => c.req.header("x-test-peer") ?? "127.0.0.1",
    failureDelayMs: opts.failureDelayMs ?? 0,
  });
  // The client wraps app.request, so the RPC types are exercised as well.
  return { app, client: hc<AppType>("http://localhost", { fetch: app.request }) };
}

type App = ReturnType<typeof makeApp>["app"];

function postJson(app: App, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** The session token from a response's Set-Cookie, or undefined. */
function sessionToken(res: Response): string | undefined {
  const header = res.headers.get("set-cookie") ?? "";
  const match = new RegExp(`(?:^|, )${COOKIE.replace(".", "\\.")}=([^;]*)`).exec(header);
  const value = match?.[1];
  return value === undefined || value === "" ? undefined : value;
}

function withSession(token: string): Record<string, string> {
  return { cookie: `${COOKIE}=${token}` };
}

async function createUser(username: string, password: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash: await hashPassword(password) })
    .returning({ id: users.id });
  if (!row) throw new Error("insert failed");
  return row.id;
}

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

async function logIn(app: App, username: string, password: string, headers: Record<string, string> = {}) {
  return postJson(app, "/api/auth/login", { username, password }, headers);
}

beforeEach(async () => {
  await resetDb(db);
});

describe("signup", () => {
  it("AUTH-01: creates the account, answers 201 {id, username}, and starts a session", async () => {
    const { app } = makeApp({ allowSignup: true });
    const res = await postJson(app, "/api/auth/signup", { username: "alice", password: "pw" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["id", "username"]);
    expect(body.username).toBe("alice");
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("email");

    const token = sessionToken(res);
    expect(token).toBeDefined();
    const me = await app.request("/api/auth/me", { headers: withSession(token ?? "") });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual(body);
  });

  it("AUTH-02 SEC-15: refuses with 403 when sign-ups are off, creates nothing, sets no cookie", async () => {
    await createUser("existing", "secret");
    const { app } = makeApp({ allowSignup: false });
    const res = await postJson(app, "/api/auth/signup", { username: "alice", password: "pw" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Sign-ups are disabled on this server" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await userCount()).toBe(1);

    const later = await logIn(app, "alice", "pw");
    expect(later.status).toBe(401);
    const existing = await logIn(app, "existing", "secret");
    expect(existing.status).toBe(200);
  });

  it.each([
    ["ab", "Username must be at least 3 characters"],
    ["a".repeat(33), "Username must be at most 32 characters"],
    ["bad name!", "Username can only contain letters, numbers, and underscores"],
  ])("AUTH-03: rejects username %j with 400 and its message", async (username, message) => {
    const { app } = makeApp({ allowSignup: true });
    const res = await postJson(app, "/api/auth/signup", { username, password: "pw" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: message });
    expect(await userCount()).toBe(0);
  });

  it("AUTH-03: stores a valid username trimmed", async () => {
    const { app } = makeApp({ allowSignup: true });
    const res = await postJson(app, "/api/auth/signup", { username: "  alice  ", password: "pw" });
    expect(res.status).toBe(201);
    const [row] = await db.select({ username: users.username }).from(users);
    expect(row?.username).toBe("alice");
  });

  it("AUTH-05: accepts a two-character password and refuses an empty one", async () => {
    const { app } = makeApp({ allowSignup: true });
    const ok = await postJson(app, "/api/auth/signup", { username: "alice", password: "pw" });
    expect(ok.status).toBe(201);
    const empty = await postJson(app, "/api/auth/signup", { username: "bob", password: "" });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Password is required" });
  });

  it("AUTH-06: refuses Alice when alice exists with 409 and no cookie", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp({ allowSignup: true });
    const res = await postJson(app, "/api/auth/signup", { username: "Alice", password: "pw" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Username already taken" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await userCount()).toBe(1);
  });

  it("AUTH-11 SEC-12: sign-up replaces a session cookie the browser already holds", async () => {
    const { app } = makeApp({ allowSignup: true });
    const res = await postJson(
      app,
      "/api/auth/signup",
      { username: "alice", password: "pw" },
      withSession("planted-token"),
    );
    expect(res.status).toBe(201);
    const token = sessionToken(res);
    expect(token).toBeDefined();
    expect(token).not.toBe("planted-token");
  });

  it("SEC-20: the 6th sign-up attempt from one IP in an hour gets 429, valid or not", async () => {
    const { app } = makeApp({ allowSignup: true });
    const attempts = [
      { username: "ab", password: "pw" },
      { username: "user_1", password: "pw" },
      { username: "user_1", password: "pw" },
      { username: "user_2", password: "" },
      { username: "user_3", password: "pw" },
    ];
    for (const body of attempts) {
      const res = await postJson(app, "/api/auth/signup", body);
      expect(res.status).not.toBe(429);
    }
    const sixth = await postJson(app, "/api/auth/signup", { username: "user_4", password: "pw" });
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual(TOO_MANY);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("SEC-20: with sign-ups off the answer stays 403, however often it is tried", async () => {
    const { app } = makeApp({ allowSignup: false });
    for (let i = 0; i < 10; i += 1) {
      const res = await postJson(app, "/api/auth/signup", { username: `user_${i}`, password: "pw" });
      expect(res.status).toBe(403);
    }
  });
});

describe("login", () => {
  it("AUTH-07: logs in ignoring case and answers the username as stored", async () => {
    const id = await createUser("alice", "secret");
    const { app } = makeApp();
    const res = await logIn(app, "ALICE", "secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, username: "alice" });
    const token = sessionToken(res);
    expect(token).toBeDefined();
    const me = await app.request("/api/auth/me", { headers: withSession(token ?? "") });
    expect(await me.json()).toEqual({ id, username: "alice" });
  });

  it("AUTH-09 SEC-19: a wrong password and an unknown username get byte-identical 401s", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    const wrong = await logIn(app, "alice", "nope");
    const unknown = await logIn(app, "nobody", "nope");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const wrongText = await wrong.text();
    expect(wrongText).toBe(await unknown.text());
    expect(JSON.parse(wrongText)).toEqual(BAD_CREDENTIALS);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect(unknown.headers.get("set-cookie")).toBeNull();
  });

  it("AUTH-09 SEC-19: both failures are delayed by the failure delay", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp({ failureDelayMs: 1000 });
    for (const username of ["alice", "nobody"]) {
      const started = performance.now();
      const res = await logIn(app, username, "nope");
      expect(res.status).toBe(401);
      expect(performance.now() - started).toBeGreaterThanOrEqual(1000);
    }
  });

  it("SEC-19: without a failureDelayMs option a failed login waits one second", async () => {
    expect(DEFAULT_FAILURE_DELAY_MS).toBe(1000);
    const app = createApp({
      config: loadConfig({ DATABASE_URL: "postgres://unused", TRUSTED_PROXIES: PROXY }),
      auth: createAuthService({ db, sessionSecret: SECRET }),
      getPeer: () => "127.0.0.1",
    });
    const started = performance.now();
    const res = await logIn(app, "nobody", "nope");
    expect(res.status).toBe(401);
    expect(performance.now() - started).toBeGreaterThanOrEqual(1000);
  });

  it.each([
    ["missing username", { password: "pw" }, "Username is required"],
    ["blank username", { username: "   ", password: "pw" }, "Username is required"],
    ["missing password", { username: "alice" }, "Password is required"],
    ["empty password", { username: "alice", password: "" }, "Password is required"],
  ])("AUTH-10: %s → 400 without the failure delay", async (_name, body, message) => {
    const { app } = makeApp({ failureDelayMs: 1000 });
    const started = performance.now();
    const res = await postJson(app, "/api/auth/login", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: message });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("AUTH-10: a stored name outside the sign-up rules (john.doe_3) logs in", async () => {
    await createUser("john.doe_3", "secret");
    const { app } = makeApp();
    const res = await logIn(app, "john.doe_3", "secret");
    expect(res.status).toBe(200);
  });

  it("AUTH-11 SEC-12: login replaces a session cookie the browser already holds", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    const first = sessionToken(await logIn(app, "alice", "secret"));
    expect(first).toBeDefined();
    const second = await logIn(app, "alice", "secret", withSession(first ?? ""));
    expect(second.status).toBe(200);
    const token = sessionToken(second);
    expect(token).toBeDefined();
    expect(token).not.toBe(first);
  });
});

describe("me and logout", () => {
  it("AUTH-13: /me without a cookie → 401", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(NOT_AUTHENTICATED);
  });

  it("AUTH-13: /me with the cookie of a deleted user → 401", async () => {
    const id = await createUser("alice", "secret");
    const { app } = makeApp();
    const token = sessionToken(await logIn(app, "alice", "secret"));
    await db.delete(users).where(eq(users.id, id));
    const res = await app.request("/api/auth/me", { headers: withSession(token ?? "") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(NOT_AUTHENTICATED);
  });

  it("AUTH-14 SEC-10: logout answers 204 with a clearing cookie and ends the session", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    const token = sessionToken(await logIn(app, "alice", "secret")) ?? "";
    const res = await app.request("/api/auth/logout", { method: "POST", headers: withSession(token) });
    expect(res.status).toBe(204);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/^nosh\.sid=;/);
    expect(cleared).toMatch(/Max-Age=0/);
    const me = await app.request("/api/auth/me", { headers: withSession(token) });
    expect(me.status).toBe(401);
  });

  it("AUTH-14: logout without a session still answers 204", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
  });
});

describe("requireAuth", () => {
  it("AUTH-15 SEC-23: any other /api route needs a session", async () => {
    const { app } = makeApp();
    for (const path of ["/api/anything", "/api/recipes", "/api/auth/other"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(NOT_AUTHENTICATED);
    }
  });

  it("AUTH-15 SEC-28: with a session an unknown /api route is a JSON 404", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    const token = sessionToken(await logIn(app, "alice", "secret")) ?? "";
    const res = await app.request("/api/anything", { headers: withSession(token) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("SEC-23: /health stays open", async () => {
    const { app } = makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});

describe("login rate limits", () => {
  it("SEC-17: the 21st login from one IP in 15 minutes gets 429; another IP does not; 400s do not count", async () => {
    const { app } = makeApp();
    const ipA = { "x-test-peer": "198.51.100.1" };
    for (let i = 0; i < 5; i += 1) {
      const invalid = await postJson(app, "/api/auth/login", { username: "" }, ipA);
      expect(invalid.status).toBe(400);
    }
    for (let i = 0; i < 20; i += 1) {
      const res = await logIn(app, `user_${i}`, "wrong", ipA);
      expect(res.status).toBe(401);
    }
    const blocked = await logIn(app, "user_20", "wrong", ipA);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual(TOO_MANY);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const ipB = await logIn(app, "user_20", "wrong", { "x-test-peer": "198.51.100.2" });
    expect(ipB.status).toBe(401);
  });

  it("SEC-18: 10 failures for one account over 10 IPs block the 11th, even with the right password", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    for (let i = 0; i < 10; i += 1) {
      const res = await logIn(app, i % 2 === 0 ? "alice" : "ALICE", "wrong", { "x-test-peer": `198.51.100.${i}` });
      expect(res.status).toBe(401);
    }
    const res = await logIn(app, "alice", "secret", { "x-test-peer": "198.51.100.99" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual(TOO_MANY);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("SEC-18: a success after 9 failures clears the account's count", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    for (let i = 0; i < 9; i += 1) {
      expect((await logIn(app, "alice", "wrong", { "x-test-peer": `198.51.100.${i}` })).status).toBe(401);
    }
    expect((await logIn(app, "alice", "secret", { "x-test-peer": "198.51.100.50" })).status).toBe(200);
    for (let i = 0; i < 9; i += 1) {
      expect((await logIn(app, "alice", "wrong", { "x-test-peer": `198.51.100.${i}` })).status).toBe(401);
    }
    expect((await logIn(app, "alice", "secret", { "x-test-peer": "198.51.100.51" })).status).toBe(200);
  });

  it("SEC-18: parallel wrong guesses for one account cannot exceed 10 between them", async () => {
    await createUser("alice", "secret");
    const { app } = makeApp();
    const responses = await Promise.all(
      Array.from({ length: 15 }, (_, i) => logIn(app, "alice", "wrong", { "x-test-peer": `198.51.100.${i}` })),
    );
    const statuses = responses.map((res) => res.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("SEC-18: spellings that reach the same account share one counter, also outside ASCII", async () => {
    // Postgres lower('İRIS') is 'iris', but JS 'İRIS'.toLowerCase() is
    // 'i̇ris' (i + combining dot): a JS-folded key would split the buckets.
    await createUser("iris", "secret");
    const { app } = makeApp();
    expect((await logIn(app, "İRIS", "secret")).status).toBe(200); // the same account
    for (let i = 0; i < 10; i += 1) {
      const res = await logIn(app, i % 2 === 0 ? "iris" : "İRIS", "wrong", { "x-test-peer": `198.51.100.${i}` });
      expect(res.status).toBe(401);
    }
    for (const spelling of ["iris", "İRIS"]) {
      const res = await logIn(app, spelling, "secret", { "x-test-peer": "198.51.100.99" });
      expect(res.status).toBe(429);
    }
  });

  it("SEC-18: unknown usernames are counted too, so a 429 does not reveal whether a name exists", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i += 1) {
      expect((await logIn(app, "ghost", "wrong", { "x-test-peer": `198.51.100.${i}` })).status).toBe(401);
    }
    expect((await logIn(app, "GHOST", "wrong", { "x-test-peer": "198.51.100.99" })).status).toBe(429);
  });

  it("SEC-13: behind the trusted proxy each forwarded client has its own bucket", async () => {
    const { app } = makeApp();
    const via = (client: string) => ({ "x-test-peer": PROXY, "x-forwarded-for": client });
    for (let i = 0; i < 20; i += 1) {
      expect((await logIn(app, `user_${i}`, "wrong", via("203.0.113.1"))).status).toBe(401);
    }
    expect((await logIn(app, "user_x", "wrong", via("203.0.113.1"))).status).toBe(429);
    expect((await logIn(app, "user_x", "wrong", via("203.0.113.2"))).status).toBe(401);
  });

  it("SEC-13: from an untrusted peer a spoofed X-Forwarded-For does not reset the bucket", async () => {
    const { app } = makeApp();
    const peer = "198.51.100.7";
    for (let i = 0; i < 20; i += 1) {
      const res = await logIn(app, `user_${i}`, "wrong", { "x-test-peer": peer, "x-forwarded-for": `203.0.113.${i}` });
      expect(res.status).toBe(401);
    }
    const spoofed = await logIn(app, "user_x", "wrong", { "x-test-peer": peer, "x-forwarded-for": "203.0.113.200" });
    expect(spoofed.status).toBe(429);
  });
});

describe("RPC types", () => {
  it("the typed client reaches the auth routes", async () => {
    await createUser("alice", "secret");
    const { client } = makeApp();
    const res = await client.api.auth.login.$post({ json: { username: "alice", password: "secret" } });
    expect(res.status).toBe(200);
    if (res.status === 200) {
      const user = await res.json();
      expect(user.username).toBe("alice");
    }
  });
});

import argon2 from "argon2";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { V1_ACCOUNT } from "../../test/fixtures/v1-account.js";
import { getTestDb, resetDb } from "../../test/db.js";
import { sessions, users } from "../db/schema.js";
import { hashPassword } from "./password.js";
import {
  createAuthService,
  SESSION_TTL_MS,
  type AuthService,
  type IssuedSession,
} from "./service.js";

const handle = await getTestDb();
const { db } = handle;
afterAll(() => handle.close());

const SECRET = "test-session-secret-test-session-secret";
const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-11-24T12:00:00.000Z");

let clock = START;
let auth: AuthService;

beforeEach(async () => {
  await resetDb(db);
  clock = START;
  auth = createAuthService({ db, sessionSecret: SECRET, now: () => clock });
});

function issued(result: IssuedSession | { error: "username_taken" } | null): IssuedSession {
  if (result === null || "error" in result) {
    throw new Error(`expected a session, got ${JSON.stringify(result)}`);
  }
  return result;
}

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

describe("AuthService contract", () => {
  it("AUTH-01 AUTH-23: sign-up needs only username and password and stores no email", async () => {
    const session = issued(await auth.signUp({ username: "alice", password: "pw" }));
    expect(session.user.username).toBe("alice");
    expect(await auth.getSession(session.token)).toEqual({
      user: session.user,
      expiresAt: session.expiresAt,
    });
    const [row] = await db.select().from(users).where(eq(users.id, session.user.id));
    expect(row?.email).toBeNull();
  });

  it("AUTH-05: a two-character password signs up", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    issued(await auth.logIn({ username: "alice", password: "pw" }));
  });

  it("AUTH-05: a 1,000-character password signs up and logs in", async () => {
    const password = "p".repeat(1000);
    issued(await auth.signUp({ username: "alice", password }));
    issued(await auth.logIn({ username: "alice", password }));
  });

  it("AUTH-03: a 32-character username is stored as given", async () => {
    const username = "a".repeat(32);
    const session = issued(await auth.signUp({ username, password: "pw" }));
    const [row] = await db.select().from(users).where(eq(users.id, session.user.id));
    expect(row?.username).toBe(username);
  });

  it("AUTH-06: Alice is taken when alice exists", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    expect(await auth.signUp({ username: "Alice", password: "other" })).toEqual({
      error: "username_taken",
    });
    expect(await userCount()).toBe(1);
  });

  it("AUTH-06: concurrent Alice and alice — exactly one wins", async () => {
    const results = await Promise.all([
      auth.signUp({ username: "Alice", password: "pw" }),
      auth.signUp({ username: "alice", password: "pw" }),
    ]);
    expect(results.filter((r) => "token" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r)).toEqual([{ error: "username_taken" }]);
    expect(await userCount()).toBe(1);
  });

  it("AUTH-07: ALICE logs in as alice and gets the stored username", async () => {
    const signedUp = issued(await auth.signUp({ username: "Alice", password: "pw" }));
    const session = issued(await auth.logIn({ username: "ALICE", password: "pw" }));
    expect(session.user).toEqual({ id: signedUp.user.id, username: "Alice" });
  });

  it("AUTH-10: a stored username that breaks sign-up rules logs in", async () => {
    await db
      .insert(users)
      .values({ username: "john.doe_3", passwordHash: await hashPassword("pw") });
    const session = issued(await auth.logIn({ username: "john.doe_3", password: "pw" }));
    expect(session.user.username).toBe("john.doe_3");
  });

  it("AUTH-08: the imported v1 account logs in with its current password", async () => {
    await db.insert(users).values({
      username: V1_ACCOUNT.username,
      email: V1_ACCOUNT.email,
      passwordHash: V1_ACCOUNT.passwordHash,
    });
    const session = issued(
      await auth.logIn({ username: "owner_1", password: V1_ACCOUNT.password }),
    );
    expect(session.user.username).toBe("Owner_1");
    const [row] = await db.select().from(users);
    expect(row?.passwordHash).toBe(V1_ACCOUNT.passwordHash);
    expect(row?.email).toBe(V1_ACCOUNT.email);
  });

  it("AUTH-09: wrong password and unknown username both return null", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    expect(await auth.logIn({ username: "alice", password: "wrong" })).toBeNull();
    expect(await auth.logIn({ username: "nobody", password: "pw" })).toBeNull();
    const [row] = await db.select({ n: count() }).from(sessions);
    expect(row?.n).toBe(1); // only the sign-up session
  });

  it("SEC-18: accountKey folds like the lookup, so every spelling that logs in shares a key", async () => {
    issued(await auth.signUp({ username: "iris", password: "pw" }));
    for (const spelling of ["iris", "IRIS", "İRIS", "İris"]) {
      expect(issued(await auth.logIn({ username: spelling, password: "pw" })).user.username).toBe("iris");
      expect(await auth.accountKey(spelling)).toBe(await auth.accountKey("iris"));
    }
    expect(await auth.accountKey("ΑΣ")).toBe(await auth.accountKey("ασ"));
  });

  it("SEC-19: an unknown username costs one real argon2 verify, as a wrong password does", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    const verify = vi.spyOn(argon2, "verify");
    try {
      for (const username of ["alice", "nobody"]) {
        verify.mockClear();
        expect(await auth.logIn({ username, password: "wrong" })).toBeNull();
        expect(verify).toHaveBeenCalledTimes(1);
        // A real argon2id hash, and verify ran to a "no" rather than throwing
        // on a malformed hash (which would cost nothing).
        expect(String(verify.mock.calls[0]?.[0])).toMatch(/^\$argon2id\$/);
        expect(await verify.mock.results[0]?.value).toBe(false);
      }
    } finally {
      verify.mockRestore();
    }
  });

  it("AUTH-11 SEC-12: every logIn issues a new token", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    const first = issued(await auth.logIn({ username: "alice", password: "pw" }));
    const second = issued(await auth.logIn({ username: "alice", password: "pw" }));
    expect(second.token).not.toBe(first.token);
    expect(await auth.getSession(first.token)).not.toBeNull();
    expect(await auth.getSession(second.token)).not.toBeNull();
    await auth.logOut(first.token);
    expect(await auth.getSession(first.token)).toBeNull();
    expect(await auth.getSession(second.token)).not.toBeNull();
  });

  it("AUTH-12: a session expires one week after login and is not extended by use", async () => {
    issued(await auth.signUp({ username: "alice", password: "pw" }));
    const loginAt = clock.getTime();
    const session = issued(await auth.logIn({ username: "alice", password: "pw" }));
    expect(session.expiresAt.getTime()).toBe(loginAt + SESSION_TTL_MS);

    clock = new Date(loginAt + 6 * DAY_MS);
    expect((await auth.getSession(session.token))?.expiresAt.getTime()).toBe(
      loginAt + SESSION_TTL_MS,
    );

    clock = new Date(loginAt + SESSION_TTL_MS + 1);
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("AUTH-13: getSession is null for an unknown token and for a deleted user", async () => {
    expect(await auth.getSession("not-a-real-token")).toBeNull();
    const session = issued(await auth.signUp({ username: "alice", password: "pw" }));
    await db.delete(users).where(eq(users.id, session.user.id));
    expect(await auth.getSession(session.token)).toBeNull();
  });

  it("AUTH-14: logOut ends the session", async () => {
    const session = issued(await auth.signUp({ username: "alice", password: "pw" }));
    await auth.logOut(session.token);
    expect(await auth.getSession(session.token)).toBeNull();
    await expect(auth.logOut("not-a-real-token")).resolves.toBeUndefined();
  });

  it("the raw token is not stored", async () => {
    const session = issued(await auth.signUp({ username: "alice", password: "pw" }));
    const rows = await db.select({ id: sessions.id }).from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe(session.token);
    expect(rows[0]?.id).not.toContain(session.token);
  });
});

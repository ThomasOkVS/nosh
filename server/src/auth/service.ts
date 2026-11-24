import { createHmac, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.js";

export interface AuthUser {
  id: string;
  username: string;
}

export interface IssuedSession {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export interface AuthService {
  signUp(input: {
    username: string;
    password: string;
  }): Promise<IssuedSession | { error: "username_taken" }>;
  /** null = bad credentials. */
  logIn(input: { username: string; password: string }): Promise<IssuedSession | null>;
  /** An unknown token is a no-op. */
  logOut(token: string): Promise<void>;
  getSession(token: string): Promise<{ user: AuthUser; expiresAt: Date } | null>;
  /**
   * SEC-18: the login-failure limiter key for `username`, folded exactly as
   * logIn's lookup and the unique index fold it (Postgres `lower()`), so any
   * two inputs that reach the same account share one key. Unknown names get
   * a key too, so a 429 does not reveal whether a name exists.
   */
  accountKey(username: string): Promise<string>;
}

/** AUTH-12: one week from login, never extended. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAuthService(deps: {
  db: Db;
  sessionSecret: string;
  now?: () => Date;
}): AuthService {
  const { db, sessionSecret } = deps;
  const now = deps.now ?? (() => new Date());

  const sessionId = (token: string): string =>
    createHmac("sha256", sessionSecret).update(token).digest("hex");

  async function issue(user: AuthUser): Promise<IssuedSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
    await db.insert(sessions).values({ id: sessionId(token), userId: user.id, expiresAt });
    return { user, token, expiresAt };
  }

  return {
    async signUp({ username, password }) {
      const passwordHash = await hashPassword(password);
      // A new row has a random id and no email, so the only unique index it can
      // hit is users_username_lower_idx (AUTH-06). ON CONFLICT also settles a
      // concurrent Alice/alice race inside Postgres.
      const [user] = await db
        .insert(users)
        .values({ username, passwordHash })
        .onConflictDoNothing()
        .returning({ id: users.id, username: users.username });
      if (!user) return { error: "username_taken" };
      return issue(user);
    },

    async logIn({ username, password }) {
      const [user] = await db
        .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`);
      if (!user) {
        await verifyAgainstDummy(password); // SEC-19: same cost as a wrong password
        return null;
      }
      if (!(await verifyPassword(user.passwordHash, password))) return null;
      return issue({ id: user.id, username: user.username });
    },

    async logOut(token) {
      await db.delete(sessions).where(eq(sessions.id, sessionId(token)));
    },

    async accountKey(username) {
      const [row] = await db.execute<{ key: string }>(sql`select lower(${username}) as key`);
      if (!row) throw new Error("select lower() returned no row");
      return row.key;
    },

    async getSession(token) {
      const [row] = await db
        .select({ id: users.id, username: users.username, expiresAt: sessions.expiresAt })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, sessionId(token)));
      if (!row || row.expiresAt.getTime() < now().getTime()) return null;
      return { user: { id: row.id, username: row.username }, expiresAt: row.expiresAt };
    },
  };
}

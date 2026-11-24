import { setTimeout as delay } from "node:timers/promises";
import { logInBody, signUpBody, type AuthUserDto } from "@nosh/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Config } from "../config/env.js";
import type { AppEnv } from "../http/context.js";
import { FixedWindowLimiter, tooMany } from "../http/rateLimit.js";
import { jsonBody } from "../http/validate.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookie.js";
import type { AuthService, AuthUser } from "./service.js";

const MINUTE_MS = 60 * 1000;

/** SEC-19: every failed login waits this long by default. */
export const DEFAULT_FAILURE_DELAY_MS = 1000;

export interface AuthRouteDeps {
  auth: AuthService;
  config: Pick<Config, "isProduction" | "allowSignup">;
  failureDelayMs?: number;
}

/** AUTH-01, AUTH-07, AUTH-13: id and username only, never the hash or email. */
function toDto(user: AuthUser): AuthUserDto {
  return { id: user.id, username: user.username };
}

/**
 * The public auth endpoints under /api/auth: signup, login, logout and me.
 * Auth answers use c.json, not HTTPException, so their messages survive
 * onError's fixed "Invalid request" for 4xx exceptions.
 */
export function authRoutes(deps: AuthRouteDeps) {
  const { auth, config } = deps;
  const failureDelayMs = deps.failureDelayMs ?? DEFAULT_FAILURE_DELAY_MS;

  // SEC-16: in memory, one set per app instance.
  const loginPerIp = new FixedWindowLimiter({ limit: 20, windowMs: 15 * MINUTE_MS }); // SEC-17
  const loginFailuresPerAccount = new FixedWindowLimiter({ limit: 10, windowMs: 15 * MINUTE_MS }); // SEC-18
  const signupPerIp = new FixedWindowLimiter({ limit: 5, windowMs: 60 * MINUTE_MS }); // SEC-20

  // AUTH-02, SEC-15, SEC-20: the switch comes first, then the limit, and only
  // then is the body read, so every attempt counts, valid or not.
  const signupGate = createMiddleware<AppEnv>(async (c, next) => {
    if (!config.allowSignup) {
      return c.json({ error: "Sign-ups are disabled on this server" }, 403);
    }
    const hit = signupPerIp.hit(c.var.client.ip);
    if (!hit.ok) return tooMany(c, hit.retryAfterSec);
    await next();
  });

  return new Hono<AppEnv>()
    .post("/signup", signupGate, jsonBody(signUpBody), async (c) => {
      const result = await auth.signUp(c.req.valid("json"));
      if ("error" in result) {
        return c.json({ error: "Username already taken" }, 409); // AUTH-06
      }
      // AUTH-11: the new token replaces whatever cookie the browser held.
      setSessionCookie(c, result.token, result.expiresAt, config);
      return c.json(toDto(result.user), 201);
    })

    // AUTH-10: validation runs first, so a 400 is neither counted nor delayed.
    .post("/login", jsonBody(logInBody), async (c) => {
      const { username, password } = c.req.valid("json");

      const ipHit = loginPerIp.hit(c.var.client.ip); // SEC-17: every attempt
      if (!ipHit.ok) return tooMany(c, ipHit.retryAfterSec);

      const account = username.toLowerCase(); // SEC-18: across all IPs
      const lockedFor = loginFailuresPerAccount.blocked(account);
      if (lockedFor !== null) return tooMany(c, lockedFor);

      const session = await auth.logIn({ username, password });
      if (session === null) {
        loginFailuresPerAccount.hit(account); // only failures count
        await delay(failureDelayMs); // AUTH-09, SEC-19
        return c.json({ error: "Invalid username or password" }, 401);
      }
      loginFailuresPerAccount.reset(account);
      setSessionCookie(c, session.token, session.expiresAt, config); // AUTH-11
      return c.json(toDto(session.user), 200);
    })

    // AUTH-14, SEC-10
    .post("/logout", async (c) => {
      const token = readSessionToken(c, config);
      if (token !== undefined) await auth.logOut(token);
      clearSessionCookie(c, config);
      return c.body(null, 204);
    })

    // AUTH-13
    .get("/me", async (c) => {
      const token = readSessionToken(c, config);
      const session = token === undefined ? null : await auth.getSession(token);
      if (session === null) return c.json({ error: "Not authenticated" }, 401);
      return c.json(toDto(session.user), 200);
    });
}

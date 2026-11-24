import { createMiddleware } from "hono/factory";
import type { Config } from "../config/env.js";
import type { AppEnv } from "../http/context.js";
import { readSessionToken } from "./cookie.js";
import type { AuthService } from "./service.js";

/**
 * AUTH-15, SEC-23: every /api route except signup, login, logout and me needs
 * a live session. Sets `user` and `sessionToken` for the handlers behind it.
 */
export function requireAuth(deps: { auth: AuthService; config: Pick<Config, "isProduction"> }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = readSessionToken(c, deps.config);
    const session = token === undefined ? null : await deps.auth.getSession(token);
    if (token === undefined || session === null) {
      return c.json({ error: "Not authenticated" }, 401);
    }
    c.set("user", session.user);
    c.set("sessionToken", token);
    await next();
  });
}

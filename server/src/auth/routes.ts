import { Hono } from "hono";
import type { AppEnv } from "../app.js";

/**
 * STUB auth routes (Task 3). Task 4 replaces this router with the real
 * signup/login/logout/me handlers. The stubs exist so the hardening tests in
 * app.security.test.ts have state-changing routes to hit:
 * - logout answers 204 (SEC-01 to SEC-05),
 * - login parses its JSON body, so a malformed body reaches the SEC-26 path.
 */
export function authRoutes(): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post("/login", async (c) => {
      await c.req.json();
      return c.body(null, 204);
    })
    .post("/logout", (c) => c.body(null, 204));
}

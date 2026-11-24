import type { MiddlewareHandler } from "hono";

/**
 * SEC-60: basic hardening headers on every response, set after the handler so
 * error, 403 and 404 responses carry them too. No CSP in the first release.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
};

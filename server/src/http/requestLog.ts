import type { MiddlewareHandler } from "hono";

/**
 * One line per request: method, path (never the query string, which may hold
 * secrets), status, client IP and duration. The deploy check reads the IP to
 * confirm Caddy's X-Forwarded-For handling.
 */
export const requestLog: MiddlewareHandler<{ Variables: { client?: { ip: string } } }> = async (c, next) => {
  const start = performance.now();
  await next();
  const ms = Math.round(performance.now() - start);
  const ip = c.get("client")?.ip ?? "-";
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ip} ${ms}ms`);
};

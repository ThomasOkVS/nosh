import type { Context, MiddlewareHandler } from "hono";

/**
 * The path as the client sent it: still percent-encoded and without the query
 * string. Never log `c.req.path`: Hono decodes it, so `%0A` would become a real
 * newline and let any client forge log lines. A parsed URL's pathname cannot
 * hold raw CR/LF.
 */
export function rawPath(c: Context): string {
  return new URL(c.req.url).pathname;
}

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
  console.log(`${c.req.method} ${rawPath(c)} ${c.res.status} ${ip} ${ms}ms`);
};

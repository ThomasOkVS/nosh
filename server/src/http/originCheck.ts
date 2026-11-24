import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * SEC-01 to SEC-05: CSRF protection by Origin. The match is exact string
 * equality: a browser sends `https://host`, never a default port or a path,
 * so `https://host:443` and `null` simply fail it. Without Origin,
 * Sec-Fetch-Site decides; with neither it is not a browser and falls through
 * to normal authentication.
 */
export function originCheck(allowedOrigins: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();

    const origin = c.req.header("origin");
    const fetchSite = c.req.header("sec-fetch-site");
    const allowed =
      origin !== undefined
        ? allowedOrigins.includes(origin)
        : fetchSite === undefined || SAME_ORIGIN_FETCH_SITES.has(fetchSite);

    if (!allowed) return c.json({ error: "Request origin not allowed" }, 403);
    return next();
  };
}

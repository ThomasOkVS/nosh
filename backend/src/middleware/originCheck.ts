import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// `Sec-Fetch-Site` values that mean "this request didn't come from another
// site's page": the app's own origin, or the user typing/bookmarking a URL.
const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * CSRF protection by origin: a state-changing request must come from one of
 * the app's own frontends. Closest Java equivalent is Spring Security's CSRF
 * filter, but checking the browser-supplied `Origin` instead of a token —
 * browsers attach it to every cross-origin request and to same-origin
 * non-GET requests, and a page can't forge it.
 *
 * CORS alone isn't this: CORS decides whether a page may *read* a response.
 * A cross-site HTML form POST still reaches the server and runs, CORS or not.
 *
 * Safe methods pass untouched — they must not change state, and once the
 * frontend is served same-origin browsers leave `Origin` off plain GETs.
 * When `Origin` is missing on an unsafe request, `Sec-Fetch-Site` decides;
 * when both are missing it's not a browser (curl, a script), and CSRF is a
 * browser-only attack, so it's let through to normal auth.
 */
export function requireAllowedOrigin(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get("origin");
    if (origin !== undefined) {
      if (allowed.has(origin)) {
        next();
        return;
      }
    } else {
      const fetchSite = req.get("sec-fetch-site");
      if (fetchSite === undefined || ALLOWED_FETCH_SITES.has(fetchSite)) {
        next();
        return;
      }
    }
    res.status(403).json({ error: "Request origin not allowed" });
  };
}

import connectPgSimple from "connect-pg-simple";
import express, { type CookieOptions, type Express } from "express";
import session from "express-session";
import type { Pool } from "pg";
import type { MagicImportConfig } from "./config/llmModels";
import type { GeminiExtractFn, GeminiTranslateFn, GeminiVideoExtractFn } from "./llm/geminiClient";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requireAllowedOrigin } from "./middleware/originCheck";
import { createAuthRouter } from "./routes/auth";
import { createCollectionsRouter } from "./routes/collections";
import { createImportRouter } from "./routes/import";
import { createMealPlanRouter } from "./routes/mealPlan";
import { createPushRouter } from "./routes/push";
import { createRecipesRouter } from "./routes/recipes";
import { createSettingsRouter } from "./routes/settings";
import { createImportJobRunner } from "./services/importJobs";
import { createImportFinishedNotifier, type SendPushFn } from "./services/pushNotifier";
import type { SocialVideoDownloadFn } from "./services/socialVideo";

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * The session cookie's name. In production it carries the `__Host-` prefix,
 * which browsers enforce: they only accept such a cookie if it's Secure, has
 * `Path=/` and no `Domain` — so it can never travel over plain HTTP and no
 * sibling subdomain can set or overwrite it. Local dev runs over
 * http://localhost, where a Secure-only cookie would never be issued, hence
 * the plain name there.
 */
export function sessionCookieName(secureCookie: boolean): string {
  return secureCookie ? "__Host-nosh.sid" : "nosh.sid";
}

export interface AppDeps {
  pool: Pool;
  sessionSecret: string;
  uploadsDir: string;
  /** Exact origins (scheme://host[:port]) the frontend is served from. */
  frontendOrigins?: string[];
  /** IPs of reverse proxies whose X-Forwarded-For/-Proto are believed. */
  trustedProxies?: string[];
  /** Production: the session cookie is always Secure and `__Host-`-prefixed
   * (see sessionCookieName). Off for local dev and tests over plain HTTP. */
  secureCookie?: boolean;
  /** Required rather than defaulted, so no caller gets open signup by accident. */
  allowSignup: boolean;
  /** Added to every failed login; overridable so tests don't wait on it. */
  loginFailureDelayMs?: number;
  /** Which models the Settings page offers, and each import path's default. */
  magicImport: MagicImportConfig;
  geminiExtract?: GeminiExtractFn;
  geminiVideoExtract?: GeminiVideoExtractFn;
  /** Translates schema.org imports into the user's recipe language. */
  geminiTranslate?: GeminiTranslateFn;
  /** Overridable only so tests never shell out to the real yt-dlp binary —
   * see services/socialVideo.ts. */
  downloadSocialVideo?: SocialVideoDownloadFn;
  /** Every fetch of a user-supplied URL (import, photo-from-URL). Defaults to
   * services/safeFetch.ts's SSRF-guarded fetch; overridable so tests never
   * make a real network request. */
  fetchImpl?: typeof fetch;
  /** Both unset when the server has no VAPID keys: push is then disabled
   * (routes/push.ts answers 503) and imports finish without notifying. */
  vapidPublicKey?: string;
  /** Overridable so tests never talk to a real push service — see
   * services/pushNotifier.ts. */
  sendPush?: SendPushFn;
}

export function createApp(deps: AppDeps): Express {
  const {
    pool,
    sessionSecret,
    uploadsDir,
    frontendOrigins = ["http://localhost:5173"],
    trustedProxies = [],
    secureCookie = false,
    allowSignup,
    loginFailureDelayMs,
    magicImport,
    geminiExtract,
    geminiVideoExtract,
    geminiTranslate,
    downloadSocialVideo,
    fetchImpl,
    vapidPublicKey,
    sendPush,
  } = deps;
  const PgSession = connectPgSimple(session);
  const cookieName = sessionCookieName(secureCookie);
  // Shared by the session and by logout's clearCookie: a browser ignores a
  // Set-Cookie for a `__Host-` name unless it carries these same attributes,
  // so clearing with fewer would silently leave the old cookie in place.
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    // With `secure: true`, express-session only sends the cookie when
    // req.secure is true — behind nginx and Caddy that relies on
    // X-Forwarded-Proto from a trusted proxy (see `trust proxy` below).
    secure: secureCookie,
    sameSite: "lax",
    // Set explicitly: `__Host-` requires it, and a proxy that strips /api
    // must not change the path the cookie is scoped to.
    path: "/",
    // No `domain` on purpose: `__Host-` forbids one, and without it the
    // cookie is host-only, never sent to sibling subdomains.
  };

  const app = express();
  app.disable("x-powered-by");

  // Which peers may tell us the real client IP (X-Forwarded-For) and scheme
  // (X-Forwarded-Proto). Behind nginx → Caddy, the backend's direct peer is
  // the frontend container; only its exact IP is listed (TRUSTED_PROXIES),
  // never a whole subnet — any container on a trusted subnet could otherwise
  // claim to be any client. Everything downstream depends on this: `req.ip`
  // (rate-limit buckets) and `req.secure` (the cookie's Secure flag). Java
  // equivalent: Tomcat's RemoteIpValve with `internalProxies`.
  app.set("trust proxy", trustedProxies.length > 0 ? trustedProxies : false);

  // No CORS: the browser only ever calls the API on the page's own origin —
  // through nginx's /api in production, Vite's /api proxy in dev. The origin
  // check below is still needed; it's CSRF protection, not CORS.
  app.use(requireAllowedOrigin(frontendOrigins));
  app.use(express.json());
  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: cookieName,
      cookie: { ...cookieOptions, maxAge: ONE_WEEK_MS },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    "/auth",
    createAuthRouter({
      pool,
      allowSignup,
      cookie: { name: cookieName, options: cookieOptions },
      failureDelayMs: loginFailureDelayMs,
    }),
  );
  app.use("/recipes", createRecipesRouter(pool, uploadsDir, fetchImpl));
  app.use("/collections", createCollectionsRouter(pool, uploadsDir));
  app.use("/meal-plan", createMealPlanRouter(pool));
  const importJobRunner = createImportJobRunner(pool, {
    geminiExtract,
    geminiVideoExtract,
    geminiTranslate,
    downloadSocialVideo,
    fetchImpl,
    notify: sendPush ? createImportFinishedNotifier(pool, sendPush) : undefined,
  });
  app.use("/import", createImportRouter({ pool, magicImport, runner: importJobRunner }));
  app.use("/push", createPushRouter(pool, vapidPublicKey));
  app.use(
    "/settings",
    createSettingsRouter({
      pool,
      magicImport,
      aiConfigured: geminiExtract !== undefined || geminiVideoExtract !== undefined,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express, { type Express } from "express";
import session from "express-session";
import type { Pool } from "pg";
import type { MagicImportConfig } from "./config/llmModels";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "./llm/geminiClient";
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

export interface AppDeps {
  pool: Pool;
  sessionSecret: string;
  uploadsDir: string;
  /** Exact origins (scheme://host[:port]) the frontend is served from. */
  frontendOrigins?: string[];
  /** IPs of reverse proxies whose X-Forwarded-For/-Proto are believed. */
  trustedProxies?: string[];
  /** Required rather than defaulted, so no caller gets open signup by accident. */
  allowSignup: boolean;
  /** Added to every failed login; overridable so tests don't wait on it. */
  loginFailureDelayMs?: number;
  /** Which models the Settings page offers, and each import path's default. */
  magicImport: MagicImportConfig;
  geminiExtract?: GeminiExtractFn;
  geminiVideoExtract?: GeminiVideoExtractFn;
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
    allowSignup,
    loginFailureDelayMs,
    magicImport,
    geminiExtract,
    geminiVideoExtract,
    downloadSocialVideo,
    fetchImpl,
    vapidPublicKey,
    sendPush,
  } = deps;
  const PgSession = connectPgSimple(session);

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

  // CORS covers the transitional setup where the frontend calls the API on
  // its own port (a different origin). Once the frontend proxies /api itself
  // the browser sees one origin and CORS never comes into play.
  app.use(cors({ origin: frontendOrigins, credentials: true }));
  app.use(requireAllowedOrigin(frontendOrigins));
  app.use(express.json());
  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // "auto" = Secure exactly when this request arrived over HTTPS
        // (req.secure, which believes X-Forwarded-Proto only from a trusted
        // proxy). Lets the plain-HTTP tailnet origin keep working during the
        // move, while the HTTPS origin gets a Secure cookie.
        secure: "auto",
        sameSite: "lax",
        // Set explicitly: a proxy that strips /api must not change the path
        // the cookie is scoped to.
        path: "/",
        // No `domain` on purpose: without one the cookie is host-only, so it
        // is never sent to sibling subdomains of the same parent domain.
        maxAge: ONE_WEEK_MS,
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", createAuthRouter({ pool, allowSignup, failureDelayMs: loginFailureDelayMs }));
  app.use("/recipes", createRecipesRouter(pool, uploadsDir, fetchImpl));
  app.use("/collections", createCollectionsRouter(pool, uploadsDir));
  app.use("/meal-plan", createMealPlanRouter(pool));
  const importJobRunner = createImportJobRunner(pool, {
    geminiExtract,
    geminiVideoExtract,
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

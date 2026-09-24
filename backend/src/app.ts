import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express, { type Express } from "express";
import session from "express-session";
import type { Pool } from "pg";
import type { MagicImportConfig } from "./config/llmModels";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "./llm/geminiClient";
import { errorHandler } from "./middleware/errorHandler";
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
  frontendOrigin?: string;
  /** Which models the Settings page offers, and each import path's default. */
  magicImport: MagicImportConfig;
  geminiExtract?: GeminiExtractFn;
  geminiVideoExtract?: GeminiVideoExtractFn;
  /** Overridable only so tests never shell out to the real yt-dlp binary —
   * see services/socialVideo.ts. */
  downloadSocialVideo?: SocialVideoDownloadFn;
  /** Overridable so tests attaching a recipe photo from a URL never make a
   * real network request — see routes/recipes.ts's `/images/from-url`. */
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
    frontendOrigin = "http://localhost:5173",
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

  // The frontend is served from a different port than the API (different
  // origin, but same host/site), so the browser blocks fetch() calls to it
  // unless the API explicitly allows that origin. `credentials: true` is
  // required alongside `credentials: "include"` on the frontend's fetch
  // calls so the session cookie is actually sent/accepted cross-origin.
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: ONE_WEEK_MS,
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", createAuthRouter(pool));
  app.use("/recipes", createRecipesRouter(pool, uploadsDir, fetchImpl));
  app.use("/collections", createCollectionsRouter(pool, uploadsDir));
  app.use("/meal-plan", createMealPlanRouter(pool));
  const importJobRunner = createImportJobRunner(pool, {
    geminiExtract,
    geminiVideoExtract,
    downloadSocialVideo,
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

  app.use(errorHandler);

  return app;
}

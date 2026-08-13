import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express, { type Express } from "express";
import session from "express-session";
import type { Pool } from "pg";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "./llm/geminiClient";
import { errorHandler } from "./middleware/errorHandler";
import { createAuthRouter } from "./routes/auth";
import { createImportRouter } from "./routes/import";
import { createRecipesRouter } from "./routes/recipes";
import type { SocialVideoDownloadFn } from "./services/socialVideo";

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export interface AppDeps {
  pool: Pool;
  sessionSecret: string;
  uploadsDir: string;
  frontendOrigin?: string;
  geminiExtract?: GeminiExtractFn;
  geminiVideoExtract?: GeminiVideoExtractFn;
  /** Overridable only so tests never shell out to the real yt-dlp binary —
   * see services/socialVideo.ts. */
  downloadSocialVideo?: SocialVideoDownloadFn;
  /** Overridable so tests attaching a recipe photo from a URL never make a
   * real network request — see routes/recipes.ts's `/images/from-url`. */
  fetchImpl?: typeof fetch;
}

export function createApp(deps: AppDeps): Express {
  const {
    pool,
    sessionSecret,
    uploadsDir,
    frontendOrigin = "http://localhost:5173",
    geminiExtract,
    geminiVideoExtract,
    downloadSocialVideo,
    fetchImpl,
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
  app.use("/import", createImportRouter({ geminiExtract, geminiVideoExtract, downloadSocialVideo }));

  app.use(errorHandler);

  return app;
}

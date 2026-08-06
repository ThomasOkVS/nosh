import connectPgSimple from "connect-pg-simple";
import express, { type Express } from "express";
import session from "express-session";
import type { Pool } from "pg";
import { errorHandler } from "./middleware/errorHandler";
import { createAuthRouter } from "./routes/auth";
import { createRecipesRouter } from "./routes/recipes";

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export interface AppDeps {
  pool: Pool;
  sessionSecret: string;
  uploadsDir: string;
}

export function createApp(deps: AppDeps): Express {
  const { pool, sessionSecret, uploadsDir } = deps;
  const PgSession = connectPgSimple(session);

  const app = express();

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
  app.use("/recipes", createRecipesRouter(pool, uploadsDir));

  app.use(errorHandler);

  return app;
}

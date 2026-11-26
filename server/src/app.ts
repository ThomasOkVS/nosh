import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireAuth } from "./auth/requireAuth.js";
import { authRoutes } from "./auth/routes.js";
import type { AuthService } from "./auth/service.js";
import type { Config } from "./config/env.js";
import type { Db } from "./db/client.js";
import { resolveClient } from "./http/clientInfo.js";
import type { AppEnv } from "./http/context.js";
import { bodyTooLarge, notFound, onError } from "./http/errors.js";
import { originCheck } from "./http/originCheck.js";
import { requestLog } from "./http/requestLog.js";
import { securityHeaders } from "./http/securityHeaders.js";
import { mountSpa } from "./http/spa.js";
import type { ImageStore } from "./images/store.js";
import { IMAGE_UPLOAD_PATH } from "./recipes/images.routes.js";
import { recipeRoutes } from "./recipes/routes.js";

export interface AppDeps {
  config: Config;
  auth: AuthService;
  db: Db;
  images: ImageStore;
  /** The TCP peer address. Tests inject one: app.request() has no socket. */
  getPeer?: (c: Context) => string;
  /** Delay before answering a failed login; 1 s unless a test sets it (SEC-19). */
  failureDelayMs?: number;
  /** Built web app to serve; absent in API-only tests. */
  webDistDir?: string;
}

/** SEC-27 */
const API_BODY_LIMIT_BYTES = 100 * 1024;

/**
 * SEC-27: every /api body is capped at 100 KiB except a photo upload (REC-14), which
 * carries its own 5 MB limit on the route. Only `POST /api/recipes/:id/images` skips it.
 */
const apiBodyLimit: MiddlewareHandler = (() => {
  const limit = bodyLimit({ maxSize: API_BODY_LIMIT_BYTES, onError: bodyTooLarge });
  return (c, next) =>
    c.req.method === "POST" && IMAGE_UPLOAD_PATH.test(c.req.path) ? next() : limit(c, next);
})();

const defaultGetPeer = (c: Context): string => getConnInfo(c).remote.address ?? "";

export function createApp(deps: AppDeps) {
  const getPeer = deps.getPeer ?? defaultGetPeer;

  const app = new Hono<AppEnv>()
    .use(requestLog)
    .use(securityHeaders)
    .use(async (c, next) => {
      c.set(
        "client",
        resolveClient({
          peer: getPeer(c),
          headers: c.req.raw.headers,
          trustedProxies: deps.config.trustedProxies,
          // SEC-09, SEC-14: this server never terminates TLS; Caddy does. The
          // request URL is no evidence: an absolute-form request line
          // (`POST https://… HTTP/1.1`) sets it even on a plain TCP socket.
          socketIsTls: false,
        }),
      );
      await next();
    })
    .use(originCheck(deps.config.allowedOrigins))
    .use("/api/*", apiBodyLimit)
    .get("/health", (c) => c.json({ status: "ok" })) // SEC-23
    // AUTH-15, SEC-23: the auth routes answer before requireAuth runs; every
    // other /api path (including an unknown one) needs a session.
    .route(
      "/api/auth",
      authRoutes({ auth: deps.auth, config: deps.config, failureDelayMs: deps.failureDelayMs }),
    )
    .use("/api/*", requireAuth({ auth: deps.auth, config: deps.config }))
    .route("/api/recipes", recipeRoutes({ db: deps.db, images: deps.images }));

  if (deps.webDistDir) mountSpa(app, deps.webDistDir);
  app.onError(onError);
  app.notFound(notFound);
  return app;
}

export type AppType = ReturnType<typeof createApp>;

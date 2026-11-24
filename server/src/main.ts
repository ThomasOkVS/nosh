import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/service.js";
import { ConfigError, loadConfig } from "./config/env.js";
import { createDb } from "./db/client.js";

// server/src/main.ts and server/dist/main.js sit at the same depth, so the
// same relative paths work from source and from the build.
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const webDistDir = fileURLToPath(new URL("../../app/dist", import.meta.url));

/** Loads config, migrates the database, then listens. Rejects with ConfigError on bad config. */
export async function start(
  env: Record<string, string | undefined>,
): Promise<{ close(): Promise<void> }> {
  const config = loadConfig(env);
  const handle = createDb(config.databaseUrl);
  try {
    await migrate(handle.db, { migrationsFolder });
    const auth = createAuthService({ db: handle.db, sessionSecret: config.sessionSecret });
    const app = createApp({ config, auth, webDistDir });

    const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
      const s = serve({ fetch: app.fetch, port: config.port }, () => resolve(s));
      s.once("error", reject);
    });
    console.log(`nosh ${config.commitSha} listening on port ${config.port}`);
    return {
      close: async () => {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          if ("closeAllConnections" in server) server.closeAllConnections();
        });
        await handle.close();
      },
    };
  } catch (err) {
    await handle.close();
    throw err;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  start(process.env).then(
    (running) => {
      const stop = () => void running.close().then(() => process.exit(0));
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
    },
    (err: unknown) => {
      console.error(err instanceof ConfigError ? err.message : err);
      process.exit(1);
    },
  );
}

import { createApp } from "./app";
import { env } from "./config/env";
import { createPool } from "./db/pool";
import { seedDemoData } from "./db/seed";
import { createGeminiExtractor, createGeminiVideoExtractor } from "./llm/geminiClient";
import { recoverImportJobs } from "./repositories/importJobs";
import { createWebPushSender } from "./services/pushNotifier";
import { downloadSocialVideo } from "./services/socialVideo";

const pool = createPool(env.databaseUrl);

async function start(): Promise<void> {
  // Before accepting requests: any job still "running" belongs to a
  // previous process and would otherwise spin in the UI forever.
  await recoverImportJobs(pool);

  if (env.seedDemoData) {
    await seedDemoData(pool, env.uploadsDir);
  }

  const app = createApp({
    pool,
    sessionSecret: env.sessionSecret,
    uploadsDir: env.uploadsDir,
    frontendOrigin: env.frontendOrigin,
    geminiExtract: env.geminiApiKey
      ? createGeminiExtractor(env.geminiApiKey, env.geminiTextModel)
      : undefined,
    geminiVideoExtract: env.geminiApiKey
      ? createGeminiVideoExtractor(env.geminiApiKey, env.geminiVideoModel)
      : undefined,
    downloadSocialVideo,
    vapidPublicKey: env.vapid?.publicKey,
    sendPush: env.vapid ? createWebPushSender(env.vapid) : undefined,
  });

  app.listen(env.port, () => {
    console.log(`Nosh backend listening on port ${env.port}`);
  });
}

start().catch((err: unknown) => {
  console.error("Failed to start Nosh backend:", err);
  process.exit(1);
});

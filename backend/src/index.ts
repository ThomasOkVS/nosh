import { createApp } from "./app";
import { env } from "./config/env";
import { parseModelAllowlist } from "./config/llmModels";
import { createPool } from "./db/pool";
import { seedDemoData } from "./db/seed";
import {
  createGeminiExtractor,
  createGeminiTranslator,
  createGeminiVideoExtractor,
  type GeminiUsageListener,
} from "./llm/geminiClient";
import { recoverImportJobs } from "./repositories/importJobs";
import { recordLlmUsage } from "./repositories/llmUsage";
import { startEgressProxy } from "./services/egressProxy";
import { createWebPushSender } from "./services/pushNotifier";
import { createSocialVideoDownloader } from "./services/socialVideo";

const pool = createPool(env.databaseUrl);

async function start(): Promise<void> {
  // Before accepting requests: any job still "running" belongs to a
  // previous process and would otherwise spin in the UI forever.
  // Deliberately non-fatal: in prod, Watchtower restarts the backend on a
  // new image *before* anyone runs `pnpm migrate up`, so on that first boot
  // `import_jobs` may not exist yet — crashing here would crash-loop the
  // container and make `docker compose exec backend pnpm migrate up`
  // impossible. The next restart after migrating does the recovery.
  try {
    await recoverImportJobs(pool);
  } catch (err) {
    console.warn("Skipped import-job recovery (have migrations been run?):", err);
  }

  if (env.seedDemoData) {
    await seedDemoData(pool, env.uploadsDir);
  }

  const magicImport = {
    models: parseModelAllowlist(env.geminiModels, [env.geminiTextModel, env.geminiVideoModel]),
    defaultTextModel: env.geminiTextModel,
    defaultVideoModel: env.geminiVideoModel,
  };
  // Every connection yt-dlp opens goes through this (see
  // services/egressProxy.ts). Started before the app so no import can ever
  // run yt-dlp without it; if it can't bind, startup fails.
  const egressProxy = await startEgressProxy();

  const recordUsage: GeminiUsageListener = (model, usage) => recordLlmUsage(pool, model, usage);

  const app = createApp({
    pool,
    sessionSecret: env.sessionSecret,
    uploadsDir: env.uploadsDir,
    frontendOrigins: env.frontendOrigins,
    trustedProxies: env.trustedProxies,
    secureCookie: env.secureCookie,
    allowSignup: env.allowSignup,
    magicImport,
    geminiExtract: env.geminiApiKey
      ? createGeminiExtractor(env.geminiApiKey, env.geminiTextModel, fetch, recordUsage)
      : undefined,
    geminiVideoExtract: env.geminiApiKey
      ? createGeminiVideoExtractor(env.geminiApiKey, env.geminiVideoModel, fetch, recordUsage)
      : undefined,
    // Text model: translating is a text-only task, like page extraction.
    geminiTranslate: env.geminiApiKey
      ? createGeminiTranslator(env.geminiApiKey, env.geminiTextModel, fetch, recordUsage)
      : undefined,
    downloadSocialVideo: createSocialVideoDownloader({ proxyUrl: egressProxy.url }),
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

import { createApp } from "./app";
import { env } from "./config/env";
import { parseModelAllowlist } from "./config/llmModels";
import { createPool } from "./db/pool";
import { seedDemoData } from "./db/seed";
import {
  createGeminiExtractor,
  createGeminiVideoExtractor,
  type GeminiUsageListener,
} from "./llm/geminiClient";
import { recordLlmUsage } from "./repositories/llmUsage";
import { downloadSocialVideo } from "./services/socialVideo";

const pool = createPool(env.databaseUrl);

async function start(): Promise<void> {
  if (env.seedDemoData) {
    await seedDemoData(pool, env.uploadsDir);
  }

  const magicImport = {
    models: parseModelAllowlist(env.geminiModels, [env.geminiTextModel, env.geminiVideoModel]),
    defaultTextModel: env.geminiTextModel,
    defaultVideoModel: env.geminiVideoModel,
  };
  const recordUsage: GeminiUsageListener = (model, usage) => recordLlmUsage(pool, model, usage);

  const app = createApp({
    pool,
    sessionSecret: env.sessionSecret,
    uploadsDir: env.uploadsDir,
    frontendOrigin: env.frontendOrigin,
    magicImport,
    geminiExtract: env.geminiApiKey
      ? createGeminiExtractor(env.geminiApiKey, env.geminiTextModel, fetch, recordUsage)
      : undefined,
    geminiVideoExtract: env.geminiApiKey
      ? createGeminiVideoExtractor(env.geminiApiKey, env.geminiVideoModel, fetch, recordUsage)
      : undefined,
    downloadSocialVideo,
  });

  app.listen(env.port, () => {
    console.log(`Nosh backend listening on port ${env.port}`);
  });
}

start().catch((err: unknown) => {
  console.error("Failed to start Nosh backend:", err);
  process.exit(1);
});

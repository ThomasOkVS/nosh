import { createApp } from "./app";
import { env } from "./config/env";
import { createPool } from "./db/pool";
import { seedDemoData } from "./db/seed";
import { createGeminiExtractor } from "./llm/geminiClient";

const pool = createPool(env.databaseUrl);

async function start(): Promise<void> {
  if (env.seedDemoData) {
    await seedDemoData(pool, env.uploadsDir);
  }

  const app = createApp({
    pool,
    sessionSecret: env.sessionSecret,
    uploadsDir: env.uploadsDir,
    frontendOrigin: env.frontendOrigin,
    geminiExtract: env.geminiApiKey ? createGeminiExtractor(env.geminiApiKey) : undefined,
  });

  app.listen(env.port, () => {
    console.log(`Nosh backend listening on port ${env.port}`);
  });
}

start().catch((err: unknown) => {
  console.error("Failed to start Nosh backend:", err);
  process.exit(1);
});

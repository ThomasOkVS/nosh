import { createApp } from "./app";
import { env } from "./config/env";
import { createPool } from "./db/pool";

const pool = createPool(env.databaseUrl);
const app = createApp({
  pool,
  sessionSecret: env.sessionSecret,
  uploadsDir: env.uploadsDir,
});

app.listen(env.port, () => {
  console.log(`Nosh backend listening on port ${env.port}`);
});

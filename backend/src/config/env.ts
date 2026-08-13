import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  uploadsDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  seedDemoData: process.env.SEED_DEMO_DATA === "true",
  geminiApiKey: process.env.GEMINI_API_KEY,
  // Overridable rather than hardcoded: model ids get retired for *new* keys
  // while still working for old ones (see docs/dev-commands.md), and the two
  // extraction paths have different quality/quota tradeoffs — video in
  // particular is token-heavy enough that its free-tier daily request quota
  // matters far more than model tier. Flash-Lite was chosen for video after
  // a live side-by-side against Flash showed no quality loss on step
  // extraction, at ~3x the daily quota and lower latency — see
  // docs/decisions.md.
  // `||` rather than `??`: Compose's `${VAR:-}` default passes through as an
  // empty string when unset, not undefined, which `??` would treat as "set".
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash",
  geminiVideoModel: process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash-lite",
};

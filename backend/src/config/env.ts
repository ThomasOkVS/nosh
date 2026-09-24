import path from "node:path";
import { DEFAULT_GEMINI_MODELS } from "./llmModels";

/** All three VAPID vars or none: a partial set is a misconfiguration worth
 * failing loudly on at boot, not a silently disabled feature. */
function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | undefined {
  const publicKey = process.env.VAPID_PUBLIC_KEY || undefined;
  const privateKey = process.env.VAPID_PRIVATE_KEY || undefined;
  const subject = process.env.VAPID_SUBJECT || undefined;
  if (!publicKey && !privateKey && !subject) return undefined;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set together");
  }
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    throw new Error("VAPID_SUBJECT must be a mailto: or https:// URL");
  }
  return { publicKey, privateKey, subject };
}

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
  // The models a user may pick on the Settings page, with their free-tier
  // daily request limits — see config/llmModels.ts for the format.
  geminiModels: process.env.GEMINI_MODELS || DEFAULT_GEMINI_MODELS,
  // Web Push (import-finished notifications). Unset = push disabled; see
  // docs/dev-commands.md for generating a key pair.
  vapid: vapidConfig(),
};

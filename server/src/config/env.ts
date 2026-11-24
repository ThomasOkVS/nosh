import { isIP } from "node:net";
import { z } from "zod";
import { ConfigError, parseOrigins } from "./origins.js";

export { ConfigError, parseOrigins };

export interface Config {
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  allowedOrigins: string[];
  trustedProxies: string[];
  sessionSecret: string;
  allowSignup: boolean;
  uploadsDir: string;
  commitSha: string;
}

const DEV_ORIGIN = "http://localhost:5173";
const DEV_SESSION_SECRET = "dev-only-session-secret";

/** SEC-53: exact IP addresses, comma-separated; empty or unset trusts none. */
export function parseTrustedProxies(raw: string | undefined): string[] {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const entry of entries) {
    if (isIP(entry) === 0) {
      throw new ConfigError(
        `Invalid TRUSTED_PROXIES entry "${entry}": exact IP addresses only, no names or CIDR ranges.`,
      );
    }
  }
  return entries;
}

// Unset and empty both mean "not configured".
const optional = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const envSchema = z.object({
  NODE_ENV: optional,
  PORT: optional,
  DATABASE_URL: optional,
  ALLOWED_ORIGINS: optional,
  TRUSTED_PROXIES: optional,
  SESSION_SECRET: optional,
  ALLOW_SIGNUP: optional,
  UPLOADS_DIR: optional,
  COMMIT_SHA: optional,
});

function required(name: string, value: string | undefined, why?: string): string {
  if (value === undefined) {
    throw new ConfigError(
      why ? `${name} must be set in production: ${why}` : `Missing required environment variable: ${name}`,
    );
  }
  return value;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.parse(env);
  const isProduction = parsed.NODE_ENV === "production";

  const databaseUrl = required("DATABASE_URL", parsed.DATABASE_URL);

  const port = parsed.PORT === undefined ? 3001 : Number(parsed.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Invalid PORT "${parsed.PORT}": expected a port number.`);
  }

  let allowedOrigins: string[];
  if (parsed.ALLOWED_ORIGINS !== undefined) {
    allowedOrigins = parseOrigins(parsed.ALLOWED_ORIGINS);
  } else if (isProduction) {
    required("ALLOWED_ORIGINS", undefined, "the exact origin(s) the browser app is served from.");
    allowedOrigins = [];
  } else {
    allowedOrigins = [DEV_ORIGIN];
  }

  if (isProduction && parsed.TRUSTED_PROXIES === undefined) {
    required(
      "TRUSTED_PROXIES",
      undefined,
      "without it requests never count as HTTPS and nobody can log in. Use the reverse proxy's exact IP.",
    );
  }
  const trustedProxies = parseTrustedProxies(parsed.TRUSTED_PROXIES);

  let sessionSecret = parsed.SESSION_SECRET;
  if (sessionSecret === undefined) {
    if (isProduction) {
      required("SESSION_SECRET", undefined, "a long random string.");
    }
    sessionSecret = DEV_SESSION_SECRET;
  }

  return {
    isProduction,
    port,
    databaseUrl,
    allowedOrigins,
    trustedProxies,
    sessionSecret,
    allowSignup: parsed.ALLOW_SIGNUP === "true", // SEC-58: exactly "true"
    uploadsDir: parsed.UPLOADS_DIR ?? "uploads",
    commitSha: parsed.COMMIT_SHA ?? "dev",
  };
}

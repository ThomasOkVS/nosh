import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseTrustedProxies } from "./env.js";

const DB = "postgres://nosh:nosh@localhost:5432/nosh";
const PROD = {
  NODE_ENV: "production",
  DATABASE_URL: DB,
  ALLOWED_ORIGINS: "https://nosh.example",
  TRUSTED_PROXIES: "172.20.0.2",
  SESSION_SECRET: "a-long-random-secret",
};

function without(name: keyof typeof PROD): Record<string, string> {
  return Object.fromEntries(Object.entries(PROD).filter(([key]) => key !== name));
}

describe("loadConfig", () => {
  it("SEC-56: refuses to start without DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow("Missing required environment variable: DATABASE_URL");
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("SEC-52: production without ALLOWED_ORIGINS is refused", () => {
    const env = without("ALLOWED_ORIGINS");
    expect(() => loadConfig(env)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadConfig({ ...env, ALLOWED_ORIGINS: "" })).toThrow(/ALLOWED_ORIGINS/);
  });

  it("SEC-53: production without TRUSTED_PROXIES is refused", () => {
    const env = without("TRUSTED_PROXIES");
    expect(() => loadConfig(env)).toThrow(/TRUSTED_PROXIES/);
    expect(() => loadConfig({ ...env, TRUSTED_PROXIES: "" })).toThrow(/TRUSTED_PROXIES/);
  });

  it("SEC-57: production without SESSION_SECRET is refused", () => {
    const env = without("SESSION_SECRET");
    expect(() => loadConfig(env)).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...env, SESSION_SECRET: "" })).toThrow(/SESSION_SECRET/);
  });

  it.each([
    [undefined, false],
    ["", false],
    ["TRUE", false],
    ["1", false],
    ["yes", false],
    ["true", true],
  ])("SEC-58: ALLOW_SIGNUP=%j gives %s", (raw, expected) => {
    expect(loadConfig({ DATABASE_URL: DB, ALLOW_SIGNUP: raw }).allowSignup).toBe(expected);
  });

  it("SEC-54: development has working defaults", () => {
    const config = loadConfig({ DATABASE_URL: DB });
    expect(config).toEqual({
      isProduction: false,
      port: 3001,
      databaseUrl: DB,
      allowedOrigins: ["http://localhost:5173"],
      trustedProxies: [],
      sessionSecret: "dev-only-session-secret",
      allowSignup: false,
      uploadsDir: "uploads",
      commitSha: "dev",
    });
  });

  it("production with everything set gives a full Config", () => {
    expect(
      loadConfig({
        ...PROD,
        PORT: "8080",
        ALLOW_SIGNUP: "true",
        UPLOADS_DIR: "/data/uploads",
        COMMIT_SHA: "abc1234",
      }),
    ).toEqual({
      isProduction: true,
      port: 8080,
      databaseUrl: DB,
      allowedOrigins: ["https://nosh.example"],
      trustedProxies: ["172.20.0.2"],
      sessionSecret: "a-long-random-secret",
      allowSignup: true,
      uploadsDir: "/data/uploads",
      commitSha: "abc1234",
    });
  });

  it("refuses a non-numeric PORT", () => {
    expect(() => loadConfig({ DATABASE_URL: DB, PORT: "abc" })).toThrow(ConfigError);
  });
});

describe("parseTrustedProxies", () => {
  it("SEC-53: parses a comma-separated list", () => {
    expect(parseTrustedProxies("172.20.0.2, 172.20.0.3")).toEqual(["172.20.0.2", "172.20.0.3"]);
  });

  it("SEC-53: empty or unset means trust none", () => {
    expect(parseTrustedProxies("")).toEqual([]);
    expect(parseTrustedProxies(undefined)).toEqual([]);
  });

  it("SEC-53: refuses a CIDR range, exact addresses only", () => {
    expect(() => parseTrustedProxies("172.20.0.0/16")).toThrow(ConfigError);
  });

  it("SEC-53: refuses something that is not an IP address", () => {
    expect(() => parseTrustedProxies("caddy")).toThrow(ConfigError);
  });
});

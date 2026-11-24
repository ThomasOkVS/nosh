import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { sessionCookieName } from "./cookie.js";
import { SESSION_TTL_MS, type AuthService } from "./service.js";

const PROXY = "172.20.0.2";
const USER = { id: "00000000-0000-4000-8000-000000000001", username: "alice" };

/** Accepts alice/secret and issues a fresh token each time; no database. */
function fakeAuth(): AuthService & { loggedOut: string[] } {
  let n = 0;
  const loggedOut: string[] = [];
  const issue = () => ({
    user: USER,
    token: `token-${++n}`,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return {
    loggedOut,
    signUp: async () => issue(),
    logIn: async ({ username, password }) =>
      username === "alice" && password === "secret" ? issue() : null,
    logOut: async (token) => {
      loggedOut.push(token);
    },
    getSession: async () => null,
    accountKey: async (username) => username.toLowerCase(),
  };
}

const devConfig = loadConfig({ DATABASE_URL: "postgres://unused", TRUSTED_PROXIES: PROXY });
const prodConfig = loadConfig({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://unused",
  ALLOWED_ORIGINS: "https://nosh.example.com",
  TRUSTED_PROXIES: PROXY,
  SESSION_SECRET: "prod-secret-prod-secret-prod-secret",
});

function makeApp(production: boolean, auth = fakeAuth()) {
  return createApp({
    config: production ? prodConfig : devConfig,
    auth,
    getPeer: (c) => c.req.header("x-test-peer") ?? "127.0.0.1",
    failureDelayMs: 0,
  });
}

function logIn(app: ReturnType<typeof makeApp>, headers: Record<string, string> = {}) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ username: "alice", password: "secret" }),
  });
}

/** The attributes of a Set-Cookie header, lower-cased names. */
function attributes(setCookie: string): Map<string, string> {
  const [, ...parts] = setCookie.split(";").map((part) => part.trim());
  return new Map(
    parts.map((part) => {
      const eq = part.indexOf("=");
      return eq === -1 ? [part.toLowerCase(), ""] : [part.slice(0, eq).toLowerCase(), part.slice(eq + 1)];
    }),
  );
}

describe("session cookie", () => {
  it("names the cookie by environment", () => {
    expect(sessionCookieName(true)).toBe("__Host-nosh.sid");
    expect(sessionCookieName(false)).toBe("nosh.sid");
  });

  it("SEC-07 AUTH-12: dev login sets nosh.sid, HttpOnly, SameSite=Lax, Path=/, no Domain, one week", async () => {
    const res = await logIn(makeApp(false));
    expect(res.status).toBe(200);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^nosh\.sid=token-1;/);
    const attrs = attributes(header);
    expect(attrs.has("httponly")).toBe(true);
    expect(attrs.get("samesite")).toBe("Lax");
    expect(attrs.get("path")).toBe("/");
    expect(attrs.has("domain")).toBe(false);
    const expires = Date.parse(attrs.get("expires") ?? "");
    expect(Math.abs(expires - (Date.now() + SESSION_TTL_MS))).toBeLessThan(5_000);
  });

  it("SEC-11: the dev cookie has no Secure flag", async () => {
    const res = await logIn(makeApp(false));
    expect(attributes(res.headers.get("set-cookie") ?? "").has("secure")).toBe(false);
  });

  it("SEC-08: production over HTTPS via the trusted proxy sets __Host-nosh.sid, Secure, Path=/, no Domain", async () => {
    const res = await logIn(makeApp(true), { "x-test-peer": PROXY, "x-forwarded-proto": "https" });
    expect(res.status).toBe(200);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-nosh\.sid=token-1;/);
    const attrs = attributes(header);
    expect(attrs.has("secure")).toBe(true);
    expect(attrs.has("httponly")).toBe(true);
    expect(attrs.get("samesite")).toBe("Lax");
    expect(attrs.get("path")).toBe("/");
    expect(attrs.has("domain")).toBe(false);
  });

  it("SEC-09: production over plain HTTP logs in but sets no cookie", async () => {
    const res = await logIn(makeApp(true), { "x-test-peer": PROXY, "x-forwarded-proto": "http" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("SEC-09 SEC-14: an untrusted peer claiming https gets no cookie", async () => {
    const res = await logIn(makeApp(true), { "x-test-peer": "198.51.100.1", "x-forwarded-proto": "https" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("SEC-09 SEC-14: an untrusted peer with an absolute https:// request line gets no cookie", async () => {
    // @hono/node-server takes an absolute-form request line as the URL even on
    // a plain TCP socket; the server never terminates TLS itself.
    const res = await makeApp(true).request("https://nosh.example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-peer": "198.51.100.1" },
      body: JSON.stringify({ username: "alice", password: "secret" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("SEC-10: production logout clears __Host-nosh.sid with Secure and Path=/", async () => {
    const auth = fakeAuth();
    const res = await makeApp(true, auth).request("/api/auth/logout", {
      method: "POST",
      headers: { "x-test-peer": PROXY, "x-forwarded-proto": "https", cookie: "__Host-nosh.sid=token-9" },
    });
    expect(res.status).toBe(204);
    expect(auth.loggedOut).toEqual(["token-9"]);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/^__Host-nosh\.sid=;/);
    const attrs = attributes(header);
    expect(attrs.has("secure")).toBe(true);
    expect(attrs.get("path")).toBe("/");
    expect(attrs.has("domain")).toBe(false);
    expect(attrs.get("max-age")).toBe("0");
  });

  it("SEC-10: production ignores a dev-named cookie, so logout revokes nothing", async () => {
    const auth = fakeAuth();
    await makeApp(true, auth).request("/api/auth/logout", {
      method: "POST",
      headers: { "x-test-peer": PROXY, "x-forwarded-proto": "https", cookie: "nosh.sid=token-9" },
    });
    expect(auth.loggedOut).toEqual([]);
  });
});

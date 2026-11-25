import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createApp } from "./app.js";
import { unusedDeps } from "../test/unusedDeps.js";
import type { AuthService } from "./auth/service.js";
import { loadConfig } from "./config/env.js";

const PROD_ORIGIN = "https://nosh.itsthomassito.com";
const DEV_ORIGIN = "http://localhost:5173";
const FORBIDDEN = { error: "Request origin not allowed" };

const config = loadConfig({
  DATABASE_URL: "postgres://unused",
  ALLOWED_ORIGINS: `${PROD_ORIGIN},${DEV_ORIGIN}`,
  TRUSTED_PROXIES: "172.20.0.2",
});

const unused = () => {
  throw new Error("AuthService is not used by these tests");
};
const auth: AuthService = {
  signUp: unused,
  logIn: unused,
  logOut: unused,
  getSession: unused,
  accountKey: unused,
};

function makeApp() {
  return createApp({
    config,
    auth,
    ...unusedDeps,
    getPeer: (c) => c.req.header("x-test-peer") ?? "127.0.0.1",
    failureDelayMs: 0,
  });
}

let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function post(path: string, headers: Record<string, string> = {}, method = "POST") {
  return makeApp().request(path, { method, headers });
}

function boomApp() {
  const app = makeApp();
  app.get("/__test/boom", () => {
    throw new Error("/secret/path boom");
  });
  return app;
}

describe("origin check", () => {
  it.each([PROD_ORIGIN, DEV_ORIGIN])("SEC-01: accepts a POST from configured origin %s", async (origin) => {
    const res = await post("/api/auth/logout", { origin });
    expect(res.status).toBe(204);
  });

  it.each([
    "https://evil.example",
    "https://x.nosh.itsthomassito.com",
    "http://nosh.itsthomassito.com",
    "https://nosh.itsthomassito.com:443",
    "null",
  ])("SEC-02: rejects a POST from %s", async (origin) => {
    const res = await post("/api/auth/logout", { origin });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(FORBIDDEN);
  });

  it.each(["same-origin", "none"])("SEC-03: accepts a POST with no Origin and Sec-Fetch-Site: %s", async (site) => {
    const res = await post("/api/auth/logout", { "sec-fetch-site": site });
    expect(res.status).toBe(204);
  });

  it.each(["cross-site", "same-site"])("SEC-03: rejects a POST with no Origin and Sec-Fetch-Site: %s", async (site) => {
    const res = await post("/api/auth/logout", { "sec-fetch-site": site });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(FORBIDDEN);
  });

  it("SEC-04: accepts a POST with neither header (a non-browser client like curl)", async () => {
    const res = await post("/api/auth/logout");
    expect(res.status).toBe(204);
  });

  it.each(["PUT", "PATCH", "DELETE"])("SEC-05: applies to %s too", async (method) => {
    const res = await post("/api/auth/logout", { origin: "https://evil.example" }, method);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(FORBIDDEN);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("SEC-05: doesn't apply to safe method %s", async (method) => {
    const res = await makeApp().request("/health", { method, headers: { origin: "https://evil.example" } });
    expect(res.status).not.toBe(403);
    // OPTIONS has no route here (404); the point is that the origin check let it through.
    expect(await res.text()).not.toContain(FORBIDDEN.error);
  });

  it("SEC-06: sends no CORS headers — the API is only ever called same-origin", async () => {
    const app = makeApp();
    const responses = await Promise.all([
      app.request("/health", { headers: { origin: PROD_ORIGIN } }),
      app.request("/api/auth/logout", { method: "POST", headers: { origin: PROD_ORIGIN } }),
      app.request("/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }),
      app.request("/api/auth/logout", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      }),
    ]);
    for (const res of responses) {
      const cors = [...res.headers.keys()].filter((name) => name.startsWith("access-control-"));
      expect(cors).toEqual([]);
    }
  });
});

describe("health", () => {
  it("SEC-23: GET /health answers 200 {\"status\":\"ok\"} and nothing else", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"status":"ok"}');
  });
});

describe("error shape", () => {
  it("SEC-26: returns 400, not 500, for a malformed JSON body — without echoing it", async () => {
    const res = await makeApp().request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Invalid request" });
    expect(text).not.toContain("not json");
  });

  it("SEC-29: a SyntaxError thrown by a route is a bug: 500, logged, not a quiet 400", async () => {
    const app = makeApp();
    app.get("/__test/syntax", (c) => c.json(JSON.parse("{broken") as object));
    const res = await app.request("/__test/syntax");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("SEC-27: answers 413 for a body over 100 KB", async () => {
    const body = JSON.stringify({ padding: "x".repeat(101 * 1024) });
    const res = await makeApp().request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Request body too large" });
  });

  it("SEC-28: returns JSON for an unknown route rather than an HTML page", async () => {
    const res = await makeApp().request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("SEC-29: answers 500 without details and logs the error server-side", async () => {
    const res = await boomApp().request("/__test/boom");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Internal server error" });
    expect(text).not.toContain("/secret/path");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("response headers", () => {
  async function sampleResponses() {
    const app = boomApp();
    return {
      health: await app.request("/health"),
      forbidden: await app.request("/api/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }),
      notFound: await app.request("/nope"),
      error: await app.request("/__test/boom"),
    };
  }

  it("SEC-30: doesn't advertise the framework", async () => {
    for (const res of Object.values(await sampleResponses())) {
      expect(res.headers.has("x-powered-by")).toBe(false);
    }
  });

  it("SEC-60: every response carries nosniff and Referrer-Policy, and no CSP", async () => {
    const responses = await sampleResponses();
    expect(responses.forbidden.status).toBe(403);
    expect(responses.notFound.status).toBe(404);
    expect(responses.error.status).toBe(500);
    for (const res of Object.values(responses)) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
      expect(res.headers.has("content-security-policy")).toBe(false);
    }
  });
});

describe("request log", () => {
  it("logs one line with method, path without the query string, status and client IP", async () => {
    await makeApp().request("/health?token=secret", {
      headers: { "x-test-peer": "172.20.0.2", "x-forwarded-for": "203.0.113.9" },
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(line).toContain("GET /health 200 203.0.113.9");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("\n");
  });

  it("logs the still-encoded path, so CR/LF in a URL cannot forge extra log lines", async () => {
    await makeApp().request("/x%0AGET%20/health%20200%201.2.3.4%0Dy");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(line).toContain("/x%0AGET%20/health%20200%201.2.3.4%0Dy 404");
    expect(line).not.toMatch(/[\r\n]/);
  });

  it("SEC-29: logs an unexpected error as one line, even when its message holds CR/LF from the request", async () => {
    const app = makeApp();
    app.get("/__test/echo/:x", (c) => {
      throw new Error(c.req.param("x"));
    });
    const res = await app.request("/__test/echo/a%0Dforged%0Aline");
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const args = errorSpy.mock.calls[0] ?? [];
    expect(args).toHaveLength(1);
    const line = String(args[0]);
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain("/__test/echo/a%0Dforged%0Aline");
  });
});

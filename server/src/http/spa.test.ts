import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { AuthService } from "../auth/service.js";
import { loadConfig } from "../config/env.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused" });
const unusedFn = () => {
  throw new Error("not used");
};
const auth: AuthService = {
  signUp: unusedFn,
  logIn: unusedFn,
  logOut: unusedFn,
  getSession: async () => null,
  accountKey: unusedFn,
};

let root: string;
let distDir: string;
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "nosh-spa-"));
  distDir = join(root, "dist");
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>nosh</title>");
  writeFileSync(join(distDir, "assets", "app.js"), "console.log(1);");
  writeFileSync(join(root, "secret.txt"), "top secret");
});
afterAll(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const html = { accept: "text/html,application/xhtml+xml" };
const makeApp = (dir = distDir) =>
  createApp({ config, auth, getPeer: () => "127.0.0.1", failureDelayMs: 0, webDistDir: dir });

describe("SPA serving (SEC-28, SEC-60)", () => {
  it.each(["/", "/recipes/abc"])("serves index.html for an HTML GET of %s", async (path) => {
    const res = await makeApp().request(path, { headers: html });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>nosh</title>");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
  });

  it("answers HEAD for an HTML path with the same headers", async () => {
    const res = await makeApp().request("/recipes/abc", { method: "HEAD", headers: html });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("serves assets as immutable files with the SEC-60 headers", async () => {
    const res = await makeApp().request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("console.log(1);");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
  });

  it("answers a missing asset with the JSON 404, even when HTML is accepted", async () => {
    const res = await makeApp().request("/assets/missing.js", { headers: html });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("never serves index.html for /api or /health paths", async () => {
    const api = await makeApp().request("/api/nope", { headers: html });
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "Not authenticated" });
    const health = await makeApp().request("/health/x", { headers: html });
    expect(health.status).toBe(404);
    expect(await health.json()).toEqual({ error: "Not found" });
  });

  it("answers non-HTML requests for unknown paths with the JSON 404", async () => {
    const res = await makeApp().request("/recipes/abc", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
  });

  it.each(["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/..%5csecret.txt"])(
    "does not escape the dist directory via %s",
    async (path) => {
      const res = await makeApp().request(path);
      expect(await res.text()).not.toContain("top secret");
    },
  );

  it("boots without a dist directory: HTML requests fall to the JSON 404", async () => {
    const res = await makeApp(join(root, "nope")).request("/", { headers: html });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

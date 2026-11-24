import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { Hono } from "hono";
import { getMimeType } from "hono/utils/mime";
import type { AppEnv } from "./context.js";

const ONE_YEAR_S = 31536000;

const isApiPath = (path: string): boolean =>
  path === "/api" || path.startsWith("/api/") || path === "/health" || path.startsWith("/health/");

/** A file under `root`, or null: anything outside it, a directory, or missing. */
async function readInside(root: string, urlPath: string): Promise<Buffer | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
  const rel = relative(root, file);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === rel) return null;
  try {
    if (!(await stat(file)).isFile()) return null;
    return await readFile(file);
  } catch {
    return null;
  }
}

/**
 * SEC-28: serve the built web app. Real files under `webDistDir` as they are;
 * an HTML navigation to any other path gets index.html (client-side routing);
 * everything else, /api and /health included, falls through to the JSON 404.
 * Mount it after the API routes. A missing directory just means no SPA.
 */
export function mountSpa(app: Hono<AppEnv>, webDistDir: string): void {
  const root = resolve(webDistDir);

  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const path = new URL(c.req.url).pathname;
    if (isApiPath(path)) return next();

    const file = path === "/" ? null : await readInside(root, path);
    if (file) {
      const immutable = path.startsWith("/assets/");
      return c.body(new Uint8Array(file), 200, {
        "Content-Type": getMimeType(path) ?? "application/octet-stream",
        "Cache-Control": immutable ? `public, max-age=${ONE_YEAR_S}, immutable` : "no-cache",
      });
    }

    // A missing asset is a real 404, not the app shell.
    if (path.startsWith("/assets/")) return next();
    if (!(c.req.header("accept") ?? "").includes("text/html")) return next();
    const index = await readInside(root, "/index.html");
    if (!index) return next();
    return c.body(new Uint8Array(index), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
  });
}

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { FixedWindowLimiter, tooMany } from "./rateLimit.js";

function setup(limit = 3, windowMs = 60_000) {
  let time = 1_000_000;
  const limiter = new FixedWindowLimiter({ limit, windowMs, now: () => time });
  return { limiter, advance: (ms: number) => (time += ms) };
}

describe("FixedWindowLimiter (SEC-16)", () => {
  it("allows up to the limit in a window, then reports the whole seconds until it resets", () => {
    const { limiter, advance } = setup();
    expect(limiter.hit("a")).toEqual({ ok: true });
    expect(limiter.hit("a")).toEqual({ ok: true });
    advance(10_500);
    expect(limiter.hit("a")).toEqual({ ok: true });
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterSec: 50 });
    advance(49_400);
    expect(limiter.hit("a")).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it("starts a fresh window once the old one expires", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    expect(limiter.hit("a").ok).toBe(false);
    advance(60_000);
    expect(limiter.hit("a")).toEqual({ ok: true });
    expect(limiter.hit("a")).toEqual({ ok: true });
    expect(limiter.hit("a")).toEqual({ ok: true });
    expect(limiter.hit("a").ok).toBe(false);
  });

  it("keeps keys independent", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    expect(limiter.hit("a").ok).toBe(false);
    expect(limiter.hit("b")).toEqual({ ok: true });
  });

  it("forgets a key on reset", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    limiter.reset("a");
    expect(limiter.hit("a")).toEqual({ ok: true });
  });

  it("blocked reports the wait at the limit without counting a hit", () => {
    const { limiter, advance } = setup();
    expect(limiter.blocked("a")).toBeNull();
    limiter.hit("a");
    limiter.hit("a");
    for (let i = 0; i < 5; i++) expect(limiter.blocked("a")).toBeNull();
    expect(limiter.hit("a")).toEqual({ ok: true });
    advance(30_000);
    expect(limiter.blocked("a")).toBe(30);
    advance(30_000);
    expect(limiter.blocked("a")).toBeNull();
  });
});

describe("tooMany (SEC-16)", () => {
  it("answers 429 with the fixed message and Retry-After", async () => {
    const app = new Hono().get("/", (c) => tooMany(c, 42));
    const res = await app.request("/");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(await res.json()).toEqual({ error: "Too many attempts — try again later" });
  });
});

import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  function limiterAt(start = 0) {
    let time = start;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: () => time });
    return { limiter, advance: (ms: number) => (time += ms) };
  }

  it("allows up to max hits in a window, then reports seconds until it resets", () => {
    const { limiter, advance } = limiterAt();
    limiter.hit("a");
    limiter.hit("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
    limiter.hit("a");
    expect(limiter.retryAfterSeconds("a")).toBe(60);
    advance(45_000);
    expect(limiter.retryAfterSeconds("a")).toBe(15);
  });

  it("starts a fresh window once the old one expires", () => {
    const { limiter, advance } = limiterAt();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    advance(60_000);
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("keeps keys independent", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    expect(limiter.retryAfterSeconds("b")).toBe(0);
  });

  it("forgets a key on reset", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 3; i++) limiter.hit("a");
    limiter.reset("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });
});

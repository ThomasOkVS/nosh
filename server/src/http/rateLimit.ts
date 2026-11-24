import type { Context } from "hono";

interface Window {
  count: number;
  resetAt: number;
}

/** Above this many keys, expired windows are swept on the next hit. */
const SWEEP_THRESHOLD = 10_000;

/**
 * SEC-16: a fixed-window counter per key, in memory (counters reset on
 * restart, which the spec allows).
 */
export class FixedWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #windows = new Map<string, Window>();

  constructor(opts: { limit: number; windowMs: number; now?: () => number }) {
    this.#limit = opts.limit;
    this.#windowMs = opts.windowMs;
    this.#now = opts.now ?? Date.now;
  }

  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = this.#now();
    const window = this.#current(key, now);
    if (!window) {
      if (this.#windows.size >= SWEEP_THRESHOLD) this.#sweep(now);
      this.#windows.set(key, { count: 1, resetAt: now + this.#windowMs });
      return { ok: true };
    }
    if (window.count >= this.#limit) {
      return { ok: false, retryAfterSec: retryAfter(window, now) };
    }
    window.count += 1;
    return { ok: true };
  }

  /** The seconds to wait if `key` is at its limit, else null. Counts nothing. */
  blocked(key: string): number | null {
    const now = this.#now();
    const window = this.#current(key, now);
    return window && window.count >= this.#limit ? retryAfter(window, now) : null;
  }

  reset(key: string): void {
    this.#windows.delete(key);
  }

  #current(key: string, now: number): Window | undefined {
    const window = this.#windows.get(key);
    if (window && now >= window.resetAt) {
      this.#windows.delete(key);
      return undefined;
    }
    return window;
  }

  #sweep(now: number): void {
    for (const [key, window] of this.#windows) {
      if (now >= window.resetAt) this.#windows.delete(key);
    }
  }
}

function retryAfter(window: Window, now: number): number {
  return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
}

/** SEC-16: 429 with the whole seconds until the window ends. */
export function tooMany(c: Context, retryAfterSec: number): Response {
  c.header("Retry-After", String(retryAfterSec));
  return c.json({ error: "Too many attempts — try again later" }, 429);
}

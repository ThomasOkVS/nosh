import type { NextFunction, Request, Response } from "express";

/**
 * A fixed-window counter per key, held in memory.
 *
 * In memory is enough for one backend process; it resets on restart, which
 * at worst gives an attacker one fresh window per deploy. Deliberately not the
 * `express-rate-limit` package: the whole mechanism is this file, and the
 * login route needs "count only failures, per account" semantics that a
 * request-counting middleware doesn't give directly anyway.
 */
export interface RateLimiter {
  /** Counts one event for `key`. */
  hit(key: string): void;
  /** Seconds until `key` may try again, or 0 if it isn't limited right now. */
  retryAfterSeconds(key: string): number;
  reset(key: string): void;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

// Above this many tracked keys, expired entries are swept on the next hit —
// keeps a flood of distinct keys (e.g. random usernames) from growing the map
// without bound.
const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter({
  windowMs,
  max,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  function current(key: string): { count: number; resetAt: number } | undefined {
    const entry = windows.get(key);
    if (entry && entry.resetAt <= now()) {
      windows.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    hit(key) {
      if (windows.size > SWEEP_THRESHOLD) {
        const time = now();
        for (const [k, entry] of windows) if (entry.resetAt <= time) windows.delete(k);
      }
      const entry = current(key);
      if (entry) entry.count++;
      else windows.set(key, { count: 1, resetAt: now() + windowMs });
    },
    retryAfterSeconds(key) {
      const entry = current(key);
      if (!entry || entry.count < max) return 0;
      return Math.max(1, Math.ceil((entry.resetAt - now()) / 1000));
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

/** Sends the standard 429 if `key` is limited; returns whether it did. */
export function rejectIfLimited(limiter: RateLimiter, key: string, res: Response): boolean {
  const retryAfter = limiter.retryAfterSeconds(key);
  if (retryAfter === 0) return false;
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ error: "Too many attempts — try again later" });
  return true;
}

/**
 * Counts every request for the logged-in user and rejects past `max` per
 * window. Mount after `requireAuth`, so there's always a user to key on.
 */
export function limitPerUser(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = String(req.session.userId);
    if (rejectIfLimited(limiter, key, res)) return;
    limiter.hit(key);
    next();
  };
}

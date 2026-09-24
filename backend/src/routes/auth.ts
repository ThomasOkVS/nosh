import argon2 from "argon2";
import type { Request } from "express";
import { Router } from "express";
import type { Pool } from "pg";
import { createRateLimiter, rejectIfLimited } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";
import { createUser, findUserByEmail, findUserById, findUserByUsername } from "../repositories/users";
import { loginSchema, signupSchema } from "../validation/auth";

// Regenerating the session on login/signup gives each authenticated session a
// fresh session ID, so a session ID an attacker planted before authentication
// (session fixation) can't be reused to inherit the now-authenticated session.
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Keys a limiter on the client IP. Only meaningful because `trust proxy` is
 * limited to our own reverse proxy (see app.ts) — otherwise every request
 * would share the proxy's IP, i.e. one bucket for everybody. */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface AuthRouterDeps {
  pool: Pool;
  allowSignup: boolean;
  /** Added to every failed login, so each guess costs the guesser a second
   * even within the rate limit. */
  failureDelayMs?: number;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { pool, allowSignup, failureDelayMs = 1000 } = deps;
  const router = Router();

  // Two independent login limits, because each alone has a gap: per IP
  // alone lets a botnet spread guesses at one account over many IPs; per
  // account alone lets one IP try a few passwords against every account.
  // The account limit counts failures only and resets on success, so the
  // real owner is only locked out while someone is actively guessing.
  const loginsPerIp = createRateLimiter({ windowMs: FIFTEEN_MINUTES_MS, max: 20 });
  const loginFailuresPerAccount = createRateLimiter({ windowMs: FIFTEEN_MINUTES_MS, max: 10 });
  const signupsPerIp = createRateLimiter({ windowMs: ONE_HOUR_MS, max: 5 });

  // A real hash to verify against when the username doesn't exist, so an
  // unknown username takes as long as a wrong password — otherwise response
  // time would reveal which usernames are registered.
  const dummyHash = argon2.hash("nosh-timing-equalizer");

  router.post("/signup", async (req, res, next) => {
    // Enforced here, not by hiding the frontend's signup link: the API is
    // reachable directly.
    if (!allowSignup) {
      res.status(403).json({ error: "Sign-ups are disabled on this server" });
      return;
    }
    const ip = clientIp(req);
    if (rejectIfLimited(signupsPerIp, ip, res)) return;
    signupsPerIp.hit(ip);

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { email, username, password } = parsed.data;

    try {
      const existingEmail = await findUserByEmail(pool, email);
      if (existingEmail) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      const existingUsername = await findUserByUsername(pool, username);
      if (existingUsername) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }

      const passwordHash = await argon2.hash(password);
      const user = await createUser(pool, email, username, passwordHash);
      await regenerateSession(req);
      req.session.userId = user.id;
      res.status(201).json({ id: user.id, email: user.email, username: user.username });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { username, password } = parsed.data;
    const ip = clientIp(req);
    const account = username.toLowerCase();
    if (rejectIfLimited(loginsPerIp, ip, res)) return;
    if (rejectIfLimited(loginFailuresPerAccount, account, res)) return;
    loginsPerIp.hit(ip);

    try {
      const user = await findUserByUsername(pool, username);
      const passwordMatches = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
      if (!user || !passwordMatches) {
        loginFailuresPerAccount.hit(account);
        await delay(failureDelayMs);
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      loginFailuresPerAccount.reset(account);
      await regenerateSession(req);
      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email, username: user.username });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie("connect.sid");
      res.status(204).end();
    });
  });

  router.get("/me", requireAuth, async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const user = await findUserById(pool, userId);
      if (!user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      res.json({ id: user.id, email: user.email, username: user.username });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

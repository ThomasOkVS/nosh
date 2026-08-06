import argon2 from "argon2";
import type { Request } from "express";
import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth";
import { createUser, findUserByEmail, findUserById } from "../repositories/users";
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

export function createAuthRouter(pool: Pool): Router {
  const router = Router();

  router.post("/signup", async (req, res, next) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { email, password } = parsed.data;

    try {
      const existing = await findUserByEmail(pool, email);
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const passwordHash = await argon2.hash(password);
      const user = await createUser(pool, email, passwordHash);
      await regenerateSession(req);
      req.session.userId = user.id;
      res.status(201).json({ id: user.id, email: user.email });
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
    const { email, password } = parsed.data;

    try {
      const user = await findUserByEmail(pool, email);
      const passwordMatches = user ? await argon2.verify(user.passwordHash, password) : false;
      if (!user || !passwordMatches) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email });
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
      res.json({ id: user.id, email: user.email });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

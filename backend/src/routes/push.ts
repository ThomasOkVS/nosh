import { Router } from "express";
import type { Pool } from "pg";
import { requireAuth } from "../middleware/requireAuth";
import { deletePushSubscription, savePushSubscription } from "../repositories/pushSubscriptions";
import { pushSubscriptionSchema, pushUnsubscribeSchema } from "../validation/push";

/**
 * Web Push opt-in. `vapidPublicKey` is undefined when the server has no
 * VAPID keys configured, in which case every route answers 503 and the
 * frontend hides its "Notify me" controls — the same "feature is off, the
 * rest of the app still works" pattern as a missing GEMINI_API_KEY.
 */
export function createPushRouter(pool: Pool, vapidPublicKey: string | undefined): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((_req, res, next) => {
    if (!vapidPublicKey) {
      res.status(503).json({ error: "Push notifications are not configured on this server" });
      return;
    }
    next();
  });

  /** Served at runtime rather than baked in as a VITE_* build arg, so
   * rotating keys is an .env change, not a frontend image rebuild. */
  router.get("/vapid-public-key", (_req, res) => {
    res.json({ publicKey: vapidPublicKey });
  });

  router.post("/subscriptions", async (req, res, next) => {
    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    try {
      const { endpoint, keys } = parsed.data;
      await savePushSubscription(pool, req.session.userId!, { endpoint, ...keys });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // DELETE with a body rather than the endpoint in the path: endpoints are
  // long URLs themselves, awkward to encode into a path segment.
  router.delete("/subscriptions", async (req, res, next) => {
    const parsed = pushUnsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    try {
      await deletePushSubscription(pool, req.session.userId!, parsed.data.endpoint);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

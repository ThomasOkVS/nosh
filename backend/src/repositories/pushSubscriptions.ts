import type { Pool } from "pg";

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Upsert on the endpoint: the same device re-subscribing (e.g. after the
 * user toggles notifications off and on) replaces its old keys, and a
 * device that changes hands between accounts moves to the new owner. */
export async function savePushSubscription(
  pool: Pool,
  userId: number,
  subscription: PushSubscriptionRecord,
): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, subscription.endpoint, subscription.p256dh, subscription.auth],
  );
}

export async function deletePushSubscription(pool: Pool, userId: number, endpoint: string): Promise<void> {
  await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
    userId,
    endpoint,
  ]);
}

/** Unscoped by user: used when the push service itself reports the
 * endpoint is gone, which is true no matter who owns it. */
export async function deletePushSubscriptionByEndpoint(pool: Pool, endpoint: string): Promise<void> {
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function listPushSubscriptions(pool: Pool, userId: number): Promise<PushSubscriptionRecord[]> {
  const result = await pool.query<PushSubscriptionRecord>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  return result.rows;
}

import { apiFetch } from "./client";

/** 503 when the server has no VAPID keys configured — push is then off. */
export async function getVapidPublicKey(): Promise<string> {
  const { publicKey } = await apiFetch<{ publicKey: string }>("/push/vapid-public-key");
  return publicKey;
}

/** `subscription.toJSON()` of a browser PushSubscription. */
export function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  return apiFetch<void>("/push/subscriptions", {
    method: "POST",
    body: { endpoint: subscription.endpoint, keys: subscription.keys },
  });
}

export function deletePushSubscription(endpoint: string): Promise<void> {
  return apiFetch<void>("/push/subscriptions", { method: "DELETE", body: { endpoint } });
}

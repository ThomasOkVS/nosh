import { deletePushSubscription, getVapidPublicKey, savePushSubscription } from "../api/push";

/**
 * Web Push, browser side. The flow: ask permission → have the browser
 * create a subscription with its push service (Apple's, Google's, ...)
 * against our server's VAPID public key → send that subscription to our
 * backend, which uses it to push "import finished" messages that the
 * service worker (src/sw.ts) turns into notifications.
 *
 * Every API used here is secure-context-only (HTTPS or localhost), and on
 * iOS only exists in a web app added to the home screen — plain Safari
 * tabs don't expose `PushManager` at all. So everything is feature-detected
 * and the UI simply hides its notification controls when unsupported.
 */

export type PushStatus =
  /** This browser can't receive pushes here (insecure origin, a Safari tab
   * rather than the home-screen app, or the server has push turned off). */
  | "unsupported"
  /** Supported, not subscribed, and the user hasn't been asked yet. */
  | "off"
  | "on"
  /** The user said no; only the OS/browser settings can undo that. */
  | "denied";

export function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Fetched once per page load; rejects when the server has push disabled.
let vapidKeyPromise: Promise<string> | null = null;
function vapidKey(): Promise<string> {
  vapidKeyPromise ??= getVapidPublicKey().catch((err: unknown) => {
    vapidKeyPromise = null;
    throw err;
  });
  return vapidKeyPromise;
}

/** The VAPID key arrives base64url-encoded; `subscribe()` wants raw bytes. */
function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!browserSupportsPush()) return "unsupported";
  try {
    await vapidKey();
  } catch {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

/**
 * Must be called directly from a click handler: browsers (Safari strictly)
 * only show the permission prompt in response to a user gesture.
 */
export async function enablePush(): Promise<PushStatus> {
  if (!browserSupportsPush()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by every browser: each push must show a notification.
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(await vapidKey()),
    }));
  await savePushSubscription(subscription.toJSON());
  return "on";
}

export async function disablePush(): Promise<PushStatus> {
  if (!browserSupportsPush()) return "unsupported";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await deletePushSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return "off";
}

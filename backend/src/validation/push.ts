import { z } from "zod";

/**
 * The push services browsers actually hand out endpoints for. The backend
 * POSTs to whatever endpoint a subscription names, so accepting any URL
 * would let a signed-in user point the server at arbitrary hosts (including
 * internal ones) — the same SSRF concern `validateUrl` guards recipe import
 * against. An allowlist is stricter than that guard and costs nothing: a
 * real subscription only ever points at one of these.
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /(^|\.)push\.apple\.com$/, // Safari / iOS home-screen apps (web.push.apple.com)
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Chromium), Android
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox (updates.push.services.mozilla.com)
  /(^|\.)notify\.windows\.com$/, // Legacy Edge / Windows push (WNS)
];

function isKnownPushService(endpoint: string): boolean {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return protocol === "https:" && PUSH_SERVICE_HOSTS.some((host) => host.test(hostname));
  } catch {
    return false;
  }
}

// The shape of `PushSubscription.toJSON()` in the browser.
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().refine(isKnownPushService, { message: "Not a recognized push service endpoint" }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});

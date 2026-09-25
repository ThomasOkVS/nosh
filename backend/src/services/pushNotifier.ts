import https from "node:https";
import type { Pool } from "pg";
import webpush from "web-push";
import type { ImportJob } from "../repositories/importJobs";
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptions,
  type PushSubscriptionRecord,
} from "../repositories/pushSubscriptions";
import { isAllowedPushEndpoint } from "./pushEndpoint";
import { BlockedAddressError, createGuardedLookup, type AddressGuardOptions } from "./safeFetch";

/** What the service worker receives (see frontend/src/sw.ts). `url` is the
 * in-app path to open when the notification is tapped. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends one push message to one subscription. Rejects with an error carrying
 * the push service's HTTP `statusCode` on failure — the same shape as
 * web-push's own `WebPushError`, so the real implementation is a thin
 * wrapper and tests can fake it without touching Apple's/Google's servers.
 */
export type SendPushFn = (subscription: PushSubscriptionRecord, payload: PushPayload) => Promise<void>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** A `mailto:` or `https:` URL the push service can contact about abuse.
   * Apple rejects the VAPID JWT outright if this isn't a well-formed URL. */
  subject: string;
}

/** The subscription's endpoint isn't a known push service (see
 * pushEndpoint.ts), so nothing was sent to it. */
export class DisallowedPushEndpointError extends Error {
  constructor() {
    super("Not a recognized push service endpoint");
  }
}

/**
 * The real sender. Refuses an endpoint off the allowlist, and connects
 * through safeFetch.ts's guarded DNS lookup, so even an allowlisted name
 * that resolved to an internal address would be refused
 * (`BlockedAddressError`) rather than posted to. `guard` is overridable only
 * so tests can make a push host resolve to a private address.
 */
export function createWebPushSender(vapid: VapidConfig, guard: AddressGuardOptions = {}): SendPushFn {
  const lookup = createGuardedLookup(guard.resolve, guard.isBlocked);
  return async (subscription, payload) => {
    if (!isAllowedPushEndpoint(subscription.endpoint)) throw new DisallowedPushEndpointError();
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        // Worth delivering for a while if the phone is off, but an import
        // result from yesterday isn't news — a day is plenty.
        TTL: 60 * 60 * 24,
        // A fresh, non-keep-alive agent per send: every connection runs the
        // guarded lookup, none reuses an already-open socket. web-push
        // silently ignores an agent that isn't an https.Agent.
        agent: new https.Agent({ lookup, keepAlive: false }),
      },
    );
  };
}

export type ImportFinishedNotifier = (job: ImportJob) => Promise<void>;

export function importFinishedPayload(job: ImportJob): PushPayload {
  if (job.status === "done" && job.recipe) {
    return {
      title: "Recipe ready",
      body: `${job.recipe.title} — tap to review and save it.`,
      url: `/recipes/new?importId=${job.id}`,
    };
  }
  return {
    title: "Import failed",
    body: job.errorMessage ?? "Couldn't import that recipe.",
    // The app restores the failed job on launch and shows its error there.
    url: "/",
  };
}

/** The endpoint must never be sent to: off the allowlist, or it resolved to
 * a blocked address. Treated like a gone subscription — deleted — since
 * retrying it on the next import can only fail the same way. */
function isForbiddenEndpointError(err: unknown): boolean {
  return err instanceof DisallowedPushEndpointError || err instanceof BlockedAddressError;
}

function isGoneError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode;
  // 404/410 mean the subscription no longer exists (the user revoked
  // permission, reinstalled the app, ...) and never will again.
  return statusCode === 404 || statusCode === 410;
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unparseable URL";
  }
}

/** Fans one import result out to every device the user subscribed. Never
 * throws: a notification is a nice-to-have on top of the saved job, and a
 * push failure must not turn a successful import into a failed one. */
export function createImportFinishedNotifier(pool: Pool, sendPush: SendPushFn): ImportFinishedNotifier {
  return async (job) => {
    try {
      const subscriptions = await listPushSubscriptions(pool, job.userId);
      const payload = importFinishedPayload(job);
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            // Checked here too, not only inside the real sender, so a
            // disallowed endpoint never reaches whichever SendPushFn is in use.
            if (!isAllowedPushEndpoint(subscription.endpoint)) throw new DisallowedPushEndpointError();
            await sendPush(subscription, payload);
          } catch (err) {
            if (isForbiddenEndpointError(err)) {
              // The host only, never the full endpoint: its path is the
              // device's push token.
              console.warn(
                `Deleted a push subscription to a disallowed endpoint (${endpointHost(subscription.endpoint)})`,
              );
              await deletePushSubscriptionByEndpoint(pool, subscription.endpoint);
            } else if (isGoneError(err)) {
              await deletePushSubscriptionByEndpoint(pool, subscription.endpoint);
            } else {
              console.warn("Push notification failed:", err);
            }
          }
        }),
      );
    } catch (err) {
      console.warn("Couldn't send import notifications:", err);
    }
  };
}

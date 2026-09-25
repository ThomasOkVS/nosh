import { z } from "zod";
import { isAllowedPushEndpoint } from "../services/pushEndpoint";

// The shape of `PushSubscription.toJSON()` in the browser. The endpoint must
// be a known push service — see services/pushEndpoint.ts for why.
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().refine(isAllowedPushEndpoint, { message: "Not a recognized push service endpoint" }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});

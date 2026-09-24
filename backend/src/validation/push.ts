import { z } from "zod";

// The shape of `PushSubscription.toJSON()` in the browser. Only https
// endpoints are accepted: every real push service (Apple, Google, Mozilla)
// uses one, and anything else would make the server POST to an arbitrary
// URL of the client's choosing.
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url(),
});

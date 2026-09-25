import crypto from "node:crypto";
import webpush from "web-push";
import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./pushEndpoint";
import { createWebPushSender, DisallowedPushEndpointError } from "./pushNotifier";
import { BlockedAddressError } from "./safeFetch";

// Real keys, so web-push gets as far as opening the connection: it signs the
// VAPID JWT and encrypts the payload before it sends anything.
const vapidKeys = webpush.generateVAPIDKeys();
const VAPID = { ...vapidKeys, subject: "mailto:test@example.com" };
const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const KEYS = {
  p256dh: ecdh.getPublicKey().toString("base64url"),
  auth: crypto.randomBytes(16).toString("base64url"),
};
const PAYLOAD = { title: "Recipe ready", body: "Soup", url: "/" };

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://web.push.apple.com/QOcMHuNmZcR1X2h4BLyLuRbJp1wX0x",
    "https://fcm.googleapis.com/fcm/send/dXkpbY8xR0U:APA91bHqA7G9Q2yT0dc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
  ])("allows %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://172.28.0.1:5001/",
    "https://172.28.0.1/push",
    "http://web.push.apple.com/abc",
    "https://web.push.apple.com:8443/abc",
    "https://user@web.push.apple.com/abc",
    "https://web.push.apple.com.evil.example/abc",
    "https://storage.googleapis.com/abc",
    "not a url",
  ])("refuses %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe("createWebPushSender", () => {
  it("refuses an endpoint off the allowlist without connecting anywhere", async () => {
    const send = createWebPushSender(VAPID, {
      resolve: () => Promise.reject(new Error("must not resolve")),
    });
    await expect(send({ endpoint: "https://172.28.0.1:5001/x", ...KEYS }, PAYLOAD)).rejects.toBeInstanceOf(
      DisallowedPushEndpointError,
    );
  });

  it("refuses an allowlisted host whose DNS answer is an internal address", async () => {
    // As if fcm.googleapis.com's DNS were poisoned to point at the Docker
    // host: the connection is refused at lookup, nothing is posted.
    const send = createWebPushSender(VAPID, {
      resolve: () => Promise.resolve([{ address: "172.28.0.1", family: 4 }]),
    });
    await expect(
      send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...KEYS }, PAYLOAD),
    ).rejects.toBeInstanceOf(BlockedAddressError);
  });
});

import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/app";
import { getTestPool } from "../test/db";

async function signedInAgent(
  app: Express,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const username = email.split("@")[0]!;
  await agent.post("/auth/signup").send({ email, username, password: "correct-horse" });
  return agent;
}

const SUBSCRIPTION = {
  endpoint: "https://web.push.apple.com/device-1",
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
};

async function storedSubscriptions(): Promise<{ endpoint: string; p256dh: string }[]> {
  const result = await getTestPool().query<{ endpoint: string; p256dh: string }>(
    "SELECT endpoint, p256dh FROM push_subscriptions ORDER BY id",
  );
  return result.rows;
}

describe("push routes", () => {
  it("rejects requests with no session", async () => {
    const res = await request(createTestApp({ vapidPublicKey: "pk" })).get("/push/vapid-public-key");
    expect(res.status).toBe(401);
  });

  it("answers 503 everywhere when VAPID keys aren't configured", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "pushoff@example.com");

    expect((await agent.get("/push/vapid-public-key")).status).toBe(503);
    expect((await agent.post("/push/subscriptions").send(SUBSCRIPTION)).status).toBe(503);
  });

  it("serves the public key", async () => {
    const app = createTestApp({ vapidPublicKey: "the-public-key" });
    const agent = await signedInAgent(app, "pushkey@example.com");

    const res = await agent.get("/push/vapid-public-key");
    expect(res.body).toEqual({ publicKey: "the-public-key" });
  });

  it("upserts a subscription on its endpoint", async () => {
    const app = createTestApp({ vapidPublicKey: "pk" });
    const agent = await signedInAgent(app, "pushupsert@example.com");

    await agent.post("/push/subscriptions").send(SUBSCRIPTION);
    await agent
      .post("/push/subscriptions")
      .send({ ...SUBSCRIPTION, keys: { p256dh: "rotated-key", auth: "auth-secret" } });

    expect(await storedSubscriptions()).toEqual([
      { endpoint: SUBSCRIPTION.endpoint, p256dh: "rotated-key" },
    ]);
  });

  it.each([
    ["an unknown host", "https://internal.example/hook"],
    ["the Docker host's dockge port", "https://172.28.0.1:5001/push"],
    ["an internal URL over plain http", "http://172.28.0.1:5001/"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["a lookalike host", "https://fcm.googleapis.com.evil.example/send"],
    ["a non-443 port on a real push host", "https://fcm.googleapis.com:5001/fcm/send/abc"],
    ["explicit credentials", "https://user:pw@fcm.googleapis.com/fcm/send/abc"],
    ["another googleapis.com host", "https://storage.googleapis.com/bucket/object"],
  ])("rejects an endpoint that isn't a real push service (%s)", async (_label, endpoint) => {
    const app = createTestApp({ vapidPublicKey: "pk" });
    const agent = await signedInAgent(app, "pushhttp@example.com");

    const res = await agent.post("/push/subscriptions").send({ ...SUBSCRIPTION, endpoint });
    expect(res.status).toBe(400);
    expect(await storedSubscriptions()).toEqual([]);
  });

  it("accepts each major browser's push service", async () => {
    const app = createTestApp({ vapidPublicKey: "pk" });
    const agent = await signedInAgent(app, "pushhosts@example.com");

    for (const endpoint of [
      "https://web.push.apple.com/QGx1",
      // Realistic shapes, as the browsers hand them out.
      "https://web.push.apple.com/QOcMHuNmZcR1X2h4BLyLuRbJp1wX0x_jRmVUkHH3sfS3xXxKzV3v8G6uPVnQ8fB7jqD",
      "https://fcm.googleapis.com/fcm/send/dXkpbY8xR0U:APA91bHqA7G9Q2yT0dcZ8OTbPX3p2mXK4L2Kc1Z",
      "https://fcm.googleapis.com/wp/cT7x1rbX3zI:APA91bE4v0m",
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect((await agent.post("/push/subscriptions").send({ ...SUBSCRIPTION, endpoint })).status).toBe(204);
    }
  });

  it("unsubscribes only the caller's own subscription", async () => {
    const app = createTestApp({ vapidPublicKey: "pk" });
    const owner = await signedInAgent(app, "pushowner@example.com");
    const other = await signedInAgent(app, "pushother@example.com");
    await owner.post("/push/subscriptions").send(SUBSCRIPTION);

    await other.delete("/push/subscriptions").send({ endpoint: SUBSCRIPTION.endpoint });
    expect(await storedSubscriptions()).toHaveLength(1);

    await owner.delete("/push/subscriptions").send({ endpoint: SUBSCRIPTION.endpoint });
    expect(await storedSubscriptions()).toEqual([]);
  });
});

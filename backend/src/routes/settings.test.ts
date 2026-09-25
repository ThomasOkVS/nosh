import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { recordLlmUsage } from "../repositories/llmUsage";
import { createTestApp } from "../test/app";
import { getTestPool } from "../test/db";

async function signedInAgent(
  app: Express,
  username: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent
    .post("/auth/signup")
    .send({ email: `${username}@example.com`, username, password: "correct-horse" });
  return agent;
}

describe("GET /settings/magic-import", () => {
  it("requires a session", async () => {
    const res = await request(createTestApp()).get("/settings/magic-import");
    expect(res.status).toBe(401);
  });

  it("defaults to automatic and lists every allowed model with zero usage", async () => {
    const agent = await signedInAgent(createTestApp(), "alice");

    const res = await agent.get("/settings/magic-import");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      // No Gemini extractors injected into the test app.
      aiConfigured: false,
      selectedModel: null,
      defaultTextModel: "text-model",
      defaultVideoModel: "video-model",
    });
    expect(res.body.models).toEqual([
      {
        id: "text-model",
        dailyRequestLimit: 20,
        requestsToday: 0,
        promptTokensToday: 0,
        outputTokensToday: 0,
      },
      {
        id: "video-model",
        dailyRequestLimit: 500,
        requestsToday: 0,
        promptTokensToday: 0,
        outputTokensToday: 0,
      },
      {
        id: "other-model",
        dailyRequestLimit: null,
        requestsToday: 0,
        promptTokensToday: 0,
        outputTokensToday: 0,
      },
    ]);
  });

  it("sums today's usage per model, shared across all users", async () => {
    const pool = getTestPool();
    await recordLlmUsage(pool, "text-model", { promptTokens: 1000, outputTokens: 200 });
    await recordLlmUsage(pool, "text-model", { promptTokens: 500, outputTokens: 100 });
    await recordLlmUsage(pool, "video-model", { promptTokens: 6000, outputTokens: 400 });
    const agent = await signedInAgent(createTestApp(), "bob");

    const res = await agent.get("/settings/magic-import");

    const byId = new Map(
      (res.body.models as { id: string }[]).map((model) => [model.id, model] as const),
    );
    expect(byId.get("text-model")).toMatchObject({
      requestsToday: 2,
      promptTokensToday: 1500,
      outputTokensToday: 300,
    });
    expect(byId.get("video-model")).toMatchObject({ requestsToday: 1, promptTokensToday: 6000 });
  });

  it("reports aiConfigured when an extractor is present", async () => {
    const agent = await signedInAgent(createTestApp({ geminiExtract: async () => ({}) }), "carol");
    const res = await agent.get("/settings/magic-import");
    expect(res.body.aiConfigured).toBe(true);
  });
});

describe("PUT /settings/magic-import", () => {
  it("saves an allowed model and returns the updated settings", async () => {
    const agent = await signedInAgent(createTestApp(), "dana");

    const res = await agent.put("/settings/magic-import").send({ model: "other-model" });

    expect(res.status).toBe(200);
    expect(res.body.selectedModel).toBe("other-model");
    expect((await agent.get("/settings/magic-import")).body.selectedModel).toBe("other-model");
  });

  it("goes back to automatic with null", async () => {
    const agent = await signedInAgent(createTestApp(), "erin");
    await agent.put("/settings/magic-import").send({ model: "other-model" });

    const res = await agent.put("/settings/magic-import").send({ model: null });

    expect(res.body.selectedModel).toBeNull();
  });

  it("rejects a model that isn't on the allowlist", async () => {
    const agent = await signedInAgent(createTestApp(), "frank");

    const res = await agent.put("/settings/magic-import").send({ model: "../../evil" });

    expect(res.status).toBe(400);
    expect((await agent.get("/settings/magic-import")).body.selectedModel).toBeNull();
  });

  it("rejects a malformed body", async () => {
    const agent = await signedInAgent(createTestApp(), "gina");
    const res = await agent.put("/settings/magic-import").send({ model: 42 });
    expect(res.status).toBe(400);
  });

  it("keeps each user's choice separate", async () => {
    const app = createTestApp();
    const first = await signedInAgent(app, "hank");
    const second = await signedInAgent(app, "ivy");

    await first.put("/settings/magic-import").send({ model: "other-model" });

    expect((await second.get("/settings/magic-import")).body.selectedModel).toBeNull();
  });
});

describe("/settings/recipe-preferences", () => {
  it("requires a session", async () => {
    const res = await request(createTestApp()).get("/settings/recipe-preferences");
    expect(res.status).toBe(401);
  });

  it("defaults to original language, metric, °C and keeping spoons", async () => {
    const agent = await signedInAgent(createTestApp(), "jack");

    const res = await agent.get("/settings/recipe-preferences");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      language: null,
      unitSystem: "metric",
      temperatureUnit: "C",
      keepSpoons: true,
    });
  });

  it("updates only the fields sent", async () => {
    const agent = await signedInAgent(createTestApp(), "kim");

    await agent.put("/settings/recipe-preferences").send({ language: "nl" });
    const res = await agent.put("/settings/recipe-preferences").send({ unitSystem: "us" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      language: "nl",
      unitSystem: "us",
      temperatureUnit: "C",
      keepSpoons: true,
    });
    const cleared = await agent.put("/settings/recipe-preferences").send({ language: null });
    expect(cleared.body.language).toBeNull();
  });

  it.each([
    { language: "fr" },
    { unitSystem: "imperial" },
    { temperatureUnit: "K" },
    { keepSpoons: "yes" },
    { somethingElse: true },
  ])("rejects %j", async (body) => {
    const agent = await signedInAgent(createTestApp(), "lou");
    const res = await agent.put("/settings/recipe-preferences").send(body);
    expect(res.status).toBe(400);
  });

  it("keeps each user's preferences separate", async () => {
    const app = createTestApp();
    const first = await signedInAgent(app, "max");
    const second = await signedInAgent(app, "nia");

    await first.put("/settings/recipe-preferences").send({ temperatureUnit: "F" });

    expect((await second.get("/settings/recipe-preferences")).body.temperatureUnit).toBe("C");
  });
});

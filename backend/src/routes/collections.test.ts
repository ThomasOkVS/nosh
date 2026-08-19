import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/app";

async function signedInAgent(
  app: Express,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const username = email.split("@")[0]!;
  await agent.post("/auth/signup").send({ email, username, password: "correct-horse" });
  return agent;
}

const samplePayload = {
  title: "Tomato Soup",
  ingredients: [{ quantity: "1", unit: "kg", name: "tomatoes" }],
  steps: [{ instruction: "Simmer the tomatoes" }],
  tags: ["soup"],
};

describe("collection routes", () => {
  it("rejects requests with no session", async () => {
    const res = await request(createTestApp()).get("/collections");
    expect(res.status).toBe(401);
  });

  it("creates and lists collections with a recipe count", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const createRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({ name: "Weeknight dinners", recipeCount: 0 });

    const listRes = await agent.get("/collections");
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({ name: "Weeknight dinners", recipeCount: 0 });
  });

  it("rejects a collection with no name", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const res = await agent.post("/collections").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("renames a collection", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/collections").send({ name: "Weeknight dinners" });

    const renameRes = await agent
      .put(`/collections/${createRes.body.id}`)
      .send({ name: "Quick dinners" });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe("Quick dinners");
  });

  it("refuses to rename another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/collections").send({ name: "Weeknight dinners" });

    const res = await bob.put(`/collections/${createRes.body.id}`).send({ name: "Hijacked" });
    expect(res.status).toBe(404);
  });

  it("deletes a collection without touching its recipes", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const collectionRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    const recipeRes = await agent.post("/recipes").send(samplePayload);
    await agent.post(`/collections/${collectionRes.body.id}/recipes/${recipeRes.body.id}`);

    const deleteRes = await agent.delete(`/collections/${collectionRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const getRecipeRes = await agent.get(`/recipes/${recipeRes.body.id}`);
    expect(getRecipeRes.status).toBe(200);
  });

  it("refuses to delete another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/collections").send({ name: "Weeknight dinners" });

    const res = await bob.delete(`/collections/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it("adds and removes a recipe from a collection", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const collectionRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    const recipeRes = await agent.post("/recipes").send(samplePayload);

    const addRes = await agent.post(
      `/collections/${collectionRes.body.id}/recipes/${recipeRes.body.id}`,
    );
    expect(addRes.status).toBe(201);

    const withRecipe = await agent.get(`/collections/${collectionRes.body.id}/recipes`);
    expect(withRecipe.body.collection).toMatchObject({ name: "Weeknight dinners", recipeCount: 1 });
    expect(withRecipe.body.recipes).toHaveLength(1);
    expect(withRecipe.body.recipes[0].title).toBe("Tomato Soup");

    const removeRes = await agent.delete(
      `/collections/${collectionRes.body.id}/recipes/${recipeRes.body.id}`,
    );
    expect(removeRes.status).toBe(204);

    const withoutRecipe = await agent.get(`/collections/${collectionRes.body.id}/recipes`);
    expect(withoutRecipe.body.recipes).toHaveLength(0);
  });

  it("refuses to add another user's recipe into your own collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const collectionRes = await alice.post("/collections").send({ name: "Weeknight dinners" });
    const bobsRecipeRes = await bob.post("/recipes").send(samplePayload);

    const res = await alice.post(
      `/collections/${collectionRes.body.id}/recipes/${bobsRecipeRes.body.id}`,
    );
    expect(res.status).toBe(404);
  });

  it("refuses to add your own recipe into another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const bobsCollectionRes = await bob.post("/collections").send({ name: "Bob's list" });
    const alicesRecipeRes = await alice.post("/recipes").send(samplePayload);

    const res = await alice.post(
      `/collections/${bobsCollectionRes.body.id}/recipes/${alicesRecipeRes.body.id}`,
    );
    expect(res.status).toBe(404);
  });

  it("404s when fetching another user's collection recipes", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/collections").send({ name: "Weeknight dinners" });

    const res = await bob.get(`/collections/${createRes.body.id}/recipes`);
    expect(res.status).toBe(404);
  });
});

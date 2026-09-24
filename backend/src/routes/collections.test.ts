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

  it("creates and lists a root-level collection with a recipe count", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const createRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      name: "Weeknight dinners",
      parentId: null,
      recipeCount: 0,
    });

    const listRes = await agent.get("/collections");
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body).toContainEqual(
      expect.objectContaining({ name: "Weeknight dinners", parentId: null, recipeCount: 0 }),
    );
  });

  it("creates a nested collection under a parent", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const parentRes = await agent.post("/collections").send({ name: "Baking" });

    const childRes = await agent
      .post("/collections")
      .send({ name: "Cookies", parentId: parentRes.body.id });

    expect(childRes.status).toBe(201);
    expect(childRes.body).toMatchObject({ name: "Cookies", parentId: parentRes.body.id });
  });

  it("refuses to create a collection under another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const bobsCollection = await bob.post("/collections").send({ name: "Bob's list" });

    const res = await alice
      .post("/collections")
      .send({ name: "Hijacked", parentId: bobsCollection.body.id });
    expect(res.status).toBe(404);
  });

  it("allows the same name for collections that are not siblings", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const parentA = await agent.post("/collections").send({ name: "Baking" });
    const parentB = await agent.post("/collections").send({ name: "Dinners" });

    const childA = await agent
      .post("/collections")
      .send({ name: "Desserts", parentId: parentA.body.id });
    const childB = await agent
      .post("/collections")
      .send({ name: "Desserts", parentId: parentB.body.id });

    expect(childA.status).toBe(201);
    expect(childB.status).toBe(201);
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
      .send({ name: "Quick dinners", parentId: null });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe("Quick dinners");
  });

  it("reparents a collection to a different collection", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const oldParent = await agent.post("/collections").send({ name: "Baking" });
    const newParent = await agent.post("/collections").send({ name: "Dinners" });
    const childRes = await agent
      .post("/collections")
      .send({ name: "Cookies", parentId: oldParent.body.id });

    const moveRes = await agent
      .put(`/collections/${childRes.body.id}`)
      .send({ name: "Cookies", parentId: newParent.body.id });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.parentId).toBe(newParent.body.id);
  });

  it("refuses to reparent a collection into its own descendant", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const parentRes = await agent.post("/collections").send({ name: "Baking" });
    const childRes = await agent
      .post("/collections")
      .send({ name: "Cookies", parentId: parentRes.body.id });

    const res = await agent
      .put(`/collections/${parentRes.body.id}`)
      .send({ name: "Baking", parentId: childRes.body.id });

    expect(res.status).toBe(400);
  });

  it("refuses to reparent a collection under itself", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/collections").send({ name: "Baking" });

    const res = await agent
      .put(`/collections/${createRes.body.id}`)
      .send({ name: "Baking", parentId: createRes.body.id });

    expect(res.status).toBe(400);
  });

  it("refuses to rename another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/collections").send({ name: "Weeknight dinners" });

    const res = await bob
      .put(`/collections/${createRes.body.id}`)
      .send({ name: "Hijacked", parentId: null });
    expect(res.status).toBe(404);
  });

  it("deletes a collection, cascading to its sub-collections and recipes", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const parentRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    const childRes = await agent
      .post("/collections")
      .send({ name: "Soups", parentId: parentRes.body.id });
    const recipeRes = await agent
      .post("/recipes")
      .send({ ...samplePayload, collectionId: childRes.body.id });

    const deleteRes = await agent.delete(`/collections/${parentRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await agent.get("/collections");
    expect(listRes.body).toEqual([]);
    const getRecipeRes = await agent.get(`/recipes/${recipeRes.body.id}`);
    expect(getRecipeRes.status).toBe(404);
  });

  it("refuses to delete another user's collection", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/collections").send({ name: "Weeknight dinners" });

    const res = await bob.delete(`/collections/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it("never touches recipes at Home when deleting a collection", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const collectionRes = await agent.post("/collections").send({ name: "Weeknight dinners" });
    const homeRecipe = await agent.post("/recipes").send(samplePayload);

    await agent.delete(`/collections/${collectionRes.body.id}`);

    const getRes = await agent.get(`/recipes/${homeRecipe.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.collectionId).toBeNull();
  });
});

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

async function createRecipe(agent: ReturnType<typeof request.agent>, title = "Tomato Soup") {
  const res = await agent.post("/recipes").send({ ...samplePayload, title });
  return res.body.id as number;
}

describe("meal plan routes", () => {
  it("rejects requests with no session", async () => {
    const res = await request(createTestApp()).get("/meal-plan?start=2026-08-24&end=2026-08-30");
    expect(res.status).toBe(401);
  });

  it("assigns a recipe to a date and returns it in a range query", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const recipeId = await createRecipe(agent);

    const putRes = await agent.put("/meal-plan/2026-08-24").send({ recipeId });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toMatchObject({ date: "2026-08-24", recipe: { id: recipeId } });

    const listRes = await agent.get("/meal-plan?start=2026-08-24&end=2026-08-30");
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({ date: "2026-08-24", recipe: { id: recipeId } });
  });

  it("replaces the recipe on a second PUT for the same date instead of creating a second entry", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const firstRecipeId = await createRecipe(agent, "Tomato Soup");
    const secondRecipeId = await createRecipe(agent, "Belgian Waffles");

    await agent.put("/meal-plan/2026-08-24").send({ recipeId: firstRecipeId });
    const secondPut = await agent.put("/meal-plan/2026-08-24").send({ recipeId: secondRecipeId });
    expect(secondPut.status).toBe(200);
    expect(secondPut.body.recipe.id).toBe(secondRecipeId);

    const listRes = await agent.get("/meal-plan?start=2026-08-24&end=2026-08-24");
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].recipe.id).toBe(secondRecipeId);
  });

  it("refuses to assign another user's recipe", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const bobsRecipeId = await createRecipe(bob);

    const res = await alice.put("/meal-plan/2026-08-24").send({ recipeId: bobsRecipeId });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid date", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const recipeId = await createRecipe(agent);

    const res = await agent.put("/meal-plan/not-a-date").send({ recipeId });
    expect(res.status).toBe(400);
  });

  it("scopes range queries to the caller and excludes entries outside the range", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const aliceRecipeId = await createRecipe(alice);
    const bobRecipeId = await createRecipe(bob);

    await alice.put("/meal-plan/2026-08-24").send({ recipeId: aliceRecipeId });
    await alice.put("/meal-plan/2026-09-15").send({ recipeId: aliceRecipeId });
    await bob.put("/meal-plan/2026-08-24").send({ recipeId: bobRecipeId });

    const res = await alice.get("/meal-plan?start=2026-08-24&end=2026-08-30");
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ date: "2026-08-24", recipe: { id: aliceRecipeId } });
  });

  it("rejects a range with end before start, and an excessively large range", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const backwards = await agent.get("/meal-plan?start=2026-08-30&end=2026-08-24");
    expect(backwards.status).toBe(400);

    const tooWide = await agent.get("/meal-plan?start=2020-01-01&end=2026-01-01");
    expect(tooWide.status).toBe(400);
  });

  it("clears an assigned date, and 404s clearing a date with no entry", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const recipeId = await createRecipe(agent);
    await agent.put("/meal-plan/2026-08-24").send({ recipeId });

    const deleteRes = await agent.delete("/meal-plan/2026-08-24");
    expect(deleteRes.status).toBe(204);

    const listRes = await agent.get("/meal-plan?start=2026-08-24&end=2026-08-24");
    expect(listRes.body).toHaveLength(0);

    const notFoundRes = await agent.delete("/meal-plan/2026-08-24");
    expect(notFoundRes.status).toBe(404);
  });

  it("removes a meal plan entry when its recipe is deleted", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const recipeId = await createRecipe(agent);
    await agent.put("/meal-plan/2026-08-24").send({ recipeId });

    const deleteRecipeRes = await agent.delete(`/recipes/${recipeId}`);
    expect(deleteRecipeRes.status).toBe(204);

    const listRes = await agent.get("/meal-plan?start=2026-08-24&end=2026-08-24");
    expect(listRes.body).toHaveLength(0);
  });
});

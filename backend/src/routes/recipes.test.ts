import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
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
  description: "A warm classic",
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  ingredients: [
    { quantity: "1", unit: "kg", name: "tomatoes" },
    { quantity: "1", unit: "clove", name: "garlic" },
  ],
  steps: [{ instruction: "Simmer the tomatoes" }, { instruction: "Blend until smooth" }],
  tags: ["soup", "vegetarian"],
};

describe("recipe routes", () => {
  it("rejects requests with no session", async () => {
    const res = await request(createTestApp()).get("/recipes");
    expect(res.status).toBe(401);
  });

  it("creates a recipe with nested ingredients, steps, and tags", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const res = await agent.post("/recipes").send(samplePayload);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Tomato Soup");
    expect(res.body.ingredients).toHaveLength(2);
    expect(res.body.ingredients[0]).toMatchObject({ position: 0, name: "tomatoes" });
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.tags).toEqual(["soup", "vegetarian"]);
  });

  it("defaults sourceUrl to null and round-trips it when provided", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const manual = await agent.post("/recipes").send(samplePayload);
    expect(manual.body.sourceUrl).toBeNull();

    const imported = await agent
      .post("/recipes")
      .send({ ...samplePayload, sourceUrl: "https://example.com/recipe" });
    expect(imported.body.sourceUrl).toBe("https://example.com/recipe");

    const fetched = await agent.get(`/recipes/${imported.body.id}`);
    expect(fetched.body.sourceUrl).toBe("https://example.com/recipe");

    const updated = await agent
      .put(`/recipes/${imported.body.id}`)
      .send({ ...samplePayload, sourceUrl: null });
    expect(updated.body.sourceUrl).toBeNull();
  });

  it("rejects a recipe with no title", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const res = await agent.post("/recipes").send({ ...samplePayload, title: "" });
    expect(res.status).toBe(400);
  });

  it("fetches a recipe by id", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe("Tomato Soup");
  });

  it("lists only the current user's recipes", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");

    await alice.post("/recipes").send(samplePayload);
    await bob.post("/recipes").send({ ...samplePayload, title: "Bob's Chili" });

    const aliceList = await alice.get("/recipes");
    expect(aliceList.body).toHaveLength(1);
    expect(aliceList.body[0].title).toBe("Tomato Soup");
  });

  it("hides another user's recipe behind a 404", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");

    const createRes = await alice.post("/recipes").send(samplePayload);

    const res = await bob.get(`/recipes/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it("rejects a non-numeric recipe id", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const res = await agent.get("/recipes/not-a-number");
    expect(res.status).toBe(400);
  });

  it("updates a recipe, replacing its ingredients and steps", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const updateRes = await agent.put(`/recipes/${createRes.body.id}`).send({
      ...samplePayload,
      title: "Creamy Tomato Soup",
      ingredients: [{ quantity: "2", unit: "kg", name: "ripe tomatoes" }],
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe("Creamy Tomato Soup");
    expect(updateRes.body.ingredients).toHaveLength(1);
    expect(updateRes.body.ingredients[0]).toMatchObject({ name: "ripe tomatoes" });
  });

  it("refuses to update another user's recipe", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/recipes").send(samplePayload);

    const res = await bob.put(`/recipes/${createRes.body.id}`).send(samplePayload);
    expect(res.status).toBe(404);
  });

  it("deletes a recipe", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const deleteRes = await agent.delete(`/recipes/${createRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.status).toBe(404);
  });

  it("refuses to delete another user's recipe", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/recipes").send(samplePayload);

    const res = await bob.delete(`/recipes/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it("finds a recipe via full-text search on an ingredient name", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    await agent.post("/recipes").send(samplePayload);
    await agent.post("/recipes").send({
      title: "Chocolate Cake",
      description: "A rich dessert",
      ingredients: [{ quantity: "200", unit: "g", name: "chocolate" }],
      steps: [{ instruction: "Melt the chocolate" }],
      tags: ["dessert"],
    });

    const res = await agent.get("/recipes/search").query({ q: "tomatoes" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Tomato Soup");
  });

  it("requires a query parameter for search", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");

    const res = await agent.get("/recipes/search");
    expect(res.status).toBe(400);
  });

  it("uploads an image to a recipe", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const uploadRes = await agent
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("fake-image-bytes"), {
        filename: "soup.jpg",
        contentType: "image/jpeg",
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.position).toBe(0);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.body.images).toHaveLength(1);
  });

  it("serves an uploaded image back to its owner", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);
    const uploadRes = await agent
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("fake-image-bytes"), {
        filename: "soup.jpg",
        contentType: "image/jpeg",
      });

    const fileRes = await agent.get(
      `/recipes/${createRes.body.id}/images/${uploadRes.body.id}`,
    );

    expect(fileRes.status).toBe(200);
    expect(fileRes.body).toEqual(Buffer.from("fake-image-bytes"));
  });

  it("refuses to serve an image without a session", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);
    const uploadRes = await agent
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("fake-image-bytes"), {
        filename: "soup.jpg",
        contentType: "image/jpeg",
      });

    const res = await request(app).get(
      `/recipes/${createRes.body.id}/images/${uploadRes.body.id}`,
    );

    expect(res.status).toBe(401);
  });

  it("refuses to serve another user's image", async () => {
    const app = createTestApp();
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/recipes").send(samplePayload);
    const uploadRes = await alice
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("fake-image-bytes"), {
        filename: "soup.jpg",
        contentType: "image/jpeg",
      });

    const res = await bob.get(`/recipes/${createRes.body.id}/images/${uploadRes.body.id}`);

    expect(res.status).toBe(404);
  });

  it("rejects an unsupported image type", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const uploadRes = await agent
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(uploadRes.status).toBe(400);
  });

  it("deletes an image from a recipe", async () => {
    const app = createTestApp();
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);
    const uploadRes = await agent
      .post(`/recipes/${createRes.body.id}/images`)
      .attach("image", Buffer.from("fake-image-bytes"), {
        filename: "soup.jpg",
        contentType: "image/jpeg",
      });

    const deleteRes = await agent.delete(
      `/recipes/${createRes.body.id}/images/${uploadRes.body.id}`,
    );
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.body.images).toHaveLength(0);
  });

  it("attaches an image fetched from a URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(Buffer.from("fake-image-bytes"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const app = createTestApp({ fetchImpl });
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const res = await agent
      .post(`/recipes/${createRes.body.id}/images/from-url`)
      .send({ url: "https://example.com/soup.jpg" });

    expect(res.status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.body.images).toHaveLength(1);
  });

  it("requires ownership to attach an image from a URL", async () => {
    const fetchImpl = vi.fn();
    const app = createTestApp({ fetchImpl });
    const alice = await signedInAgent(app, "alice@example.com");
    const bob = await signedInAgent(app, "bob@example.com");
    const createRes = await alice.post("/recipes").send(samplePayload);

    const res = await bob
      .post(`/recipes/${createRes.body.id}/images/from-url`)
      .send({ url: "https://example.com/soup.jpg" });

    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a from-url attach pointed at a blocked host", async () => {
    const fetchImpl = vi.fn();
    const app = createTestApp({ fetchImpl });
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const res = await agent
      .post(`/recipes/${createRes.body.id}/images/from-url`)
      .send({ url: "http://169.254.169.254/latest/meta-data" });

    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces a from-url fetch failure as a real status, not a 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const app = createTestApp({ fetchImpl });
    const agent = await signedInAgent(app, "alice@example.com");
    const createRes = await agent.post("/recipes").send(samplePayload);

    const res = await agent
      .post(`/recipes/${createRes.body.id}/images/from-url`)
      .send({ url: "https://example.com/missing.jpg" });

    expect(res.status).toBe(502);

    const getRes = await agent.get(`/recipes/${createRes.body.id}`);
    expect(getRes.body.images).toHaveLength(0);
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/app";

describe("auth routes", () => {
  it("signs a new user up and starts a session", async () => {
    const agent = request.agent(createTestApp());

    const signupRes = await agent
      .post("/auth/signup")
      .send({ email: "alice@example.com", password: "correct-horse" });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body).toEqual({ id: expect.any(Number), email: "alice@example.com" });

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe("alice@example.com");
  });

  it("rejects signup with a duplicate email", async () => {
    const app = createTestApp();
    await request(app)
      .post("/auth/signup")
      .send({ email: "bob@example.com", password: "correct-horse" });

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "bob@example.com", password: "another-password" });

    expect(res.status).toBe(409);
  });

  it("rejects signup with too short a password", async () => {
    const res = await request(createTestApp())
      .post("/auth/signup")
      .send({ email: "carol@example.com", password: "short" });

    expect(res.status).toBe(400);
  });

  it("logs an existing user in", async () => {
    const app = createTestApp();
    await request(app)
      .post("/auth/signup")
      .send({ email: "dave@example.com", password: "correct-horse" });

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/auth/login")
      .send({ email: "dave@example.com", password: "correct-horse" });

    expect(loginRes.status).toBe(200);

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
  });

  it("rejects login with the wrong password", async () => {
    const app = createTestApp();
    await request(app)
      .post("/auth/signup")
      .send({ email: "erin@example.com", password: "correct-horse" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "erin@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("rejects login for an unknown email", async () => {
    const res = await request(createTestApp())
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
  });

  it("rejects /auth/me without a session", async () => {
    const res = await request(createTestApp()).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("logs a user out and ends their session", async () => {
    const app = createTestApp();
    const agent = request.agent(app);
    await agent
      .post("/auth/signup")
      .send({ email: "frank@example.com", password: "correct-horse" });

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(401);
  });
});

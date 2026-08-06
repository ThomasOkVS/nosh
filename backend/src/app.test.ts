import { describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp } from "./test/app";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(createTestApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

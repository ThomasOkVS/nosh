import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";

function mockFetchResponse(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    }),
  );
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    mockFetchResponse(200, { id: 1, email: "a@b.com" });

    const result = await apiFetch<{ id: number }>("/auth/me");

    expect(result).toEqual({ id: 1, email: "a@b.com" });
  });

  it("sends credentials and a JSON body for object payloads", async () => {
    mockFetchResponse(200, { ok: true });

    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.com", password: "secret123" } });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.com", password: "secret123" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for a 204 No Content response", async () => {
    mockFetchResponse(204, null);

    const result = await apiFetch<void>("/auth/logout", { method: "POST" });

    expect(result).toBeUndefined();
  });

  it("throws an ApiError with the server's message on failure", async () => {
    mockFetchResponse(401, { error: "Invalid email or password" });

    await expect(apiFetch("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject(
      new ApiError(401, "Invalid email or password"),
    );
  });
});

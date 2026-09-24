import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { cancelImport, getImport, listPendingImports, markImportReviewed, startImport } from "./import";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("import api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts an import by POSTing the url and returns the created job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 3, status: "running" }, 202));
    vi.stubGlobal("fetch", fetchMock);

    const job = await startImport("https://example.com/recipe");

    expect(job).toMatchObject({ id: 3, status: "running" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/import$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com/recipe" });
  });

  it("surfaces a rejected start as an ApiError with the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid URL" }, 400)));

    await expect(startImport("nope")).rejects.toEqual(new ApiError(400, "Invalid URL"));
  });

  it("hits the per-job endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 3 }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await getImport(3);
    await listPendingImports();
    await cancelImport(3);
    await markImportReviewed(3);

    const calls = (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => [
      init.method,
      url.replace(/^.*\/import/, "/import"),
    ]);
    expect(calls).toEqual([
      ["GET", "/import/3"],
      ["GET", "/import"],
      ["POST", "/import/3/cancel"],
      ["POST", "/import/3/reviewed"],
    ]);
  });
});

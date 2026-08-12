import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { importRecipeFromUrl, type ImportStage } from "./import";

/** Builds a streaming Response whose body yields the given chunks in order,
 * mimicking the backend's newline-delimited JSON. */
function ndjsonResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function line(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

describe("importRecipeFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the url and returns the recipe from the result message", async () => {
    const recipe = { title: "Tomato Soup", sourceUrl: "https://example.com/recipe" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(ndjsonResponse([line({ type: "result", recipe })]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRecipeFromUrl("https://example.com/recipe")).resolves.toEqual(recipe);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/import");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(JSON.stringify({ url: "https://example.com/recipe" }));
  });

  it("reports each progress stage in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          line({ type: "progress", stage: "fetching" }),
          line({ type: "progress", stage: "structured-data" }),
          line({ type: "progress", stage: "ai" }),
          line({ type: "result", recipe: { title: "Soup" } }),
        ]),
      ),
    );

    const stages: ImportStage[] = [];
    await importRecipeFromUrl("https://example.com/recipe", (stage) => stages.push(stage));

    expect(stages).toEqual(["fetching", "structured-data", "ai"]);
  });

  it("reassembles messages split across chunk boundaries", async () => {
    const recipe = { title: "Tomato Soup" };
    const full = line({ type: "progress", stage: "fetching" }) + line({ type: "result", recipe });
    // Split mid-way through the first JSON object.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([full.slice(0, 15), full.slice(15)])),
    );

    const stages: ImportStage[] = [];
    await expect(
      importRecipeFromUrl("https://example.com/recipe", (stage) => stages.push(stage)),
    ).resolves.toEqual(recipe);
    expect(stages).toEqual(["fetching"]);
  });

  it("throws an ApiError carrying the in-band error status and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          line({ type: "progress", stage: "fetching" }),
          line({ type: "error", status: 422, error: "No recipe could be found on that page" }),
        ]),
      ),
    );

    await expect(importRecipeFromUrl("https://example.com/x")).rejects.toMatchObject(
      new ApiError(422, "No recipe could be found on that page"),
    );
  });

  it("throws an ApiError for a pre-stream failure such as a 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid input" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(importRecipeFromUrl("nope")).rejects.toMatchObject(
      new ApiError(400, "Invalid input"),
    );
  });

  it("throws when the stream ends without a result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ndjsonResponse([line({ type: "progress", stage: "fetching" })])),
    );

    await expect(importRecipeFromUrl("https://example.com/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("ignores an unrecognized message type instead of failing silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          line({ type: "heartbeat" }),
          line({ type: "result", recipe: { title: "Soup" } }),
        ]),
      ),
    );

    await expect(importRecipeFromUrl("https://example.com/x")).resolves.toEqual({ title: "Soup" });
  });

  it("gives a distinct message for an ok response with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    await expect(importRecipeFromUrl("https://example.com/x")).rejects.toMatchObject(
      new ApiError(200, "The server returned an empty response"),
    );
  });

  it("releases the stream reader after an in-band error", async () => {
    const response = ndjsonResponse([line({ type: "error", status: 422, error: "No recipe" })]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(importRecipeFromUrl("https://example.com/x")).rejects.toBeInstanceOf(ApiError);
    expect(response.body?.locked).toBe(false);
  });
});

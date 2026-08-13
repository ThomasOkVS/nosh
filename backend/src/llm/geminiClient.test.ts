import { describe, expect, it, vi } from "vitest";
import {
  createGeminiExtractor,
  createGeminiVideoExtractor,
  GeminiExtractionError,
  GeminiUnavailableError,
} from "./geminiClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiPayload(recipeJson: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(recipeJson) }] } }] };
}

describe("createGeminiExtractor", () => {
  it("sends the model, API key, and a JSON responseSchema", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "Soup" })));
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await extract("page text", "https://example.com/recipe");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com");
    // The model is overridable via env, not hardcoded, so it must actually
    // flow into the endpoint URL rather than being ignored.
    expect(url).toContain("test-model");
    // The key belongs in a header, not the query string, where it would end
    // up in proxy and error logs.
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(body.contents[0].parts[0].text).toContain("page text");
    expect(body.contents[0].parts[0].text).toContain("https://example.com/recipe");
  });

  it("maps quota and outage responses to a retryable error", async () => {
    for (const status of [429, 503]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "busy" }, status));
      const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);
      await expect(extract("page text", "https://example.com")).rejects.toBeInstanceOf(
        GeminiUnavailableError,
      );
    }
  });

  it("returns the parsed recipe JSON from the response", async () => {
    const recipe = { title: "Soup", ingredients: [], steps: [] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload(recipe)));
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).resolves.toEqual(recipe);
  });

  it("throws GeminiExtractionError on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 429));
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).rejects.toThrow(GeminiExtractionError);
  });

  it("ignores reasoning-model thought parts and uses the answer text", async () => {
    const recipe = { title: "Soup", ingredients: [], steps: [] };
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: "Let me think about this page...", thought: true },
                { text: JSON.stringify(recipe) },
              ],
            },
          },
        ],
      }),
    );
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).resolves.toEqual(recipe);
  });

  it("throws GeminiExtractionError when the response has no candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ candidates: [] }));
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).rejects.toThrow(GeminiExtractionError);
  });

  it("throws GeminiExtractionError when the model text isn't valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }),
    );
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).rejects.toThrow(GeminiExtractionError);
  });

  it("throws GeminiExtractionError when the request itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const extract = createGeminiExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);

    await expect(extract("page text", "https://example.com")).rejects.toThrow(GeminiExtractionError);
  });
});

describe("createGeminiVideoExtractor", () => {
  it("sends the video as inline base64 alongside the caption", async () => {
    const recipe = { title: "Fajitas", ingredients: [], steps: [] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload(recipe)));
    const extract = createGeminiVideoExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);
    const video = { buffer: Buffer.from("fake video bytes"), mimeType: "video/mp4" };

    const result = await extract(video, "200g chicken thigh", "https://www.instagram.com/p/abc/");

    expect(result).toEqual(recipe);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("test-model");
    const body = JSON.parse(init.body as string);
    const parts = body.contents[0].parts;
    expect(parts[0].text).toContain("200g chicken thigh");
    expect(parts[0].text).toContain("https://www.instagram.com/p/abc/");
    expect(parts[1].inlineData.mimeType).toBe("video/mp4");
    expect(parts[1].inlineData.data).toBe(video.buffer.toString("base64"));
  });

  it("labels a missing caption rather than sending an empty string", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "x" })));
    const extract = createGeminiVideoExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);
    const video = { buffer: Buffer.from("x"), mimeType: "video/mp4" };

    await extract(video, null, "https://www.tiktok.com/@x/video/1");

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("(no caption)");
  });

  it("maps quota and outage responses to a retryable error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "busy" }, 503));
    const extract = createGeminiVideoExtractor("test-key", "test-model", fetchImpl as unknown as typeof fetch);
    const video = { buffer: Buffer.from("x"), mimeType: "video/mp4" };

    await expect(extract(video, null, "https://www.tiktok.com/@x/video/1")).rejects.toBeInstanceOf(
      GeminiUnavailableError,
    );
  });
});

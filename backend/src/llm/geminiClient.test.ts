import { describe, expect, it, vi } from "vitest";
import {
  createGeminiExtractor,
  createGeminiTranslator,
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

  it("uses a per-call model override instead of the default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "Soup" })));
    const extract = createGeminiExtractor("test-key", "default-model", fetchImpl as unknown as typeof fetch);

    await extract("page text", "https://example.com", { model: "picked-model" });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("/picked-model:generateContent");
    expect(url).not.toContain("default-model");
  });

  it("reports token usage, counting thinking tokens as output", async () => {
    const onUsage = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        ...geminiPayload({ title: "Soup" }),
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 },
      }),
    );
    const extract = createGeminiExtractor(
      "test-key",
      "test-model",
      fetchImpl as unknown as typeof fetch,
      onUsage,
    );

    await extract("page text", "https://example.com");

    expect(onUsage).toHaveBeenCalledWith("test-model", { promptTokens: 1200, outputTokens: 350 });
  });

  it("counts a rejected request with zero tokens", async () => {
    const onUsage = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "quota" }, 429));
    const extract = createGeminiExtractor(
      "test-key",
      "test-model",
      fetchImpl as unknown as typeof fetch,
      onUsage,
    );

    await expect(extract("page text", "https://example.com")).rejects.toBeInstanceOf(GeminiUnavailableError);
    expect(onUsage).toHaveBeenCalledWith("test-model", { promptTokens: 0, outputTokens: 0 });
  });

  it("doesn't count a request that never reached Google", async () => {
    const onUsage = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const extract = createGeminiExtractor(
      "test-key",
      "test-model",
      fetchImpl as unknown as typeof fetch,
      onUsage,
    );

    await expect(extract("page text", "https://example.com")).rejects.toThrow(GeminiExtractionError);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("still returns the recipe when recording usage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recipe = { title: "Soup", ingredients: [], steps: [] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload(recipe)));
    const extract = createGeminiExtractor(
      "test-key",
      "test-model",
      fetchImpl as unknown as typeof fetch,
      vi.fn().mockRejectedValue(new Error("db down")),
    );

    await expect(extract("page text", "https://example.com")).resolves.toEqual(recipe);
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

function promptOf(fetchImpl: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string).contents[0].parts[0].text as string;
}

describe("recipe language instruction", () => {
  it("asks for the target language only when one is set", async () => {
    const plain = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "Soup" })));
    await createGeminiExtractor("k", "m", plain as unknown as typeof fetch)("text", "https://e.com");
    expect(promptOf(plain)).not.toContain("Dutch");

    const dutch = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "Soep" })));
    await createGeminiExtractor("k", "m", dutch as unknown as typeof fetch)("text", "https://e.com", {
      language: "nl",
    });
    expect(promptOf(dutch)).toContain("Dutch");
    expect(promptOf(dutch)).toMatch(/never convert/i);
    // Only spoons may be translated: kopje/ons/pond are different measures.
    expect(promptOf(dutch)).toMatch(/ONLY ones you may translate are the spoons/);
    expect(promptOf(dutch)).toContain('"kopje", "ons" and "pond" are different quantities');
  });

  it("applies to the video prompt too", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload({ title: "Soup" })));
    const extract = createGeminiVideoExtractor("k", "m", fetchImpl as unknown as typeof fetch);

    await extract({ buffer: Buffer.from("v"), mimeType: "video/mp4" }, null, "https://e.com", {
      language: "en",
    });

    expect(promptOf(fetchImpl)).toContain("in English");
  });
});

describe("createGeminiTranslator", () => {
  it("sends the recipe as fenced JSON with the response schema", async () => {
    const translated = { title: "Tomatensoep", ingredients: [], steps: [] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(geminiPayload(translated)));
    const translate = createGeminiTranslator("k", "text-model", fetchImpl as unknown as typeof fetch);

    const result = await translate(
      {
        title: "Tomato soup",
        description: null,
        servings: 4,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        sourceUrl: "https://e.com",
        collectionId: null,
        ingredients: [{ quantity: "1", unit: "kg", name: "tomatoes" }],
        steps: [{ instruction: "Simmer" }],
        tags: [],
      },
      "nl",
      { model: "chosen-model" },
    );

    expect(result).toEqual(translated);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("chosen-model");
    const prompt = promptOf(fetchImpl);
    expect(prompt).toContain("<recipe-json>");
    expect(prompt).toContain('"name":"tomatoes"');
    expect(prompt).toContain("Dutch");
    // The source URL is ours, not something to hand the model.
    expect(prompt).not.toContain("https://e.com");
    expect(JSON.parse(init.body as string).generationConfig.responseSchema.type).toBe("OBJECT");
  });
});

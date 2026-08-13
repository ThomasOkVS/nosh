import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "../llm/geminiClient";
import { VideoTooLargeError, VideoUnavailableError, type SocialVideoDownloadFn } from "../services/socialVideo";
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

function fakeGemini(recipe: unknown): GeminiExtractFn {
  return vi.fn().mockResolvedValue(recipe);
}

function fakeGeminiVideo(recipe: unknown): GeminiVideoExtractFn {
  return vi.fn().mockResolvedValue(recipe);
}

function fakeVideoDownload(
  result: { videoBuffer: Buffer; mimeType: string; caption: string | null } | Error,
): SocialVideoDownloadFn {
  return result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result);
}

const FAKE_VIDEO = { videoBuffer: Buffer.from("fake"), mimeType: "video/mp4", caption: "caption text" };

/** The route always fetches via the global `fetch` (no per-request injection
 * point, unlike `recipeExtraction`'s own unit tests) — stub it globally here
 * so these route tests never hit the network. */
function stubFetchWithHtml(html: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(html, { headers: { "content-type": "text/html" } })),
  );
}

interface ImportMessage {
  type: "progress" | "result" | "error";
  stage?: string;
  recipe?: Record<string, unknown>;
  status?: number;
  error?: string;
}

/** The endpoint streams newline-delimited JSON, so responses are a list of
 * messages rather than one object. */
function parseNdjson(text: string): ImportMessage[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ImportMessage);
}

const RECIPE_JSON_LD_PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeIngredient: ["1 kg tomatoes"],
  recipeInstructions: ["Simmer the tomatoes"],
})}</script></head><body></body></html>`;

describe("import routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests with no session", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const res = await request(createTestApp({ geminiExtract: fakeGemini({}) }))
      .post("/import")
      .send({ url: "https://example.com" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body before streaming starts, with a real 400", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({}) });
    const agent = await signedInAgent(app, "importinvalid@example.com");

    const res = await agent.post("/import").send({ url: "not a url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("streams progress stages and then the extracted recipe", async () => {
    stubFetchWithHtml("<html><body>No recipe markup here</body></html>");
    const app = createTestApp({
      geminiExtract: fakeGemini({
        title: "Tomato Soup",
        ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
        steps: [{ instruction: "Simmer" }],
      }),
    });
    const agent = await signedInAgent(app, "importsuccess@example.com");

    const res = await agent.post("/import").send({ url: "https://example.com/recipe" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/x-ndjson");

    const messages = parseNdjson(res.text);
    expect(messages.filter((m) => m.type === "progress").map((m) => m.stage)).toEqual([
      "fetching",
      "structured-data",
      "ai",
    ]);

    const result = messages.at(-1)!;
    expect(result.type).toBe("result");
    expect(result.recipe!.title).toBe("Tomato Soup");
    expect(result.recipe!.sourceUrl).toBe("https://example.com/recipe");
  });

  it("stops at the structured-data stage when the page has JSON-LD", async () => {
    stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
    const geminiExtract = fakeGemini({});
    const app = createTestApp({ geminiExtract });
    const agent = await signedInAgent(app, "importjsonld@example.com");

    const res = await agent.post("/import").send({ url: "https://example.com/recipe" });
    const messages = parseNdjson(res.text);

    expect(messages.filter((m) => m.type === "progress").map((m) => m.stage)).toEqual([
      "fetching",
      "structured-data",
    ]);
    expect(messages.at(-1)!.recipe!.title).toBe("Tomato Soup");
    expect(geminiExtract).not.toHaveBeenCalled();
  });

  it("imports a JSON-LD page with no Gemini configured at all", async () => {
    stubFetchWithHtml(RECIPE_JSON_LD_PAGE);
    const app = createTestApp();
    const agent = await signedInAgent(app, "importnokey@example.com");

    const res = await agent.post("/import").send({ url: "https://example.com/recipe" });
    expect(parseNdjson(res.text).at(-1)!.recipe!.title).toBe("Tomato Soup");
  });

  it("reports a 503 in-band when the fallback is needed but unconfigured", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp();
    const agent = await signedInAgent(app, "importunconfigured@example.com");

    const res = await agent.post("/import").send({ url: "https://example.com/recipe" });
    expect(res.status).toBe(200);
    expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 503 });
  });

  it("reports a 422 in-band when no recipe can be extracted", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({ title: "" }) });
    const agent = await signedInAgent(app, "import422@example.com");

    const res = await agent.post("/import").send({ url: "https://example.com/recipe" });
    expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 422 });
  });

  it("reports a 400 in-band for a rejected URL, without fetching it", async () => {
    stubFetchWithHtml("<html><body>No recipe</body></html>");
    const app = createTestApp({ geminiExtract: fakeGemini({}) });
    const agent = await signedInAgent(app, "importbadurl@example.com");

    const res = await agent.post("/import").send({ url: "http://localhost/recipe" });
    expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("social video import (Instagram/TikTok)", () => {
    it("downloads the video and streams downloading-video/ai progress before the result", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const geminiVideoExtract = fakeGeminiVideo({
        title: "Fajitas",
        ingredients: [{ quantity: "200", unit: "g", name: "chicken thigh" }],
        steps: [{ instruction: "Bake at 200C for 20 minutes" }],
      });
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract });
      const agent = await signedInAgent(app, "importreel@example.com");

      const res = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });
      expect(res.status).toBe(200);

      const messages = parseNdjson(res.text);
      expect(messages.filter((m) => m.type === "progress").map((m) => m.stage)).toEqual([
        "downloading-video",
        "analyzing-video",
      ]);
      const result = messages.at(-1)!;
      expect(result.type).toBe("result");
      expect(result.recipe!.title).toBe("Fajitas");
      expect(result.recipe!.sourceUrl).toBe("https://www.instagram.com/p/abc123/");
      expect(geminiVideoExtract).toHaveBeenCalledWith(
        { buffer: FAKE_VIDEO.videoBuffer, mimeType: FAKE_VIDEO.mimeType },
        FAKE_VIDEO.caption,
        "https://www.instagram.com/p/abc123/",
        expect.anything(),
      );
    });

    it("works the same for a TikTok URL", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const geminiVideoExtract = fakeGeminiVideo({ title: "Noodles", ingredients: [], steps: [] });
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract });
      const agent = await signedInAgent(app, "importtiktok@example.com");

      const res = await agent.post("/import").send({ url: "https://www.tiktok.com/@chef/video/123" });
      expect(parseNdjson(res.text).at(-1)!.recipe!.title).toBe("Noodles");
    });

    it("reports a 503 in-band when no AI is configured, without downloading anything", async () => {
      const downloadSocialVideo = fakeVideoDownload(FAKE_VIDEO);
      const app = createTestApp({ downloadSocialVideo });
      const agent = await signedInAgent(app, "importreelnokey@example.com");

      const res = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });
      expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 503 });
      expect(downloadSocialVideo).not.toHaveBeenCalled();
    });

    it("reports a 502 in-band when the post can't be fetched (private/deleted/blocked)", async () => {
      const downloadSocialVideo = fakeVideoDownload(new VideoUnavailableError("nope"));
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract: fakeGeminiVideo({}) });
      const agent = await signedInAgent(app, "importreelprivate@example.com");

      const res = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });
      expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 502 });
    });

    it("reports a 422 in-band when the video is too long/large", async () => {
      const downloadSocialVideo = fakeVideoDownload(new VideoTooLargeError("too long"));
      const app = createTestApp({ downloadSocialVideo, geminiVideoExtract: fakeGeminiVideo({}) });
      const agent = await signedInAgent(app, "importreeltoolong@example.com");

      const res = await agent.post("/import").send({ url: "https://www.instagram.com/p/abc123/" });
      expect(parseNdjson(res.text).at(-1)).toMatchObject({ type: "error", status: 422 });
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { GeminiExtractionError, GeminiUnavailableError } from "../llm/geminiClient";
import {
  ExtractionError,
  extractRecipeFromUrl,
  FetchError,
  InvalidUrlError,
  NotConfiguredError,
  VideoTooLargeError,
  VideoUnavailableError,
} from "./recipeExtraction";

const RECIPE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeIngredient: ["1 kg tomatoes"],
  recipeInstructions: ["Simmer the tomatoes"],
};

function htmlResponse(html: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(html, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/html; charset=utf-8" },
  });
}

function pageWithJsonLd(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

describe("extractRecipeFromUrl", () => {
  it("uses the JSON-LD result and never calls Gemini when it's complete", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(RECIPE_JSON_LD)));
    const geminiExtract = vi.fn();

    const result = await extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract });

    expect(result.recipe.title).toBe("Tomato Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/recipe");
    expect(geminiExtract).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when there's no usable JSON-LD", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(htmlResponse("<html><body><h1>Tomato Soup</h1><p>Ingredients: tomatoes</p></body></html>"));
    const geminiExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
    });

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract,
      model: "chosen-model",
    });

    expect(geminiExtract).toHaveBeenCalledTimes(1);
    // The user's Settings-page choice is forwarded to the text path too.
    expect(geminiExtract.mock.calls[0]?.[2]).toMatchObject({ model: "chosen-model" });
    expect(result.recipe.title).toBe("Tomato Soup");
    expect(result.recipe.sourceUrl).toBe("https://example.com/recipe");
  });

  it("extracts JSON-LD with no Gemini configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(RECIPE_JSON_LD)));

    const result = await extractRecipeFromUrl("https://example.com/recipe", { fetchImpl });

    expect(result.recipe.title).toBe("Tomato Soup");
  });

  it("throws NotConfiguredError when the fallback is needed but no Gemini is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>No recipe</body></html>"));

    await expect(extractRecipeFromUrl("https://example.com/recipe", { fetchImpl })).rejects.toThrow(
      NotConfiguredError,
    );
  });

  // These are all near-misses that the extraction sources really do emit:
  // the model returns "" where the schema wants null despite being told the
  // field is nullable, and pages publish "Serves 0". Sanitizing has to happen
  // before validation, or one stray field discards a good recipe.
  it.each([
    ["empty description", { description: "" }],
    ["zero servings", { servings: 0 }],
    ["fractional servings", { servings: 4.5 }],
    ["negative prep time", { prepTimeMinutes: -5 }],
    ["blank ingredient quantity/unit", { ingredients: [{ quantity: "", unit: "", name: "salt" }] }],
    ["an empty step among good ones", { steps: [{ instruction: "" }, { instruction: "Simmer" }] }],
    ["off-vocabulary and empty tags", { tags: ["vegan", "Chef Bob", ""] }],
  ])("still imports a recipe with %s", async (_label, overrides) => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>No markup</body></html>"));
    const geminiExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: "1", unit: "kg", name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
      ...overrides,
    });

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract,
    });
    expect(result.recipe.title).toBe("Tomato Soup");
  });

  it("drops off-vocabulary tags rather than failing the whole import", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>No markup</body></html>"));
    const geminiExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
      tags: ["vegan", "Chef Bob", ""],
    });

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract,
    });
    expect(result.recipe.tags).toEqual(["vegan"]);
  });

  it("rejects a redirect into a blocked host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://192.168.1.1/admin" } }),
    );

    await expect(
      extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract: vi.fn() }),
    ).rejects.toThrow(InvalidUrlError);
  });

  it("follows a redirect to an allowed host", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://example.org/real" } }),
      )
      .mockResolvedValueOnce(htmlResponse(pageWithJsonLd(RECIPE_JSON_LD)));

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract: vi.fn(),
    });
    expect(result.recipe.title).toBe("Tomato Soup");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["http://[::1]:3001/admin"],
    ["http://192.168.1.10/"],
    ["http://10.0.0.5/"],
    ["http://172.17.0.1/"],
    ["http://169.254.169.254/latest/meta-data"],
    ["http://localhost./x"],
    ["http://127.0.0.2/x"],
  ])("blocks %s", async (badUrl) => {
    const fetchImpl = vi.fn();
    await expect(
      extractRecipeFromUrl(badUrl, { fetchImpl, geminiExtract: vi.fn() }),
    ).rejects.toThrow(InvalidUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws ExtractionError when Gemini fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>No recipe here</body></html>"));
    const geminiExtract = vi.fn().mockRejectedValue(new GeminiExtractionError("boom"));

    await expect(
      extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract }),
    ).rejects.toThrow(ExtractionError);
  });

  it("throws ExtractionError when Gemini's output doesn't validate as a recipe", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>No recipe here</body></html>"));
    const geminiExtract = vi.fn().mockResolvedValue({ title: "" });

    await expect(
      extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract }),
    ).rejects.toThrow(ExtractionError);
  });

  it("throws FetchError when the page returns a non-2xx status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("not found", { status: 404 }));
    const geminiExtract = vi.fn();

    await expect(
      extractRecipeFromUrl("https://example.com/missing", { fetchImpl, geminiExtract }),
    ).rejects.toThrow(FetchError);
  });

  it("throws FetchError when the response isn't HTML", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("{}", { contentType: "application/json" }));
    const geminiExtract = vi.fn();

    await expect(
      extractRecipeFromUrl("https://example.com/data.json", { fetchImpl, geminiExtract }),
    ).rejects.toThrow(FetchError);
  });

  it("throws FetchError when the fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const geminiExtract = vi.fn();

    await expect(
      extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract }),
    ).rejects.toThrow(FetchError);
  });

  it.each([
    ["ftp://example.com/recipe"],
    ["not a url"],
    ["http://localhost/recipe"],
    ["http://127.0.0.1/recipe"],
  ])("rejects %s before making any request", async (badUrl) => {
    const fetchImpl = vi.fn();
    const geminiExtract = vi.fn();

    await expect(extractRecipeFromUrl(badUrl, { fetchImpl, geminiExtract })).rejects.toThrow(
      InvalidUrlError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("extractRecipeFromUrl — image discovery", () => {
  it("returns the JSON-LD image, resolved against the page URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(pageWithJsonLd({ ...RECIPE_JSON_LD, image: "/img/soup.jpg" })),
    );

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract: vi.fn(),
    });
    expect(result.imageUrl).toBe("https://example.com/img/soup.jpg");
  });

  it("falls back to an og:image meta tag when JSON-LD has no image", async () => {
    const html = `<html><head>
        <meta property="og:image" content="https://example.com/hero.jpg">
        <script type="application/ld+json">${JSON.stringify(RECIPE_JSON_LD)}</script>
      </head></html>`;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract: vi.fn(),
    });
    expect(result.imageUrl).toBe("https://example.com/hero.jpg");
  });

  it("still finds an og:image on the Gemini-fallback path", async () => {
    const html = `<html><head>
        <meta property="og:image" content="https://example.com/hero.jpg">
      </head><body><h1>Tomato Soup</h1></body></html>`;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));
    const geminiExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
    });

    const result = await extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract });
    expect(result.imageUrl).toBe("https://example.com/hero.jpg");
  });

  it("returns null when the page has no image at all", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(RECIPE_JSON_LD)));

    const result = await extractRecipeFromUrl("https://example.com/recipe", {
      fetchImpl,
      geminiExtract: vi.fn(),
    });
    expect(result.imageUrl).toBeNull();
  });

  it("returns yt-dlp's thumbnail for a social video import", async () => {
    const downloadSocialVideo = vi.fn().mockResolvedValue({
      videoBuffer: Buffer.from("fake"),
      mimeType: "video/mp4",
      caption: null,
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    });
    const geminiVideoExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
    });

    const result = await extractRecipeFromUrl("https://www.instagram.com/p/abc123/", {
      downloadSocialVideo,
      geminiVideoExtract,
    });
    expect(result.imageUrl).toBe("https://cdn.example.com/thumb.jpg");
  });
});

describe("extractRecipeFromUrl — Instagram/TikTok video path", () => {
  const FAKE_VIDEO = {
    videoBuffer: Buffer.from("fake"),
    mimeType: "video/mp4",
    caption: "1kg tomatoes",
    thumbnailUrl: null,
  };

  it("skips the HTML fetch entirely and goes straight to video download + Gemini", async () => {
    const fetchImpl = vi.fn();
    const downloadSocialVideo = vi.fn().mockResolvedValue(FAKE_VIDEO);
    const geminiVideoExtract = vi.fn().mockResolvedValue({
      title: "Tomato Soup",
      ingredients: [{ quantity: "1", unit: "kg", name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
    });
    const stages: string[] = [];

    const result = await extractRecipeFromUrl("https://www.instagram.com/p/abc123/", {
      fetchImpl,
      downloadSocialVideo,
      geminiVideoExtract,
      model: "chosen-model",
      onProgress: (stage) => stages.push(stage),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(downloadSocialVideo).toHaveBeenCalledTimes(1);
    expect(geminiVideoExtract).toHaveBeenCalledWith(
      { buffer: FAKE_VIDEO.videoBuffer, mimeType: FAKE_VIDEO.mimeType },
      FAKE_VIDEO.caption,
      "https://www.instagram.com/p/abc123/",
      { model: "chosen-model", signal: undefined },
    );
    expect(stages).toEqual(["downloading-video", "analyzing-video"]);
    expect(result.recipe.title).toBe("Tomato Soup");
    expect(result.recipe.sourceUrl).toBe("https://www.instagram.com/p/abc123/");
  });

  it("recognizes TikTok URLs the same way", async () => {
    const downloadSocialVideo = vi.fn().mockResolvedValue(FAKE_VIDEO);
    const geminiVideoExtract = vi.fn().mockResolvedValue({
      title: "Noodles",
      ingredients: [{ quantity: null, unit: null, name: "noodles" }],
      steps: [{ instruction: "Boil" }],
    });

    const result = await extractRecipeFromUrl("https://www.tiktok.com/@chef/video/123", {
      downloadSocialVideo,
      geminiVideoExtract,
    });
    expect(result.recipe.title).toBe("Noodles");
  });

  it("throws NotConfiguredError without downloading anything when no video-capable Gemini is set", async () => {
    const downloadSocialVideo = vi.fn();

    await expect(
      extractRecipeFromUrl("https://www.instagram.com/p/abc123/", { downloadSocialVideo }),
    ).rejects.toThrow(NotConfiguredError);
    expect(downloadSocialVideo).not.toHaveBeenCalled();
  });

  it("propagates VideoUnavailableError from a failed download without calling Gemini", async () => {
    const downloadSocialVideo = vi.fn().mockRejectedValue(new VideoUnavailableError("private"));
    const geminiVideoExtract = vi.fn();

    await expect(
      extractRecipeFromUrl("https://www.instagram.com/p/abc123/", {
        downloadSocialVideo,
        geminiVideoExtract,
      }),
    ).rejects.toThrow(VideoUnavailableError);
    expect(geminiVideoExtract).not.toHaveBeenCalled();
  });

  it("propagates VideoTooLargeError from a failed download", async () => {
    const downloadSocialVideo = vi.fn().mockRejectedValue(new VideoTooLargeError("too long"));

    await expect(
      extractRecipeFromUrl("https://www.instagram.com/p/abc123/", {
        downloadSocialVideo,
        geminiVideoExtract: vi.fn(),
      }),
    ).rejects.toThrow(VideoTooLargeError);
  });

  it("throws ExtractionError when the video yields no usable recipe", async () => {
    const downloadSocialVideo = vi.fn().mockResolvedValue(FAKE_VIDEO);
    const geminiVideoExtract = vi.fn().mockResolvedValue({ title: "" });

    await expect(
      extractRecipeFromUrl("https://www.instagram.com/p/abc123/", {
        downloadSocialVideo,
        geminiVideoExtract,
      }),
    ).rejects.toThrow(ExtractionError);
  });
});

describe("extractRecipeFromUrl — translation", () => {
  const ENGLISH_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Butter cookies",
    recipeIngredient: ["2 cups flour", "1 cup butter", "1 tbsp sugar"],
    recipeInstructions: [
      "Heat the oven to 350°F and add the butter to the flour.",
      "Mix the sugar into the dough with a spoon until smooth, then bake for 12 minutes.",
    ],
    totalTime: "PT20M",
  };
  const DUTCH_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Stoofvlees",
    recipeIngredient: ["1 kg rundvlees", "2 el boter"],
    recipeInstructions: [
      "Snijd het vlees in blokjes en bak het aan in de boter.",
      "Voeg het bier toe en laat het vlees met de ui een uur op een laag vuur stoven tot het zacht is.",
    ],
  };

  function jsonLdFetch(jsonLd: unknown) {
    return vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(jsonLd)));
  }

  const dutchTranslation = {
    title: "Boterkoekjes",
    ingredients: [
      { quantity: "2", unit: "cups", name: "bloem" },
      { quantity: "1", unit: "cup", name: "boter" },
      { quantity: "1", unit: "el", name: "suiker" },
    ],
    steps: [
      { instruction: "Verwarm de oven voor op 350°F en voeg de boter toe aan de bloem." },
      { instruction: "Meng de suiker door het deeg tot het glad is en bak 12 minuten." },
    ],
    // The model must not get to change tags; these are discarded.
    tags: ["vegan"],
  };

  it("translates a schema.org recipe that isn't in the target language", async () => {
    const geminiTranslate = vi.fn().mockResolvedValue(dutchTranslation);
    const stages: string[] = [];

    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
      geminiTranslate,
      language: "nl",
      model: "chosen-model",
      onProgress: (stage) => stages.push(stage),
    });

    expect(stages).toContain("translating");
    expect(geminiTranslate).toHaveBeenCalledTimes(1);
    expect(geminiTranslate.mock.calls[0]?.[1]).toBe("nl");
    expect(geminiTranslate.mock.calls[0]?.[2]).toMatchObject({ model: "chosen-model" });
    expect(result.recipe.title).toBe("Boterkoekjes");
    expect(result.recipe.tags).toEqual(["quick"]);
    expect(result.recipe.sourceUrl).toBe("https://example.com/cookies");
    expect(result.translationSkipped).toBe(false);
  });

  it("makes no translation call when the recipe is already in the target language", async () => {
    const geminiTranslate = vi.fn();

    const result = await extractRecipeFromUrl("https://example.com/stoofvlees", {
      fetchImpl: jsonLdFetch(DUTCH_JSON_LD),
      geminiTranslate,
      language: "nl",
    });

    expect(geminiTranslate).not.toHaveBeenCalled();
    expect(result.recipe.title).toBe("Stoofvlees");
    expect(result.translationSkipped).toBe(false);
  });

  it("makes no translation call with no language set", async () => {
    const geminiTranslate = vi.fn();

    await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
      geminiTranslate,
    });

    expect(geminiTranslate).not.toHaveBeenCalled();
  });

  it("keeps the original and flags it when translation fails", async () => {
    const geminiTranslate = vi.fn().mockRejectedValue(new GeminiUnavailableError("quota"));

    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
      geminiTranslate,
      language: "nl",
    });

    expect(result.recipe.title).toBe("Butter cookies");
    expect(result.translationSkipped).toBe(true);
  });

  it("keeps the original when the translation doesn't validate", async () => {
    const geminiTranslate = vi.fn().mockResolvedValue({ title: "", ingredients: [], steps: [] });

    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
      geminiTranslate,
      language: "nl",
    });

    expect(result.recipe.title).toBe("Butter cookies");
    expect(result.translationSkipped).toBe(true);
  });

  it("flags a skipped translation when no translator is configured", async () => {
    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
      language: "nl",
    });

    expect(result.translationSkipped).toBe(true);
  });

  it("still rethrows when the user cancelled mid-translation", async () => {
    const controller = new AbortController();
    const geminiTranslate = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new GeminiExtractionError("Gemini request timed out"));
    });

    await expect(
      extractRecipeFromUrl("https://example.com/cookies", {
        fetchImpl: jsonLdFetch(ENGLISH_JSON_LD),
        geminiTranslate,
        language: "nl",
        signal: controller.signal,
      }),
    ).rejects.toThrow(GeminiExtractionError);
  });

  it("asks the AI text path to write in the target language, with no extra call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>Tomato soup</body></html>"));
    const geminiExtract = vi.fn().mockResolvedValue({
      title: "Tomatensoep",
      ingredients: [{ quantity: "1", unit: "kg", name: "tomaten" }],
      steps: [{ instruction: "Laat de tomaten sudderen" }],
    });
    const geminiTranslate = vi.fn();

    const result = await extractRecipeFromUrl("https://example.com/soup", {
      fetchImpl,
      geminiExtract,
      geminiTranslate,
      language: "nl",
    });

    expect(geminiExtract.mock.calls[0]?.[2]).toMatchObject({ language: "nl" });
    expect(geminiTranslate).not.toHaveBeenCalled();
    expect(result.translationSkipped).toBe(false);
  });
});

describe("extractRecipeFromUrl — unit conversion", () => {
  const US_JSON_LD = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Butter cookies",
    recipeIngredient: ["2 cups flour", "8 oz butter", "2 eggs"],
    recipeInstructions: ["Heat the oven to 350°F.", "Bake for 12 minutes."],
  };
  const metric = { unitSystem: "metric", temperatureUnit: "C", keepSpoons: true } as const;

  it("converts amounts and oven temperatures into the user's units", async () => {
    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(US_JSON_LD))),
      units: metric,
    });

    expect(result.recipe.ingredients).toEqual([
      { quantity: "473.18", unit: "ml", name: "flour" },
      { quantity: "226.8", unit: "g", name: "butter" },
      { quantity: "2", unit: null, name: "eggs" },
    ]);
    expect(result.recipe.steps[0]?.instruction).toBe("Heat the oven to 177°C.");
  });

  it("converts after translating, recognising Dutch unit words", async () => {
    const geminiTranslate = vi.fn().mockResolvedValue({
      title: "Boterkoekjes",
      ingredients: [
        { quantity: "2", unit: "cups", name: "bloem" },
        { quantity: "3", unit: "tl", name: "suiker" },
      ],
      steps: [{ instruction: "Verwarm de oven voor op 350°F." }],
    });

    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(US_JSON_LD))),
      geminiTranslate,
      language: "nl",
      units: metric,
    });

    expect(result.recipe.ingredients).toEqual([
      { quantity: "473.18", unit: "ml", name: "bloem" },
      // 3 tl tidies up to 1 el, labelled in Dutch.
      { quantity: "1", unit: "el", name: "suiker" },
    ]);
    expect(result.recipe.steps[0]?.instruction).toBe("Verwarm de oven voor op 177°C.");
  });

  it("leaves amounts as written with no unit preferences", async () => {
    const result = await extractRecipeFromUrl("https://example.com/cookies", {
      fetchImpl: vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(US_JSON_LD))),
    });

    expect(result.recipe.ingredients[0]).toEqual({ quantity: "2", unit: "cups", name: "flour" });
  });
});

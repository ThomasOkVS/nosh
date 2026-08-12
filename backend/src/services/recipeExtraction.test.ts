import { describe, expect, it, vi } from "vitest";
import { GeminiExtractionError } from "../llm/geminiClient";
import {
  ExtractionError,
  extractRecipeFromUrl,
  FetchError,
  InvalidUrlError,
  NotConfiguredError,
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

    expect(result.title).toBe("Tomato Soup");
    expect(result.sourceUrl).toBe("https://example.com/recipe");
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

    const result = await extractRecipeFromUrl("https://example.com/recipe", { fetchImpl, geminiExtract });

    expect(geminiExtract).toHaveBeenCalledTimes(1);
    expect(result.title).toBe("Tomato Soup");
    expect(result.sourceUrl).toBe("https://example.com/recipe");
  });

  it("extracts JSON-LD with no Gemini configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(pageWithJsonLd(RECIPE_JSON_LD)));

    const result = await extractRecipeFromUrl("https://example.com/recipe", { fetchImpl });

    expect(result.title).toBe("Tomato Soup");
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
    expect(result.title).toBe("Tomato Soup");
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
    expect(result.tags).toEqual(["vegan"]);
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
    expect(result.title).toBe("Tomato Soup");
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

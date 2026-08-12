import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe, isCompleteEnough } from "./jsonLd";

function pageWith(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

const basicRecipe = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  description: "A warm classic",
  recipeYield: "4 servings",
  prepTime: "PT10M",
  cookTime: "PT1H30M",
  recipeIngredient: ["1 kg tomatoes", "1 clove garlic"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Simmer the tomatoes" },
    { "@type": "HowToStep", text: "Blend until smooth" },
  ],
  keywords: "soup, vegetarian, Some Author Name",
  suitableForDiet: "https://schema.org/VegetarianDiet",
  nutrition: { calories: "220 calories" },
};

describe("extractJsonLdRecipe", () => {
  it("maps a well-formed Recipe node", () => {
    const result = extractJsonLdRecipe(pageWith(basicRecipe));
    expect(result).toEqual({
      title: "Tomato Soup",
      description: "A warm classic",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 90,
      ingredients: [
        { quantity: null, unit: null, name: "1 kg tomatoes" },
        { quantity: null, unit: null, name: "1 clove garlic" },
      ],
      steps: [{ instruction: "Simmer the tomatoes" }, { instruction: "Blend until smooth" }],
      tags: ["vegetarian", "low calorie"],
    });
  });

  it("ignores the site's SEO keywords in favour of derived attribute tags", () => {
    const result = extractJsonLdRecipe(pageWith(basicRecipe));
    expect(result?.tags).not.toContain("Some Author Name");
    expect(result?.tags).not.toContain("soup");
  });

  it("finds a Recipe nested under @graph", () => {
    const html = pageWith({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite", name: "Some Site" }, basicRecipe],
    });
    expect(extractJsonLdRecipe(html)?.title).toBe("Tomato Soup");
  });

  it("finds a Recipe inside an array of top-level nodes", () => {
    const html = pageWith([{ "@type": "BreadcrumbList" }, basicRecipe]);
    expect(extractJsonLdRecipe(html)?.title).toBe("Tomato Soup");
  });

  it("handles nested HowToSection instructions", () => {
    const html = pageWith({
      ...basicRecipe,
      recipeInstructions: [
        {
          "@type": "HowToSection",
          itemListElement: [
            { "@type": "HowToStep", text: "Step one" },
            { "@type": "HowToStep", text: "Step two" },
          ],
        },
      ],
    });
    expect(extractJsonLdRecipe(html)?.steps).toEqual([
      { instruction: "Step one" },
      { instruction: "Step two" },
    ]);
  });

  it("skips a malformed JSON-LD block instead of throwing", () => {
    const html = `<script type="application/ld+json">{not valid json</script>`;
    expect(() => extractJsonLdRecipe(html)).not.toThrow();
    expect(extractJsonLdRecipe(html)).toBeNull();
  });

  it("falls through a non-Recipe block to a later Recipe block", () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "Site" })}</script>
      <script type="application/ld+json">${JSON.stringify(basicRecipe)}</script>
    `;
    expect(extractJsonLdRecipe(html)?.title).toBe("Tomato Soup");
  });

  it("returns null when no JSON-LD is present", () => {
    expect(extractJsonLdRecipe("<html><body>Just some text</body></html>")).toBeNull();
  });
});

describe("isCompleteEnough", () => {
  it("accepts a recipe with a title, ingredients, and steps", () => {
    expect(isCompleteEnough(extractJsonLdRecipe(pageWith(basicRecipe)))).toBe(true);
  });

  it("rejects null", () => {
    expect(isCompleteEnough(null)).toBe(false);
  });

  it("rejects a title-only recipe", () => {
    const html = pageWith({ "@type": "Recipe", name: "Just a Title" });
    expect(isCompleteEnough(extractJsonLdRecipe(html))).toBe(false);
  });
});

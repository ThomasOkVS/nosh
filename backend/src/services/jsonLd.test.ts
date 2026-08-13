import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe, extractMetaImageUrl, isCompleteEnough, parseIsoDurationToMinutes } from "./jsonLd";

function pageWith(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

describe("parseIsoDurationToMinutes", () => {
  it.each([
    ["PT10M", 10],
    ["PT1H30M", 90],
    // Real recipe plugins emit both of these often enough that they need
    // dedicated coverage, not just incidental exercise via a fixture.
    ["P0DT1H0M", 60], // day prefix
    ["PT1H30M15S", 90], // seconds component, ignored rather than breaking the match
    ["P1DT2H", 1560], // non-zero day prefix
    ["PT45S", null], // seconds-only, no minutes/hours to report
    ["PT0M", null], // parses fine but totals zero, same as "no duration"
  ])("%s -> %s minutes", (duration, expected) => {
    expect(parseIsoDurationToMinutes(duration)).toBe(expected);
  });

  it.each(["P1Y", "not a duration", "PT", "P"])("rejects %s", (duration) => {
    expect(parseIsoDurationToMinutes(duration)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseIsoDurationToMinutes(null)).toBeNull();
    expect(parseIsoDurationToMinutes(undefined)).toBeNull();
    expect(parseIsoDurationToMinutes(42)).toBeNull();
  });
});

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

  it("picks up a plain string image", () => {
    const html = pageWith({ ...basicRecipe, image: "https://example.com/soup.jpg" });
    expect(extractJsonLdRecipe(html)?.imageUrl).toBe("https://example.com/soup.jpg");
  });

  it("picks up the first entry of an array of images", () => {
    const html = pageWith({
      ...basicRecipe,
      image: ["https://example.com/soup-1.jpg", "https://example.com/soup-2.jpg"],
    });
    expect(extractJsonLdRecipe(html)?.imageUrl).toBe("https://example.com/soup-1.jpg");
  });

  it("reads the url off an ImageObject", () => {
    const html = pageWith({
      ...basicRecipe,
      image: { "@type": "ImageObject", url: "https://example.com/soup.jpg" },
    });
    expect(extractJsonLdRecipe(html)?.imageUrl).toBe("https://example.com/soup.jpg");
  });

  it("omits imageUrl entirely when the page publishes no image", () => {
    const result = extractJsonLdRecipe(pageWith(basicRecipe));
    expect(result).not.toHaveProperty("imageUrl");
  });
});

describe("extractMetaImageUrl", () => {
  it("reads og:image", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/hero.jpg"></head></html>`;
    expect(extractMetaImageUrl(html)).toBe("https://example.com/hero.jpg");
  });

  it("falls back to twitter:image when og:image is absent", () => {
    const html = `<html><head><meta name="twitter:image" content="https://example.com/hero.jpg"></head></html>`;
    expect(extractMetaImageUrl(html)).toBe("https://example.com/hero.jpg");
  });

  it("prefers og:image over twitter:image when both are present", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.jpg">
      <meta name="twitter:image" content="https://example.com/twitter.jpg">
    </head></html>`;
    expect(extractMetaImageUrl(html)).toBe("https://example.com/og.jpg");
  });

  it("returns null when neither is present", () => {
    expect(extractMetaImageUrl("<html><head></head></html>")).toBeNull();
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

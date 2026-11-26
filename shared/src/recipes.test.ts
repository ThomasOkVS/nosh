import { describe, expect, it } from "vitest";
import { MAX_INT4, normaliseTag, RECIPE_LIMITS, RECIPE_MESSAGES, recipeBody } from "./recipes.js";

const firstError = (input: unknown): string | undefined => {
  const result = recipeBody.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("recipeBody", () => {
  it("REC-03: a title alone is a valid recipe, with defaults filled in", () => {
    const result = recipeBody.parse({ title: "Soup" });
    expect(result).toEqual({
      title: "Soup",
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      sourceUrl: null,
      ingredients: [],
      steps: [],
      tags: [],
    });
  });

  it("REC-03: null optional fields stay null", () => {
    const result = recipeBody.parse({
      title: "Soup",
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      sourceUrl: null,
    });
    expect(result.description).toBeNull();
    expect(result.servings).toBeNull();
  });

  it("REC-03: a title is trimmed", () => {
    expect(recipeBody.parse({ title: "  Soup  " }).title).toBe("Soup");
  });

  it("REC-03: a blank title is refused", () => {
    expect(firstError({ title: "  " })).toBe(RECIPE_MESSAGES.titleRequired);
  });

  it("REC-03: a missing title is refused", () => {
    expect(firstError({})).toBe(RECIPE_MESSAGES.titleRequired);
  });

  it("REC-03: a 200-character title is fine, 201 is too long", () => {
    expect(firstError({ title: "a".repeat(RECIPE_LIMITS.title) })).toBeUndefined();
    expect(firstError({ title: "a".repeat(RECIPE_LIMITS.title + 1) })).toBe(
      RECIPE_MESSAGES.titleTooLong,
    );
  });

  it("REC-03: an empty or blank description is refused, and it is trimmed otherwise", () => {
    expect(firstError({ title: "x", description: "" })).toBe(RECIPE_MESSAGES.descriptionBlank);
    expect(firstError({ title: "x", description: "  " })).toBe(RECIPE_MESSAGES.descriptionBlank);
    expect(recipeBody.parse({ title: "x", description: " hi " }).description).toBe("hi");
  });

  it("REC-03: servings must be a whole number of at least 1 or null", () => {
    for (const servings of [0, -1, 1.5, "2"]) {
      expect(firstError({ title: "x", servings })).toBe(RECIPE_MESSAGES.servings);
    }
    expect(recipeBody.parse({ title: "x", servings: 4 }).servings).toBe(4);
  });

  it("REC-03: prep time of 0 or a fraction is refused", () => {
    expect(firstError({ title: "x", prepTimeMinutes: 0 })).toBe(RECIPE_MESSAGES.prepTime);
    expect(firstError({ title: "x", prepTimeMinutes: 2.5 })).toBe(RECIPE_MESSAGES.prepTime);
    expect(recipeBody.parse({ title: "x", prepTimeMinutes: 10 }).prepTimeMinutes).toBe(10);
  });

  it("REC-03: cook time of 0 or a negative is refused", () => {
    expect(firstError({ title: "x", cookTimeMinutes: 0 })).toBe(RECIPE_MESSAGES.cookTime);
    expect(firstError({ title: "x", cookTimeMinutes: -5 })).toBe(RECIPE_MESSAGES.cookTime);
    expect(recipeBody.parse({ title: "x", cookTimeMinutes: 30 }).cookTimeMinutes).toBe(30);
  });

  it("REC-03 Review Focus 1: whole-number fields above the Postgres integer range are refused", () => {
    const tooBig = MAX_INT4 + 1;
    expect(firstError({ title: "x", servings: tooBig })).toBe(RECIPE_MESSAGES.servings);
    expect(firstError({ title: "x", prepTimeMinutes: 99999999999 })).toBe(RECIPE_MESSAGES.prepTime);
    expect(firstError({ title: "x", cookTimeMinutes: tooBig })).toBe(RECIPE_MESSAGES.cookTime);
    expect(recipeBody.parse({ title: "x", servings: MAX_INT4 }).servings).toBe(MAX_INT4);
  });

  it("REC-03: 100 ingredients are fine, 101 are refused", () => {
    const make = (n: number) => Array.from({ length: n }, () => ({ name: "salt" }));
    expect(firstError({ title: "x", ingredients: make(100) })).toBeUndefined();
    expect(firstError({ title: "x", ingredients: make(101) })).toBe(
      RECIPE_MESSAGES.tooManyIngredients,
    );
  });

  it("REC-03: 100 steps are fine, 101 are refused", () => {
    const make = (n: number) => Array.from({ length: n }, () => ({ instruction: "stir" }));
    expect(firstError({ title: "x", steps: make(100) })).toBeUndefined();
    expect(firstError({ title: "x", steps: make(101) })).toBe(RECIPE_MESSAGES.tooManySteps);
  });

  it("REC-03: 30 tags are fine, 31 are refused", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(firstError({ title: "x", tags: make(30) })).toBeUndefined();
    expect(firstError({ title: "x", tags: make(31) })).toBe(RECIPE_MESSAGES.tooManyTags);
  });

  it("REC-03 REC-06: an ingredient needs a name; quantity and unit are optional", () => {
    expect(firstError({ title: "x", ingredients: [{ name: " " }] })).toBe(
      RECIPE_MESSAGES.ingredientName,
    );
    expect(firstError({ title: "x", ingredients: [{}] })).toBe(RECIPE_MESSAGES.ingredientName);
    const parsed = recipeBody.parse({ title: "x", ingredients: [{ name: " salt " }] });
    expect(parsed.ingredients).toEqual([{ name: "salt", quantity: null, unit: null }]);
  });

  it("REC-03 REC-06: quantity is free text, trimmed; blank quantity or unit is refused", () => {
    const parsed = recipeBody.parse({
      title: "x",
      ingredients: [{ name: "salt", quantity: " a pinch ", unit: " g " }],
    });
    expect(parsed.ingredients[0]).toEqual({ name: "salt", quantity: "a pinch", unit: "g" });
    expect(firstError({ title: "x", ingredients: [{ name: "s", quantity: " " }] })).toBe(
      RECIPE_MESSAGES.quantityBlank,
    );
    expect(firstError({ title: "x", ingredients: [{ name: "s", unit: "" }] })).toBe(
      RECIPE_MESSAGES.unitBlank,
    );
  });

  it("REC-03: a step needs an instruction, which is trimmed", () => {
    expect(firstError({ title: "x", steps: [{ instruction: "  " }] })).toBe(
      RECIPE_MESSAGES.stepInstruction,
    );
    expect(recipeBody.parse({ title: "x", steps: [{ instruction: " stir " }] }).steps).toEqual([
      { instruction: "stir" },
    ]);
  });

  it("REC-03: a blank tag is refused and tags are trimmed", () => {
    expect(firstError({ title: "x", tags: ["a", "  "] })).toBe(RECIPE_MESSAGES.tagBlank);
    expect(recipeBody.parse({ title: "x", tags: [" soup "] }).tags).toEqual(["soup"]);
  });

  it("REC-04: a javascript: or ftp: source URL is refused", () => {
    expect(firstError({ title: "x", sourceUrl: "javascript:alert(1)" })).toBe(
      RECIPE_MESSAGES.sourceUrl,
    );
    expect(firstError({ title: "x", sourceUrl: "ftp://x.test/a" })).toBe(
      RECIPE_MESSAGES.sourceUrl,
    );
    expect(firstError({ title: "x", sourceUrl: "not a url" })).toBe(RECIPE_MESSAGES.sourceUrl);
    expect(firstError({ title: "x", sourceUrl: "" })).toBe(RECIPE_MESSAGES.sourceUrl);
  });

  it("REC-04: http and https source URLs are accepted and trimmed", () => {
    expect(recipeBody.parse({ title: "x", sourceUrl: " https://x.test/a " }).sourceUrl).toBe(
      "https://x.test/a",
    );
    expect(recipeBody.parse({ title: "x", sourceUrl: "http://x.test/a" }).sourceUrl).toBe(
      "http://x.test/a",
    );
  });

  it("REC-03 REC-11 REC-12: collectionId is a positive integer, null, or left out", () => {
    expect(recipeBody.parse({ title: "x", collectionId: 3 }).collectionId).toBe(3);
    expect(recipeBody.parse({ title: "x", collectionId: null }).collectionId).toBeNull();
    expect(recipeBody.parse({ title: "x" }).collectionId).toBeUndefined();
    expect(recipeBody.safeParse({ title: "x", collectionId: 0 }).success).toBe(false);
    expect(recipeBody.safeParse({ title: "x", collectionId: 1.5 }).success).toBe(false);
  });
});

describe("normaliseTag", () => {
  it("REC-07: trims and lower-cases", () => {
    expect(normaliseTag("  CRÈME ")).toBe("crème");
  });

  it("REC-07 Review Focus 3: decomposed and precomposed \"crème\" normalise to the same precomposed tag", () => {
    const nfd = "CRÈME";
    const nfc = "crème";
    expect(nfd.toLowerCase()).not.toBe(nfc);
    expect(normaliseTag(nfd)).toBe(nfc);
    expect(normaliseTag(` ${nfc} `)).toBe(nfc);
  });
});

describe("recipeBody tag length", () => {
  it("REC-03 Review Focus 3: a 50-character tag is fine, 51 is refused", () => {
    expect(firstError({ title: "x", tags: ["a".repeat(RECIPE_LIMITS.tagLength)] })).toBeUndefined();
    expect(firstError({ title: "x", tags: ["a".repeat(RECIPE_LIMITS.tagLength + 1)] })).toBe(
      RECIPE_MESSAGES.tagTooLong,
    );
  });
});

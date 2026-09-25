import { describe, expect, it } from "vitest";
import type { RecipeInput } from "../validation/recipes";
import { detectRecipeLanguage, needsTranslation } from "./recipeLanguage";

function recipe(title: string, steps: string[], ingredients: string[] = []): RecipeInput {
  return {
    title,
    description: null,
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    sourceUrl: null,
    collectionId: null,
    ingredients: ingredients.map((name) => ({ quantity: null, unit: null, name })),
    steps: steps.map((instruction) => ({ instruction })),
    tags: [],
  };
}

const DUTCH = recipe(
  "Stoofvlees met frietjes",
  [
    "Snijd het vlees in blokjes en bak het aan in de boter.",
    "Voeg de ui en het bier toe en laat het een uur stoven tot het vlees zacht is.",
  ],
  ["rundvlees", "boter", "ui"],
);

const ENGLISH = recipe(
  "Beef stew with fries",
  [
    "Cut the beef into cubes and brown it in the butter.",
    "Add the onion and the beer, then stir and cook for an hour until the beef is tender.",
  ],
  ["beef", "butter", "onion"],
);

describe("detectRecipeLanguage", () => {
  it("recognises clearly Dutch and clearly English recipes", () => {
    expect(detectRecipeLanguage(DUTCH)).toBe("nl");
    expect(detectRecipeLanguage(ENGLISH)).toBe("en");
  });

  it("is unsure about text that's too short or mixed", () => {
    expect(detectRecipeLanguage(recipe("Soup", ["Simmer."]))).toBeNull();
    expect(
      detectRecipeLanguage(
        recipe(
          "Mix",
          [...DUTCH.steps, ...ENGLISH.steps].map((s) => s.instruction),
        ),
      ),
    ).toBeNull();
  });
});

describe("needsTranslation", () => {
  it("skips recipes already in the target language", () => {
    expect(needsTranslation(DUTCH, "nl")).toBe(false);
    expect(needsTranslation(ENGLISH, "nl")).toBe(true);
  });

  it("translates when unsure", () => {
    expect(needsTranslation(recipe("Soup", ["Simmer."]), "en")).toBe(true);
  });
});

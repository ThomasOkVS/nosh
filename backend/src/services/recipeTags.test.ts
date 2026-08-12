import { describe, expect, it } from "vitest";
import { deriveTags, filterToVocabulary } from "./recipeTags";

describe("deriveTags", () => {
  it("maps schema.org suitableForDiet values", () => {
    expect(
      deriveTags({
        suitableForDiet: ["https://schema.org/VeganDiet", "https://schema.org/GlutenFreeDiet"],
      }),
    ).toEqual(["vegan", "gluten free"]);
  });

  it("accepts suitableForDiet given as objects with @id", () => {
    expect(deriveTags({ suitableForDiet: { "@id": "https://schema.org/VegetarianDiet" } })).toEqual([
      "vegetarian",
    ]);
  });

  it("drops diets with no clean equivalent", () => {
    expect(deriveTags({ suitableForDiet: "https://schema.org/HinduDiet" })).toEqual([]);
  });

  it("derives nutrition tags from per-serving values", () => {
    expect(
      deriveTags({
        nutrition: {
          calories: "389 calories",
          proteinContent: "31 g",
          carbohydrateContent: "18 g",
          fatContent: "8 g",
        },
      }),
    ).toEqual(["low calorie", "high protein", "low carb", "low fat"]);
  });

  it("omits nutrition tags when values are above the thresholds", () => {
    expect(
      deriveTags({
        nutrition: { calories: "980 calories", proteinContent: "8 g", fatContent: "44 g" },
      }),
    ).toEqual([]);
  });

  it("tags quick recipes from total time, falling back to prep + cook", () => {
    expect(deriveTags({ totalMinutes: 25 })).toEqual(["quick"]);
    expect(deriveTags({ totalMinutes: 75 })).toEqual([]);
  });

  it("maps recipeCategory onto meal types only for known values", () => {
    expect(deriveTags({ recipeCategory: "Main Course" })).toEqual(["dinner"]);
    expect(deriveTags({ recipeCategory: "Dessert" })).toEqual(["dessert"]);
    expect(deriveTags({ recipeCategory: "Weeknight Family Favourites" })).toEqual([]);
  });

  it("returns nothing when the page publishes nothing usable", () => {
    expect(deriveTags({})).toEqual([]);
  });

  it("deduplicates across sources", () => {
    expect(
      deriveTags({
        suitableForDiet: "https://schema.org/LowCalorieDiet",
        nutrition: { calories: "300" },
      }),
    ).toEqual(["low calorie"]);
  });
});

describe("filterToVocabulary", () => {
  it("keeps vocabulary tags and drops free-text ones", () => {
    expect(filterToVocabulary(["High Protein", "Stuffed Potato", "quick", "Angela Boggiano"])).toEqual([
      "high protein",
      "quick",
    ]);
  });

  it("drops tags implied by a stronger one", () => {
    expect(filterToVocabulary(["vegan", "vegetarian", "pescatarian", "quick"])).toEqual([
      "vegan",
      "quick",
    ]);
    expect(filterToVocabulary(["vegetarian", "pescatarian"])).toEqual(["vegetarian"]);
  });

  it("caps the number of tags", () => {
    expect(
      filterToVocabulary([
        "gluten free",
        "dairy free",
        "nut free",
        "quick",
        "snack",
        "side",
        "low carb",
      ]),
    ).toHaveLength(5);
  });
});

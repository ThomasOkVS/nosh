import { describe, expect, it } from "vitest";
import { normalizeIngredients, parseIngredientLine } from "./ingredientLine";

describe("parseIngredientLine", () => {
  it.each([
    ["1 tsp chili powder", { quantity: "1", unit: "tsp", name: "chili powder" }],
    ["1 pound extra lean ground beef", { quantity: "1", unit: "pound", name: "extra lean ground beef" }],
    ["2 cloves garlic (finely minced)", { quantity: "2", unit: "cloves", name: "garlic (finely minced)" }],
    ["500g beef mince", { quantity: "500", unit: "g", name: "beef mince" }],
    ["400ml crème fraîche", { quantity: "400", unit: "ml", name: "crème fraîche" }],
    ["2-3 tsp olive oil", { quantity: "2-3", unit: "tsp", name: "olive oil" }],
    ["1 1/2 cups flour", { quantity: "1 1/2", unit: "cups", name: "flour" }],
    ["1/2 cup milk", { quantity: "1/2", unit: "cup", name: "milk" }],
    ["½ tsp salt", { quantity: "½", unit: "tsp", name: "salt" }],
    ["2 x 400g cans chopped tomatoes", { quantity: "2 x 400", unit: "g", name: "cans chopped tomatoes" }],
    ["2 tbsp. butter", { quantity: "2", unit: "tbsp", name: "butter" }],
    ["3 fl oz cream", { quantity: "3", unit: "fl oz", name: "cream" }],
  ])("splits %s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });

  it("leaves size adjectives in the name rather than treating them as units", () => {
    expect(parseIngredientLine("2 medium sized sweet potatoes")).toEqual({
      quantity: "2",
      unit: null,
      name: "medium sized sweet potatoes",
    });
    expect(parseIngredientLine("1 small onion (small diced)")).toEqual({
      quantity: "1",
      unit: null,
      name: "small onion (small diced)",
    });
  });

  it("leaves a line with no leading quantity untouched", () => {
    expect(parseIngredientLine("salt and pepper to taste")).toEqual({
      quantity: null,
      unit: null,
      name: "salt and pepper to taste",
    });
  });

  it("keeps the whole line when nothing would be left as a name", () => {
    expect(parseIngredientLine("2 cups")).toEqual({ quantity: null, unit: null, name: "2 cups" });
    expect(parseIngredientLine("12")).toEqual({ quantity: null, unit: null, name: "12" });
  });

  it("collapses stray whitespace", () => {
    expect(parseIngredientLine("  2   cloves   garlic  ")).toEqual({
      quantity: "2",
      unit: "cloves",
      name: "garlic",
    });
  });
});

describe("normalizeIngredients", () => {
  it("splits unparsed lines", () => {
    expect(normalizeIngredients([{ quantity: null, unit: null, name: "1 kg tomatoes" }])).toEqual([
      { quantity: "1", unit: "kg", name: "tomatoes" },
    ]);
  });

  it("leaves already-split ingredients alone", () => {
    const already = [{ quantity: "2", unit: null, name: "medium sweet potatoes" }];
    expect(normalizeIngredients(already)).toEqual(already);
  });
});

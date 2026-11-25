import { RECIPE_MESSAGES } from "@nosh/shared";
import { describe, expect, it } from "vitest";
import { recipeDto } from "../../test/recipes";
import { emptyFormValues, recipeFormSchema, toFormValues, type RecipeFormValues } from "./formValues";

const values = (overrides: Partial<RecipeFormValues>): RecipeFormValues => ({
  ...emptyFormValues(),
  title: "Toast",
  ...overrides,
});

/** The messages of every issue, keyed by its dotted path. */
function issues(input: RecipeFormValues): Record<string, string> {
  const result = recipeFormSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("form values", () => {
  it("REC-27: a blank form has one empty ingredient row and one empty step row", () => {
    expect(emptyFormValues()).toEqual({
      title: "",
      description: "",
      servings: "",
      prepTimeMinutes: "",
      cookTimeMinutes: "",
      ingredients: [{ quantity: "", unit: "", name: "" }],
      steps: [{ instruction: "" }],
      tags: [],
    });
  });

  it("REC-27: a recipe loads into the fields, and empty lists get one empty row", () => {
    const filled = toFormValues(
      recipeDto({
        id: 5,
        title: "Stoverij",
        description: "Slow.",
        servings: 6,
        prepTimeMinutes: null,
        cookTimeMinutes: 170,
        tags: ["stew"],
        ingredients: [
          { id: 2, position: 1, quantity: null, unit: null, name: "salt" },
          { id: 1, position: 0, quantity: "1", unit: "kg", name: "beef" },
        ],
        steps: [{ id: 3, position: 0, instruction: "Brown it." }],
      }),
    );
    expect(filled).toEqual({
      title: "Stoverij",
      description: "Slow.",
      servings: "6",
      prepTimeMinutes: "",
      cookTimeMinutes: "170",
      ingredients: [
        { quantity: "1", unit: "kg", name: "beef" },
        { quantity: "", unit: "", name: "salt" },
      ],
      steps: [{ instruction: "Brown it." }],
      tags: ["stew"],
    });

    const empty = toFormValues(recipeDto({ id: 6, title: "Bare" }));
    expect(empty.ingredients).toEqual([{ quantity: "", unit: "", name: "" }]);
    expect(empty.steps).toEqual([{ instruction: "" }]);
  });

  it("REC-29: trims, blanks become null, blank rows are dropped", () => {
    const output = recipeFormSchema.parse(
      values({
        title: "  Stoverij  ",
        description: "   ",
        servings: " 4 ",
        prepTimeMinutes: "",
        cookTimeMinutes: "170",
        ingredients: [
          { quantity: " 1 ", unit: " kg ", name: " beef " },
          { quantity: "2", unit: "", name: "   " },
          { quantity: "", unit: "  ", name: "salt" },
        ],
        steps: [{ instruction: "  " }, { instruction: " Brown it. " }],
        tags: ["stew", "belgian"],
      }),
    );
    expect(output).toEqual({
      title: "Stoverij",
      description: null,
      servings: 4,
      prepTimeMinutes: null,
      cookTimeMinutes: 170,
      ingredients: [
        { quantity: "1", unit: "kg", name: "beef" },
        { quantity: null, unit: null, name: "salt" },
      ],
      steps: [{ instruction: "Brown it." }],
      tags: ["stew", "belgian"],
    });
  });

  it('REC-28 REC-29: "0" servings, prep or cook is refused with its message and never output', () => {
    expect(issues(values({ servings: "0", prepTimeMinutes: "0", cookTimeMinutes: "0" }))).toEqual({
      servings: RECIPE_MESSAGES.servings,
      prepTimeMinutes: RECIPE_MESSAGES.prepTime,
      cookTimeMinutes: RECIPE_MESSAGES.cookTime,
    });
    // Not whole numbers, or too big for the database, are refused the same way.
    expect(issues(values({ servings: "1.5", prepTimeMinutes: "-3", cookTimeMinutes: "2147483648" }))).toEqual({
      servings: RECIPE_MESSAGES.servings,
      prepTimeMinutes: RECIPE_MESSAGES.prepTime,
      cookTimeMinutes: RECIPE_MESSAGES.cookTime,
    });
    expect(recipeFormSchema.parse(values({ servings: "2147483647" })).servings).toBe(2147483647);
  });

  it("REC-28: an over-cap title or 101 ingredients is refused with the cap message", () => {
    const row = { quantity: "", unit: "", name: "salt" };
    expect(
      issues(
        values({
          title: "x".repeat(201),
          ingredients: Array.from({ length: 101 }, () => row),
          steps: Array.from({ length: 101 }, () => ({ instruction: "Stir." })),
        }),
      ),
    ).toEqual({
      title: RECIPE_MESSAGES.titleTooLong,
      ingredients: RECIPE_MESSAGES.tooManyIngredients,
      steps: RECIPE_MESSAGES.tooManySteps,
    });
    expect(issues(values({ title: "   " }))).toEqual({ title: RECIPE_MESSAGES.titleRequired });
    // Blank rows don't count towards the cap.
    const fine = values({
      title: "x".repeat(200),
      ingredients: [...Array.from({ length: 100 }, () => row), { quantity: "", unit: "", name: "" }],
    });
    expect(recipeFormSchema.safeParse(fine).success).toBe(true);
  });
});

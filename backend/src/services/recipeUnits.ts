import {
  convertIngredient,
  convertTemperaturesInText,
  type RecipeLanguage,
  type UnitPreferences,
} from "@nosh/units";
import type { RecipeInput } from "../validation/recipes";

/**
 * Rewrites an imported recipe into the user's units: every ingredient
 * amount (1 cup -> 236.59 ml) and every explicit oven temperature in the
 * steps (350°F -> 177°C). Deterministic and exact, unlike asking the model
 * to do it. Lossy by design, and accepted as such: the stored recipe keeps
 * the converted, 2-decimal amounts, not the source's originals. See
 * docs/decisions.md.
 */
export function convertRecipeUnits(
  recipe: RecipeInput,
  preferences: UnitPreferences,
  language: RecipeLanguage | null | undefined,
): RecipeInput {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) =>
      convertIngredient(ingredient, { ...preferences, language }),
    ),
    steps: recipe.steps.map((step) => ({
      ...step,
      instruction: convertTemperaturesInText(step.instruction, preferences.temperatureUnit),
    })),
  };
}

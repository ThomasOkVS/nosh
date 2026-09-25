import { DEFAULT_UNIT_PREFERENCES } from "@nosh/units";
import { getRecipePreferences, type RecipePreferences } from "../api/settings";
import { useAsync } from "./useAsync";

const FALLBACK: RecipePreferences = { language: null, ...DEFAULT_UNIT_PREFERENCES };

/**
 * The signed-in user's language & unit preferences, for showing a recipe.
 * Falls back to the defaults while loading or if the request fails — a
 * recipe page should never be blocked on a display preference.
 */
export function useRecipePreferences(): RecipePreferences {
  const { data } = useAsync(getRecipePreferences);
  return data ?? FALLBACK;
}

import type { RecipeInput } from "../api/types";

/** The router state ImportProvider (and NewRecipePage) hand to the create
 * form when an import finishes. */
export interface ImportedRecipeState {
  importedRecipe: RecipeInput;
  importedImageUrl: string | null;
  /** Read by RecipeFormPage's `initialCollectionIdFrom`. */
  collectionId: number | null;
}

/**
 * Router state lives in `history.state`: it survives reloads, outlives
 * deploys, and any script can push arbitrary values into it. Validate rather
 * than cast, or a stale/hostile entry crashes the form during render.
 */
export function importedRecipeFrom(state: unknown): RecipeInput | null {
  if (!state || typeof state !== "object" || !("importedRecipe" in state)) return null;
  const candidate = (state as { importedRecipe?: unknown }).importedRecipe;
  if (!candidate || typeof candidate !== "object") return null;
  const recipe = candidate as Partial<RecipeInput>;
  if (typeof recipe.title !== "string") return null;
  if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) return null;
  if (!Array.isArray(recipe.tags)) return null;
  return recipe as RecipeInput;
}

export function importedImageUrlFrom(state: unknown): string | null {
  if (!state || typeof state !== "object" || !("importedImageUrl" in state)) return null;
  const candidate = (state as { importedImageUrl?: unknown }).importedImageUrl;
  return typeof candidate === "string" ? candidate : null;
}

import { MAX_INT4 } from "@nosh/shared";

export const RECIPE_NOT_FOUND = "Recipe not found";

/** Recipe ids are positive 32-bit integers; anything else can't be a recipe (REC-25). */
export function parseRecipeId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_INT4 ? id : null;
}

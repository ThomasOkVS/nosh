import { MAX_INT4 } from "@nosh/shared";

export type RecipeIdResult = { ok: true; id: number } | { ok: false; status: 400 | 404 };

/**
 * REC-08: a recipe id is a positive whole number written without sign, zeros or
 * exponent (400 otherwise). One above the Postgres integer range cannot exist,
 * so it is a 404 and never reaches the database (Review Focus 1).
 */
export function parseRecipeId(raw: string): RecipeIdResult {
  if (!/^[1-9][0-9]*$/.test(raw)) return { ok: false, status: 400 };
  const id = Number(raw);
  if (id > MAX_INT4) return { ok: false, status: 404 };
  return { ok: true, id };
}

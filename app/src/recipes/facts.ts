import type { RecipeDto } from "@nosh/shared";

type Facts = Pick<RecipeDto, "servings" | "prepTimeMinutes" | "cookTimeMinutes">;

/**
 * REC-38: "Serves 4 · Prep 20 min · Cook 35 min", each part only when set;
 * "" when none is. The card and the recipe page share it.
 */
export function factsLine({ servings, prepTimeMinutes, cookTimeMinutes }: Facts): string {
  const parts: string[] = [];
  if (servings !== null) parts.push(`Serves ${servings}`);
  if (prepTimeMinutes !== null) parts.push(`Prep ${prepTimeMinutes} min`);
  if (cookTimeMinutes !== null) parts.push(`Cook ${cookTimeMinutes} min`);
  return parts.join(" · ");
}

/** The big serif letter shown when a recipe has no cover photo. */
export function placeholderLetter(title: string): string {
  const first = [...title.trim()][0];
  return first === undefined ? "?" : first.toLocaleUpperCase();
}

/** The cover's card copy, or null. Hidden v1 photos are never shown (REC-15). */
export function coverCardUrl(recipe: Pick<RecipeDto, "images" | "coverImageId">): string | null {
  if (recipe.coverImageId === null) return null;
  return recipe.images.find((image) => image.id === recipe.coverImageId)?.cardUrl ?? null;
}

/** The cover at full size for the recipe page, or null. Hidden v1 photos are never shown (REC-21). */
export function coverUrl(recipe: Pick<RecipeDto, "images" | "coverImageId">): string | null {
  if (recipe.coverImageId === null) return null;
  return recipe.images.find((image) => image.id === recipe.coverImageId)?.url ?? null;
}

/**
 * REC-22: the hostname of a stored source URL, or null when it isn't a valid
 * http(s) URL, so a bad value never shows a link or breaks the page.
 */
export function sourceHost(sourceUrl: string | null): string | null {
  if (sourceUrl === null) return null;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

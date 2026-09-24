import { apiFetch, apiUrl } from "./client";
import type { Recipe, RecipeImage, RecipeInput } from "./types";

export interface RecipeFilters {
  tag?: string;
  /** Only recipes directly in this collection — `"root"` means Home. */
  collection?: number | "root";
  /** Only recipes in this collection or anywhere beneath it. */
  within?: number;
}

function filterParams(filters: RecipeFilters, params = new URLSearchParams()): URLSearchParams {
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.collection !== undefined) params.set("collection", String(filters.collection));
  if (filters.within !== undefined) params.set("within", String(filters.within));
  return params;
}

export function listRecipes(filters: RecipeFilters = {}): Promise<Recipe[]> {
  const query = filterParams(filters).toString();
  return apiFetch<Recipe[]>(`/recipes${query ? `?${query}` : ""}`);
}

export function searchRecipes(query: string, filters: RecipeFilters = {}): Promise<Recipe[]> {
  const params = filterParams(filters, new URLSearchParams({ q: query }));
  return apiFetch<Recipe[]>(`/recipes/search?${params.toString()}`);
}

/** Moves a recipe to a different collection, or to Home with `null` — the
 * only way its collection ever changes. */
export function moveRecipeCollection(recipeId: number, collectionId: number | null): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${recipeId}/collection`, {
    method: "PATCH",
    body: { collectionId },
  });
}

export function getRecipe(id: number): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}`);
}

export function createRecipe(input: RecipeInput): Promise<Recipe> {
  return apiFetch<Recipe>("/recipes", { method: "POST", body: input });
}

export function updateRecipe(id: number, input: RecipeInput): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}`, { method: "PUT", body: input });
}

export function deleteRecipe(id: number): Promise<void> {
  return apiFetch<void>(`/recipes/${id}`, { method: "DELETE" });
}

export async function uploadRecipeImage(recipeId: number, file: File): Promise<RecipeImage> {
  const formData = new FormData();
  formData.append("image", file);
  return apiFetch<RecipeImage>(`/recipes/${recipeId}/images`, { method: "POST", body: formData });
}

export function attachRecipeImageFromUrl(recipeId: number, url: string): Promise<RecipeImage> {
  return apiFetch<RecipeImage>(`/recipes/${recipeId}/images/from-url`, {
    method: "POST",
    body: { url },
  });
}

export function deleteRecipeImage(recipeId: number, imageId: number): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/images/${imageId}`, { method: "DELETE" });
}

export function recipeImageUrl(recipeId: number, imageId: number): string {
  return apiUrl(`/recipes/${recipeId}/images/${imageId}`);
}

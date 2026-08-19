import { apiFetch, apiUrl } from "./client";
import type { Recipe, RecipeImage, RecipeInput } from "./types";

export function listRecipes(): Promise<Recipe[]> {
  return apiFetch<Recipe[]>("/recipes");
}

export function searchRecipes(query: string): Promise<Recipe[]> {
  return apiFetch<Recipe[]>(`/recipes/search?q=${encodeURIComponent(query)}`);
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

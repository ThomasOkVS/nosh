import { apiFetch } from "./client";
import type { Collection, Recipe } from "./types";

export function listCollections(): Promise<Collection[]> {
  return apiFetch<Collection[]>("/collections");
}

export function createCollection(name: string): Promise<Collection> {
  return apiFetch<Collection>("/collections", { method: "POST", body: { name } });
}

export function renameCollection(id: number, name: string): Promise<Collection> {
  return apiFetch<Collection>(`/collections/${id}`, { method: "PUT", body: { name } });
}

export function deleteCollection(id: number): Promise<void> {
  return apiFetch<void>(`/collections/${id}`, { method: "DELETE" });
}

export function getCollectionRecipes(
  id: number,
): Promise<{ collection: Collection; recipes: Recipe[] }> {
  return apiFetch<{ collection: Collection; recipes: Recipe[] }>(`/collections/${id}/recipes`);
}

export function addRecipeToCollection(collectionId: number, recipeId: number): Promise<void> {
  return apiFetch<void>(`/collections/${collectionId}/recipes/${recipeId}`, { method: "POST" });
}

export function removeRecipeFromCollection(collectionId: number, recipeId: number): Promise<void> {
  return apiFetch<void>(`/collections/${collectionId}/recipes/${recipeId}`, { method: "DELETE" });
}

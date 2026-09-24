import { apiFetch } from "./client";
import type { Collection } from "./types";

export function listCollections(): Promise<Collection[]> {
  return apiFetch<Collection[]>("/collections");
}

export function createCollection(name: string, parentId: number | null): Promise<Collection> {
  return apiFetch<Collection>("/collections", { method: "POST", body: { name, parentId } });
}

/** Renames and/or reparents a collection in one call — see the backend's
 * `updateCollection` for why these are one "edit collection" action. */
export function updateCollection(
  id: number,
  name: string,
  parentId: number | null,
): Promise<Collection> {
  return apiFetch<Collection>(`/collections/${id}`, { method: "PUT", body: { name, parentId } });
}

export function deleteCollection(id: number): Promise<void> {
  return apiFetch<void>(`/collections/${id}`, { method: "DELETE" });
}

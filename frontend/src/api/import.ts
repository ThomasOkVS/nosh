import { apiFetch } from "./client";
import type { RecipeInput } from "./types";

/** Mirrors `ImportStage` in the backend's recipeExtraction service. */
export type ImportStage = "fetching" | "structured-data" | "downloading-video" | "analyzing-video" | "ai";

/**
 * A server-side import job (backend/src/repositories/importJobs.ts). The
 * extraction runs on the server independently of this tab, so the app can
 * be closed mid-import and pick the result back up later — the frontend
 * only ever starts a job and then polls it.
 */
export interface ImportJob {
  id: number;
  url: string;
  status: "running" | "done" | "error" | "cancelled";
  seenStages: ImportStage[];
  /** Extracted-but-unsaved recipe data for the create form to pre-fill;
   * set once `status` is "done". */
  recipe: RecipeInput | null;
  /** The recipe's photo, found on a best-effort basis — null when the page
   * (or video) had no discoverable image. */
  imageUrl: string | null;
  errorStatus: number | null;
  errorMessage: string | null;
  reviewed: boolean;
  createdAt: string;
}

export function startImport(url: string): Promise<ImportJob> {
  return apiFetch<ImportJob>("/import", { method: "POST", body: { url } });
}

export function getImport(id: number): Promise<ImportJob> {
  return apiFetch<ImportJob>(`/import/${id}`);
}

/** Running jobs plus finished ones not yet reviewed, newest first. */
export function listPendingImports(): Promise<ImportJob[]> {
  return apiFetch<ImportJob[]>("/import");
}

export function cancelImport(id: number): Promise<void> {
  return apiFetch<void>(`/import/${id}/cancel`, { method: "POST" });
}

/** Stops the app offering this result again on launch. */
export function markImportReviewed(id: number): Promise<void> {
  return apiFetch<void>(`/import/${id}/reviewed`, { method: "POST" });
}

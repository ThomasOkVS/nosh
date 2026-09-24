import { apiFetch } from "./client";

export interface MagicImportModel {
  id: string;
  /** Google's free-tier requests-per-day limit, as configured on the server —
   * null when unknown, so only usage (not "left") can be shown. */
  dailyRequestLimit: number | null;
  requestsToday: number;
  promptTokensToday: number;
  outputTokensToday: number;
}

export interface MagicImportSettings {
  /** False when the server has no Gemini API key at all. */
  aiConfigured: boolean;
  /** null = automatic: each import path uses its own default model. */
  selectedModel: string | null;
  defaultTextModel: string;
  defaultVideoModel: string;
  models: MagicImportModel[];
}

export function getMagicImportSettings(): Promise<MagicImportSettings> {
  return apiFetch<MagicImportSettings>("/settings/magic-import");
}

export function setMagicImportModel(model: string | null): Promise<MagicImportSettings> {
  return apiFetch<MagicImportSettings>("/settings/magic-import", {
    method: "PUT",
    body: { model },
  });
}

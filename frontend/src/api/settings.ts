import type { RecipeLanguage, UnitPreferences } from "@nosh/units";
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

/** How recipes are shown and imported: see @nosh/units for the options. */
export interface RecipePreferences extends UnitPreferences {
  /** Language imports are translated into; null = keep the original. */
  language: RecipeLanguage | null;
}

export function getRecipePreferences(): Promise<RecipePreferences> {
  return apiFetch<RecipePreferences>("/settings/recipe-preferences");
}

/** Saves just the fields given; returns the full, updated preferences. */
export function updateRecipePreferences(
  changes: Partial<RecipePreferences>,
): Promise<RecipePreferences> {
  return apiFetch<RecipePreferences>("/settings/recipe-preferences", {
    method: "PUT",
    body: changes,
  });
}

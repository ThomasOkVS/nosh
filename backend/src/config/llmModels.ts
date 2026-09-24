/** One model the user may pick for magic import. */
export interface LlmModelOption {
  id: string;
  /** Google's free-tier requests-per-day limit for this model, as configured
   * — null when unknown, in which case only usage (not "left") is shown.
   * Nosh can't read this from Google: the API has no quota endpoint. */
  dailyRequestLimit: number | null;
}

/** Everything the Settings page and the import route need to know about
 * which models exist and what "automatic" means for each import path. */
export interface MagicImportConfig {
  models: LlmModelOption[];
  defaultTextModel: string;
  defaultVideoModel: string;
}

/** A saved preference only applies while it's still on the allowlist — if
 * GEMINI_MODELS has since dropped it, the user falls back to automatic
 * rather than being stuck on a model the server no longer offers. */
export function resolveImportModel(
  config: MagicImportConfig,
  saved: string | null,
): string | undefined {
  return saved !== null && config.models.some((model) => model.id === saved) ? saved : undefined;
}

/** The free-tier daily request limits observed for the two default models
 * (see docs/decisions.md, 2026-08-12 — 20 vs. 500 was the deciding factor for
 * using Flash-Lite on video). Used when GEMINI_MODELS isn't set. */
export const DEFAULT_GEMINI_MODELS = "gemini-3.6-flash=20,gemini-3.5-flash-lite=500";

/** Only characters Google actually uses in model ids. The id ends up in the
 * request URL path, so this is also what stops a misconfigured value from
 * turning into a different endpoint. */
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

/**
 * Parses `GEMINI_MODELS` — a comma-separated list of `model-id=dailyLimit`
 * entries, where `=dailyLimit` is optional (e.g.
 * `gemini-3.6-flash=20,gemini-3.5-flash-lite=500,some-new-model`).
 *
 * The per-path default models are always included, even if the list forgets
 * them, so "automatic" can never point at a model the settings page doesn't
 * know about. Throws on a malformed entry rather than silently dropping it —
 * this runs once at boot, and failing loudly there beats a quietly missing
 * option in the UI.
 */
export function parseModelAllowlist(
  raw: string,
  requiredModels: readonly string[],
): LlmModelOption[] {
  const options: LlmModelOption[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [id = "", limitText] = trimmed.split("=").map((part) => part.trim());
    if (!MODEL_ID_PATTERN.test(id)) {
      throw new Error(`GEMINI_MODELS: invalid model id "${id}"`);
    }
    let dailyRequestLimit: number | null = null;
    if (limitText !== undefined) {
      dailyRequestLimit = Number(limitText);
      if (!Number.isInteger(dailyRequestLimit) || dailyRequestLimit <= 0) {
        throw new Error(`GEMINI_MODELS: invalid daily limit "${limitText}" for ${id}`);
      }
    }
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, dailyRequestLimit });
  }

  for (const id of requiredModels) {
    if (!seen.has(id)) {
      seen.add(id);
      options.push({ id, dailyRequestLimit: null });
    }
  }
  return options;
}

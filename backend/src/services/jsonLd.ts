import * as cheerio from "cheerio";
import type { RecipeInput } from "../validation/recipes";
import { deriveTags } from "./recipeTags";

type PartialRecipe = Partial<
  Pick<RecipeInput, "title" | "description" | "servings" | "prepTimeMinutes" | "cookTimeMinutes" | "ingredients" | "steps" | "tags">
> & {
  /** The recipe's photo, if schema.org published one. Not part of
   * `RecipeInput` — recipe images are a separate DB entity, only attachable
   * once the recipe itself has been saved — so this rides alongside the
   * persisted fields rather than becoming one of them. */
  imageUrl?: string;
};

/** schema.org allows a single value or an array of values for most Recipe fields. */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Matches just the "<n>D" date portion (the part of an ISO 8601 duration
// before a "T", if any) — e.g. the "0D" in "P0DT1H0M".
const DAY_PATTERN = /^(\d+)D$/;
// Matches the "T..." time portion on its own. Seconds are matched so they
// don't break the pattern ("PT1H30M15S" is common from real recipe
// plugins), then discarded as noise — this function only reports whole
// minutes.
const TIME_PATTERN = /^T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?$/;

/**
 * Splitting on "T" first, then matching the date and time halves with their
 * own small pattern, keeps each regex simple enough to read (and to statically
 * analyze) on its own — one combined pattern covering both halves needs a
 * day-group nested inside an optional time-group nested inside further
 * optional hour/minute/second groups.
 */
export function parseIsoDurationToMinutes(duration: unknown): number | null {
  if (typeof duration !== "string") return null;
  const trimmed = duration.trim();
  if (!trimmed.startsWith("P")) return null;

  const body = trimmed.slice(1);
  const splitAtT = body.indexOf("T");
  const datePart = splitAtT === -1 ? body : body.slice(0, splitAtT);
  const timePart = splitAtT === -1 ? "" : body.slice(splitAtT);

  let days = 0;
  if (datePart) {
    const dayMatch = DAY_PATTERN.exec(datePart);
    if (!dayMatch) return null;
    days = Number(dayMatch[1]);
  }

  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const timeMatch = TIME_PATTERN.exec(timePart);
    if (!timeMatch) return null;
    hours = Number(timeMatch[1] ?? 0);
    minutes = Number(timeMatch[2] ?? 0);
  }

  const total = days * 24 * 60 + hours * 60 + minutes;
  return total > 0 ? total : null;
}

function parseYieldToServings(recipeYield: unknown): number | null {
  const value = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  if (typeof value === "number") return Math.trunc(value) || null;
  if (typeof value === "string") {
    // "Serves 0" is a real thing pages publish; 0 would fail the schema's
    // positive-integer check and take the whole import down with it.
    const match = /\d+/.exec(value);
    return match && Number(match[0]) > 0 ? Number(match[0]) : null;
  }
  return null;
}

/** A schema.org HowToStep is `{ "@type": "HowToStep", "text": "..." }`; a
 * HowToSection nests further steps under `itemListElement`. Plain strings
 * are also valid recipeInstructions entries. */
function flattenInstructions(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.itemListElement) return flattenInstructions(obj.itemListElement);
    if (typeof obj.text === "string") return [obj.text];
    if (typeof obj.name === "string") return [obj.name];
  }
  return [];
}

/** schema.org's `image` is a string, an `ImageObject` ({ url: "..." }), or an
 * array of either — real-world markup uses all of these. Takes the first
 * usable candidate; picking among several isn't worth the complexity here. */
function toImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return null;
}

function extractImageUrl(node: Record<string, unknown>): string | null {
  for (const candidate of toArray<unknown>(node.image)) {
    const url = toImageUrl(candidate);
    if (url) return url;
  }
  return null;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

/** Recursively search a parsed JSON-LD document for a node whose `@type`
 * is `Recipe`, following the common `@graph` wrapping convention. */
function findRecipeNode(data: unknown): Record<string, unknown> | null {
  if (isRecipeNode(data)) return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (data && typeof data === "object" && "@graph" in data) {
    return findRecipeNode((data as Record<string, unknown>)["@graph"]);
  }
  return null;
}

function mapRecipeNode(node: Record<string, unknown>): PartialRecipe {
  const result: PartialRecipe = {};

  if (typeof node.name === "string" && node.name.trim()) {
    result.title = node.name.trim();
  }
  if (typeof node.description === "string" && node.description.trim()) {
    result.description = node.description.trim();
  }

  const imageUrl = extractImageUrl(node);
  if (imageUrl !== null) result.imageUrl = imageUrl;

  const servings = parseYieldToServings(node.recipeYield);
  if (servings !== null) result.servings = servings;

  const prep = parseIsoDurationToMinutes(node.prepTime);
  if (prep !== null) result.prepTimeMinutes = prep;

  const cook = parseIsoDurationToMinutes(node.cookTime);
  if (cook !== null) result.cookTimeMinutes = cook;

  const ingredientLines = toArray<unknown>(node.recipeIngredient ?? node.ingredients).filter(
    (line): line is string => typeof line === "string" && line.trim().length > 0,
  );
  if (ingredientLines.length > 0) {
    result.ingredients = ingredientLines.map((line) => ({
      quantity: null,
      unit: null,
      name: line.trim(),
    }));
  }

  const instructions = flattenInstructions(node.recipeInstructions).filter((line) => line.trim());
  if (instructions.length > 0) {
    result.steps = instructions.map((instruction) => ({ instruction: instruction.trim() }));
  }

  // Deliberately NOT node.keywords — see recipeTags.ts for why site keywords
  // are unusable as tags.
  const totalMinutes =
    parseIsoDurationToMinutes(node.totalTime) ??
    (prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null);
  const tags = deriveTags({
    suitableForDiet: node.suitableForDiet,
    nutrition: node.nutrition,
    recipeCategory: node.recipeCategory,
    totalMinutes,
  });
  if (tags.length > 0) {
    result.tags = tags;
  }

  return result;
}

/**
 * Looks for a schema.org `Recipe` in any `<script type="application/ld+json">`
 * block on the page. Real-world markup varies a lot (single object, array,
 * `@graph`-wrapped, malformed JSON) so this is deliberately forgiving: a
 * block that fails to parse is skipped rather than aborting the whole page.
 */
export function extractJsonLdRecipe(html: string): PartialRecipe | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (const el of scripts.toArray()) {
    const raw = $(el).text();
    if (!raw.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const node = findRecipeNode(parsed);
    if (node) {
      return mapRecipeNode(node);
    }
  }

  return null;
}

/**
 * A cheap, reliable fallback for the page's hero image when schema.org
 * didn't publish one (or wasn't used at all, i.e. the Gemini-fallback path)
 * — `og:image`/`twitter:image` meta tags are near-universal on recipe sites,
 * so this is preferred over asking the LLM to locate an image in page text.
 * `cheerio` is already a dependency for the JSON-LD parse above.
 */
export function extractMetaImageUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:image"]').attr("content")?.trim();
  if (og) return og;
  return $('meta[name="twitter:image"]').attr("content")?.trim() || null;
}

/** A JSON-LD result "counts" as usable only if it has enough to build on;
 * a bare title with no ingredients/steps isn't worth skipping the LLM for. */
export function isCompleteEnough(recipe: PartialRecipe | null): recipe is PartialRecipe {
  return (
    recipe !== null &&
    Boolean(recipe.title) &&
    (recipe.ingredients?.length ?? 0) > 0 &&
    (recipe.steps?.length ?? 0) > 0
  );
}

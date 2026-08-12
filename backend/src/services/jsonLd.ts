import * as cheerio from "cheerio";
import type { RecipeInput } from "../validation/recipes";
import { deriveTags } from "./recipeTags";

type PartialRecipe = Partial<
  Pick<RecipeInput, "title" | "description" | "servings" | "prepTimeMinutes" | "cookTimeMinutes" | "ingredients" | "steps" | "tags">
>;

/** schema.org allows a single value or an array of values for most Recipe fields. */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseIsoDurationToMinutes(duration: unknown): number | null {
  if (typeof duration !== "string") return null;
  // ISO 8601 duration. Real recipe plugins emit day prefixes ("P0DT1H0M")
  // and seconds ("PT1H30M15S") often enough that matching only hours and
  // minutes silently drops the time from those pages entirely. Seconds are
  // captured so they don't break the match, then ignored as noise.
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/.exec(
    duration.trim(),
  );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
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

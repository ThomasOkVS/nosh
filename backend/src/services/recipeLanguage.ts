import type { RecipeLanguage } from "@nosh/units";
import type { RecipeInput } from "../validation/recipes";

/**
 * Short, very common function words per language — the words a recipe
 * can't avoid, whatever it's about. Counting them is a cheap, dependency-free
 * way to tell Dutch from English text; it only needs to answer "is this
 * already in the target language?", not identify arbitrary languages.
 * Written space-separated so the lists stay scannable.
 */
const STOPWORDS: Record<RecipeLanguage, ReadonlySet<string>> = {
  nl: new Set(
    (
      "de het een en met van op tot voor je aan bij dan ze er uit naar minuten snijd voeg laat " +
      "doe meng roer zout peper ui boter"
    ).split(" "),
  ),
  en: new Set(
    (
      "the and with of into until add for to a an on it then from minutes stir mix cook salt " +
      "pepper onion butter your"
    ).split(" "),
  ),
};

/** At least this many stopword hits before trusting any verdict. */
const MIN_HITS = 8;
/** The winner needs this many times the runner-up's hits. */
const MIN_RATIO = 2;

function recipeWords(recipe: RecipeInput): string[] {
  const text = [
    recipe.title,
    recipe.description ?? "",
    ...recipe.ingredients.map((ingredient) => ingredient.name),
    ...recipe.steps.map((step) => step.instruction),
  ].join(" ");
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/** "nl"/"en" when the text is clearly one of them, null when it's too
 * short, mixed, or neither to tell. */
export function detectRecipeLanguage(recipe: RecipeInput): RecipeLanguage | null {
  const hits: Record<RecipeLanguage, number> = { nl: 0, en: 0 };
  for (const word of recipeWords(recipe)) {
    if (STOPWORDS.nl.has(word)) hits.nl++;
    if (STOPWORDS.en.has(word)) hits.en++;
  }
  const winner: RecipeLanguage = hits.nl >= hits.en ? "nl" : "en";
  const loser: RecipeLanguage = winner === "nl" ? "en" : "nl";
  if (hits[winner] < MIN_HITS || hits[winner] < hits[loser] * MIN_RATIO) return null;
  return winner;
}

/** Uncertain counts as "needs translating": a wasted call is cheaper than
 * leaving a recipe in the wrong language. */
export function needsTranslation(recipe: RecipeInput, target: RecipeLanguage): boolean {
  return detectRecipeLanguage(recipe) !== target;
}

/**
 * Tags are restricted to a small fixed vocabulary of *attributes* — dietary
 * suitability, nutrition profile, effort, meal type — rather than whatever
 * free-text keywords a site happens to publish.
 *
 * Sites' schema.org `keywords` are written for SEO, not for browsing: they're
 * full of author names, dish restatements ("Beef Lasagne" on a lasagne
 * recipe), and campaign labels. Those make useless filters. This vocabulary
 * is modelled on how meal-kit services (HelloFresh et al.) tag meals, so
 * tags stay comparable across recipes from different sources.
 */
export const TAG_VOCABULARY = [
  // dietary
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten free",
  "dairy free",
  "nut free",
  "halal",
  "kosher",
  // nutrition profile
  "high protein",
  "low calorie",
  "low carb",
  "low fat",
  "low sodium",
  // effort
  "quick",
  "one pot",
  // meal type
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "side",
] as const;

const VOCABULARY = new Set<string>(TAG_VOCABULARY);

/** schema.org `suitableForDiet` values (RestrictedDiet enum) → our vocabulary.
 * Diets with no clean equivalent (DiabeticDiet, HinduDiet) are dropped rather
 * than approximated. */
const DIET_TAGS: Record<string, string> = {
  glutenfreediet: "gluten free",
  lowcaloriediet: "low calorie",
  lowfatdiet: "low fat",
  lowlactosediet: "dairy free",
  lowsaltdiet: "low sodium",
  vegandiet: "vegan",
  vegetariandiet: "vegetarian",
  halaldiet: "halal",
  kosherdiet: "kosher",
};

/** Per-serving thresholds. Deliberately conservative — a tag that's sometimes
 * wrong is worse than a missing one the user can add themselves. */
const LOW_CALORIE_MAX = 500;
const HIGH_PROTEIN_MIN = 25;
const LOW_CARB_MAX = 25;
const LOW_FAT_MAX = 10;
const QUICK_MAX_MINUTES = 30;

/** Nutrition values are free text like "389 calories" or "27 g". */
function parseLeadingNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /\d+(?:[.,]\d+)?/.exec(value);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function dietTags(suitableForDiet: unknown): string[] {
  const values = Array.isArray(suitableForDiet) ? suitableForDiet : [suitableForDiet];
  return values.flatMap((value) => {
    // Either a bare string or `{ "@id": "https://schema.org/VeganDiet" }`.
    const raw =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "@id" in value
          ? String((value as Record<string, unknown>)["@id"])
          : "";
    const key = raw.split("/").pop()?.toLowerCase() ?? "";
    const tag = DIET_TAGS[key];
    return tag ? [tag] : [];
  });
}

function nutritionTags(nutrition: unknown): string[] {
  if (!nutrition || typeof nutrition !== "object") return [];
  const n = nutrition as Record<string, unknown>;
  const tags: string[] = [];

  const calories = parseLeadingNumber(n.calories);
  if (calories !== null && calories > 0 && calories <= LOW_CALORIE_MAX) tags.push("low calorie");

  const protein = parseLeadingNumber(n.proteinContent);
  if (protein !== null && protein >= HIGH_PROTEIN_MIN) tags.push("high protein");

  const carbs = parseLeadingNumber(n.carbohydrateContent);
  if (carbs !== null && carbs > 0 && carbs <= LOW_CARB_MAX) tags.push("low carb");

  const fat = parseLeadingNumber(n.fatContent);
  if (fat !== null && fat > 0 && fat <= LOW_FAT_MAX) tags.push("low fat");

  return tags;
}

function mealTypeTags(recipeCategory: unknown): string[] {
  const values = Array.isArray(recipeCategory) ? recipeCategory : [recipeCategory];
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const lower = value.trim().toLowerCase();
    // Only exact vocabulary hits — "Main Course" or "Weeknight Dinners"
    // shouldn't smuggle arbitrary category text through.
    if (lower === "main" || lower === "main course" || lower === "main dish") return ["dinner"];
    if (lower === "side dish") return ["side"];
    if (lower === "appetizer" || lower === "starter") return ["snack"];
    return VOCABULARY.has(lower) ? [lower] : [];
  });
}

interface TagSources {
  suitableForDiet?: unknown;
  nutrition?: unknown;
  recipeCategory?: unknown;
  totalMinutes?: number | null;
}

/**
 * Derives vocabulary tags from a recipe's structured data. Returns few or no
 * tags when a page publishes little — better than filling the field with the
 * site's SEO keywords, since the user reviews and can add their own.
 */
export function deriveTags(sources: TagSources): string[] {
  const tags = [
    ...dietTags(sources.suitableForDiet),
    ...nutritionTags(sources.nutrition),
    ...mealTypeTags(sources.recipeCategory),
  ];

  if (sources.totalMinutes !== null && sources.totalMinutes !== undefined) {
    if (sources.totalMinutes > 0 && sources.totalMinutes <= QUICK_MAX_MINUTES) {
      tags.push("quick");
    }
  }

  return [...new Set(tags)];
}

/**
 * Tags implied by another tag, and therefore not worth showing alongside it:
 * everything vegan is also vegetarian and pescatarian-compatible, so listing
 * all three says nothing extra. Models reliably tag everything technically
 * true, so this is pruned here rather than left to the prompt.
 */
const IMPLIED_BY: Record<string, string[]> = {
  vegan: ["vegetarian", "pescatarian"],
  vegetarian: ["pescatarian"],
};

/** A recipe described by a dozen attributes isn't described at all — past a
 * handful, tags stop being a useful way to tell recipes apart. */
const MAX_TAGS = 5;

/**
 * Drops anything outside the vocabulary, removes tags implied by a stronger
 * one, and caps the count. The LLM is asked to stay within the vocabulary and
 * be selective, but neither can be enforced by the response schema.
 */
export function filterToVocabulary(tags: string[]): string[] {
  const kept = [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => VOCABULARY.has(tag))),
  ];
  const implied = new Set(kept.flatMap((tag) => IMPLIED_BY[tag] ?? []));
  return kept.filter((tag) => !implied.has(tag)).slice(0, MAX_TAGS);
}

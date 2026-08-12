import type { RecipeInput } from "../validation/recipes";

type Ingredient = RecipeInput["ingredients"][number];

/**
 * Ordered most-specific-first — "1 1/2 cups" must match the mixed-number
 * pattern before the plain-number one grabs just the "1".
 *
 * Written as literals (rather than composed from a shared number fragment)
 * so they're statically checkable, and using an optional single space rather
 * than `\s*`: `parseIngredientLine` collapses runs of whitespace before
 * matching, so one space is all that can occur — and avoiding the unbounded
 * quantifier keeps matching linear instead of backtracking.
 */
const QUANTITY_PATTERNS = [
  // "2 x 400g", common in UK recipe sites for multi-pack quantities
  /^(\d+(?:[.,]\d+)? ?[x×] ?\d+(?:[.,]\d+)?)/,
  // mixed numbers: "1 1/2", "1 ½"
  /^(\d+ \d+\/\d+)/,
  /^(\d+ ?[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
  // ranges: "2-3", "2 to 3"
  /^(\d+(?:[.,]\d+)? ?(?:[-–—]|to) ?\d+(?:[.,]\d+)?)/,
  /^(\d+\/\d+)/,
  /^([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
  /^(\d+(?:[.,]\d+)?)/,
];

/**
 * Words treated as a measurement unit when they directly follow a quantity.
 * Deliberately excludes size adjectives ("medium", "large", "small") — in
 * "2 medium sweet potatoes" the unit is genuinely absent, and calling
 * "medium" a unit would be worse than leaving it in the name.
 *
 * Singular forms only; `matchUnit` handles plurals.
 */
const UNITS = new Set([
  // metric
  "g", "gr", "gram", "kg", "kilo", "kilogram", "mg",
  "ml", "cl", "dl", "l", "liter", "litre",
  // imperial / US
  "oz", "ounce", "lb", "pound", "fl oz", "floz",
  "tsp", "teaspoon", "tbsp", "tablespoon", "cup",
  "pint", "quart", "gallon",
  // countable containers & natural units
  "can", "tin", "jar", "packet", "pack", "package", "box", "bag", "bottle",
  "clove", "stick", "stalk", "sprig", "bunch", "head", "rasher", "slice",
  "piece", "sheet", "ball", "knob", "strip", "fillet", "rib", "ear",
  "pinch", "dash", "drop", "handful", "splash", "scoop", "square",
]);

function matchUnit(rawToken: string): string | null {
  const token = rawToken.replace(/[.,;:]+$/, "");
  const lower = token.toLowerCase();
  if (!lower) return null;
  if (UNITS.has(lower)) return token;
  if (lower.endsWith("es") && UNITS.has(lower.slice(0, -2))) return token;
  if (lower.endsWith("s") && UNITS.has(lower.slice(0, -1))) return token;
  return null;
}

/**
 * Splits a free-text recipe ingredient line into quantity/unit/name.
 *
 * schema.org's `recipeIngredient` is a flat array of strings like
 * "2 cloves garlic (finely minced)", so without this every imported
 * ingredient would land entirely in `name` with empty Qty/Unit columns.
 *
 * Conservative by design: anything it can't confidently split stays in
 * `name`, since a wrong split is harder for the user to spot and fix than
 * an unsplit line.
 */
export function parseIngredientLine(line: string): Ingredient {
  const trimmed = line.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { quantity: null, unit: null, name: line.trim() };
  }

  let quantity: string | null = null;
  let rest = trimmed;

  for (const pattern of QUANTITY_PATTERNS) {
    const match = pattern.exec(rest);
    if (match?.[1]) {
      quantity = match[1].trim();
      rest = rest.slice(match[0].length).trim();
      break;
    }
  }

  let unit: string | null = null;
  if (quantity !== null && rest) {
    const tokens = rest.split(" ");
    // "fl oz" is the one unit in the list that's two words.
    if (tokens.length >= 2 && tokens[0]?.toLowerCase() === "fl" && matchUnit(tokens[1]!)) {
      unit = `fl ${tokens[1]!.replace(/[.,;:]+$/, "")}`;
      rest = tokens.slice(2).join(" ");
    } else {
      const matched = matchUnit(tokens[0]!);
      if (matched) {
        unit = matched;
        rest = tokens.slice(1).join(" ");
      }
    }
  }

  const name = rest.trim();
  // Nothing but a quantity/unit and no actual ingredient left — the line
  // wasn't what we assumed, so hand it back untouched.
  if (!name) {
    return { quantity: null, unit: null, name: trimmed };
  }

  return { quantity, unit, name };
}

/**
 * Splits any ingredient that arrived as a single unparsed string. Applied to
 * both extraction paths: JSON-LD always produces whole lines, and the LLM
 * sometimes returns them that way despite being asked to split. Ingredients
 * that already carry a quantity or unit are left exactly as they are.
 */
export function normalizeIngredients(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.map((ingredient) =>
    ingredient.quantity === null && ingredient.unit === null
      ? parseIngredientLine(ingredient.name)
      : ingredient,
  );
}

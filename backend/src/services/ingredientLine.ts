import type { RecipeInput } from "../validation/recipes";

type Ingredient = RecipeInput["ingredients"][number];

type QuantityMatcher = (rest: string) => string | null;

function fromPattern(pattern: RegExp): QuantityMatcher {
  return (rest) => pattern.exec(rest)?.[1] ?? null;
}

/** A plain integer or decimal ("2", "2.5", "2,5"), matched in two steps —
 * the whole-number part, then an optional ".5"/",5" decimal part — rather
 * than one regex with two quantified digit runs back to back
 * (`/^\d+(?:[.,]\d+)?/`), which static analyzers flag as backtracking-prone
 * even though this particular shape can't actually blow up. Same reasoning
 * as matchNumberPair/matchFraction below: split into single-`\d+` regexes
 * composed by hand instead of one compound pattern. */
function matchNumber(rest: string): string | null {
  const whole = /^\d+/.exec(rest);
  if (!whole) return null;
  const decimal = /^[.,]\d+/.exec(rest.slice(whole[0].length));
  return decimal ? whole[0] + decimal[0] : whole[0];
}

/** A plain fraction ("1/2"), as two single-digit-run matches either side of
 * a literal "/" — see matchNumber above for why not one `\d+\/\d+` regex. */
function matchFraction(rest: string): string | null {
  const numerator = /^\d+/.exec(rest);
  if (!numerator) return null;
  const afterNumerator = rest.slice(numerator[0].length);
  if (!afterNumerator.startsWith("/")) return null;
  const denominator = /^\d+/.exec(afterNumerator.slice(1));
  return denominator ? `${numerator[0]}/${denominator[0]}` : null;
}

/** A mixed number ("1 1/2") — a whole number, a single space, then a
 * fraction, reusing matchNumber/matchFraction rather than one regex with
 * three quantified digit runs. */
function matchMixedNumber(rest: string): string | null {
  const whole = /^\d+ /.exec(rest);
  if (!whole) return null;
  const fraction = matchFraction(rest.slice(whole[0].length));
  return fraction ? whole[0] + fraction : null;
}

/**
 * Matches "<number> <separator> <number>" (a multi-pack like "2 x 400g", or
 * a range like "2-3"/"2 to 3") by finding each half with `matchNumber`
 * and the separator with its own tiny pattern, rather than one regex with a
 * decimal-number group duplicated on both sides of the separator — fewer
 * quantified groups for a human (or a linter) to reason about at once, same
 * matched result.
 */
function matchNumberPair(separator: RegExp): QuantityMatcher {
  return (rest) => {
    const first = matchNumber(rest);
    if (!first) return null;
    const afterFirst = rest.slice(first.length);
    const sep = separator.exec(afterFirst);
    if (!sep) return null;
    const afterSep = afterFirst.slice(sep[0].length);
    const second = matchNumber(afterSep);
    if (!second) return null;
    return rest.slice(0, first.length + sep[0].length + second.length);
  };
}

/**
 * Ordered most-specific-first — "1 1/2 cups" must match the mixed-number
 * matcher before the plain-number one grabs just the "1". Using an optional
 * single space rather than `\s*` throughout: `parseIngredientLine` collapses
 * runs of whitespace before matching, so one space is all that can occur.
 */
const QUANTITY_MATCHERS: QuantityMatcher[] = [
  // "2 x 400g", common in UK recipe sites for multi-pack quantities
  matchNumberPair(/^ ?[x×] ?/),
  // mixed numbers: "1 1/2", "1 ½"
  matchMixedNumber,
  fromPattern(/^(\d+ ?[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/),
  // ranges: "2-3", "2 to 3"
  matchNumberPair(/^ ?(?:[-–—]|to) ?/),
  matchFraction,
  fromPattern(/^([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/),
  matchNumber,
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

  for (const matcher of QUANTITY_MATCHERS) {
    const matched = matcher(rest);
    if (matched) {
      quantity = matched.trim();
      rest = rest.slice(matched.length).trim();
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

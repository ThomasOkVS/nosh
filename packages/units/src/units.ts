import type { RecipeLanguage } from "./preferences";

export type Dimension = "mass" | "volume";

export type UnitId =
  | "mg"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  | "ml"
  | "cl"
  | "dl"
  | "l"
  | "tsp"
  | "tbsp"
  | "floz"
  | "cup"
  | "pint"
  | "quart"
  | "gallon";

interface UnitDefinition {
  dimension: Dimension;
  /** How many base units (grams for mass, millilitres for volume) one of
   * this unit is. Exact definitions, not rounded — rounding only ever
   * happens once, when a number is formatted for display. */
  toBase: number;
  /** Label used when conversion or tidying *switches* to this unit (a unit
   * the recipe already used keeps the author's own spelling). */
  label: Record<RecipeLanguage, { one: string; many: string }>;
  /** Every spelling recognised for this unit, lowercase, singular and
   * irregular plurals both — regular "-s"/"-es" plurals are handled by
   * `normalizeUnitWord`. English and Dutch, because imports can be
   * translated to Dutch before their units are converted. */
  aliases: string[];
}

function same(one: string, many = one) {
  return { en: { one, many }, nl: { one, many } };
}

// US customary definitions (NIST): 1 US cup = 236.5882365 ml, 1 lb =
// 453.59237 g exactly. "cup"/"pint"/"quart"/"gallon" are always the US
// measures — see docs/decisions.md#unit-semantics.
const TSP_ML = 4.92892159375;

export const UNIT_DEFINITIONS: Record<UnitId, UnitDefinition> = {
  mg: {
    dimension: "mass",
    toBase: 0.001,
    label: same("mg"),
    aliases: ["mg", "milligram", "milligramme"],
  },
  g: {
    dimension: "mass",
    toBase: 1,
    label: same("g"),
    aliases: ["g", "gr", "gram", "gramme", "grammen"],
  },
  kg: {
    dimension: "mass",
    toBase: 1000,
    label: same("kg"),
    aliases: ["kg", "kilo", "kilogram", "kilogramme"],
  },
  oz: {
    dimension: "mass",
    toBase: 28.349523125,
    label: same("oz"),
    aliases: ["oz", "ounce"],
  },
  lb: {
    dimension: "mass",
    toBase: 453.59237,
    label: same("lb"),
    aliases: ["lb", "lbs", "pound"],
  },
  ml: {
    dimension: "volume",
    toBase: 1,
    label: same("ml"),
    aliases: ["ml", "milliliter", "millilitre"],
  },
  cl: {
    dimension: "volume",
    toBase: 10,
    label: same("cl"),
    aliases: ["cl", "centiliter", "centilitre"],
  },
  dl: {
    dimension: "volume",
    toBase: 100,
    label: same("dl"),
    aliases: ["dl", "deciliter", "decilitre"],
  },
  l: {
    dimension: "volume",
    toBase: 1000,
    label: same("l"),
    aliases: ["l", "liter", "litre"],
  },
  tsp: {
    dimension: "volume",
    toBase: TSP_ML,
    label: { en: { one: "tsp", many: "tsp" }, nl: { one: "tl", many: "tl" } },
    aliases: ["tsp", "teaspoon", "tl", "theelepel"],
  },
  tbsp: {
    dimension: "volume",
    toBase: TSP_ML * 3,
    label: { en: { one: "tbsp", many: "tbsp" }, nl: { one: "el", many: "el" } },
    aliases: ["tbsp", "tbs", "tablespoon", "el", "eetlepel"],
  },
  floz: {
    dimension: "volume",
    toBase: TSP_ML * 6,
    label: same("fl oz"),
    aliases: ["fl oz", "floz", "fl. oz"],
  },
  cup: {
    dimension: "volume",
    toBase: TSP_ML * 48,
    label: {
      en: { one: "cup", many: "cups" },
      nl: { one: "cup", many: "cups" },
    },
    aliases: ["cup"],
  },
  pint: {
    dimension: "volume",
    toBase: TSP_ML * 96,
    label: {
      en: { one: "pint", many: "pints" },
      nl: { one: "pint", many: "pints" },
    },
    aliases: ["pint"],
  },
  quart: {
    dimension: "volume",
    toBase: TSP_ML * 192,
    label: {
      en: { one: "quart", many: "quarts" },
      nl: { one: "quart", many: "quarts" },
    },
    aliases: ["quart"],
  },
  gallon: {
    dimension: "volume",
    toBase: TSP_ML * 768,
    label: {
      en: { one: "gallon", many: "gallons" },
      nl: { one: "gallon", many: "gallons" },
    },
    aliases: ["gallon"],
  },
};

const ALIAS_TO_ID = new Map<string, UnitId>();
for (const [id, definition] of Object.entries(UNIT_DEFINITIONS) as [UnitId, UnitDefinition][]) {
  for (const alias of definition.aliases) ALIAS_TO_ID.set(alias, id);
}

/**
 * Countable/natural units: recognised as "a unit" (so the ingredient-line
 * parser splits them off the name, and scaling knows the number in front
 * is a count), but never converted — there's no sensible metric equivalent
 * of a clove. Dutch forms included for the same reason as the aliases
 * above. Irregular plurals are listed explicitly.
 */
const COUNT_UNIT_WORDS = [
  // English
  "can",
  "tin",
  "jar",
  "packet",
  "pack",
  "package",
  "box",
  "bag",
  "bottle",
  "clove",
  "stick",
  "stalk",
  "sprig",
  "bunch",
  "head",
  "rasher",
  "slice",
  "piece",
  "sheet",
  "ball",
  "knob",
  "strip",
  "fillet",
  "rib",
  "ear",
  "pinch",
  "dash",
  "drop",
  "handful",
  "splash",
  "scoop",
  "square",
  // Dutch ("kopje" is here, not under cup: a Dutch kopje isn't a US cup)
  "blik",
  "blikje",
  "blikken",
  "teen",
  "teentje",
  "tenen",
  "snufje",
  "snuf",
  "takje",
  "bosje",
  "stuk",
  "stuks",
  "plak",
  "plakje",
  "plakken",
  "zakje",
  "pak",
  "potje",
  "scheutje",
  "kopje",
  "handvol",
  "mespunt",
  "snee",
  "sneetje",
];

/**
 * Every word the ingredient-line parser should treat as a unit when it
 * follows a quantity: measurable units (all aliases) plus count units.
 * Singular forms (and irregular plurals) only — callers strip regular
 * plurals themselves, as `normalizeUnitWord` does.
 */
export const UNIT_WORDS: ReadonlySet<string> = new Set([
  ...ALIAS_TO_ID.keys(),
  ...COUNT_UNIT_WORDS,
]);

/** Lowercases, trims trailing punctuation and collapses whitespace, then
 * strips a regular plural ("cups", "boxes", "eetlepels") if the singular is
 * a known word. Returns the word to look up. */
export function normalizeUnitWord(raw: string): string {
  const word = raw
    .trim()
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (UNIT_WORDS.has(word)) return word;
  if (word.endsWith("es") && UNIT_WORDS.has(word.slice(0, -2))) return word.slice(0, -2);
  if (word.endsWith("s") && UNIT_WORDS.has(word.slice(0, -1))) return word.slice(0, -1);
  return word;
}

/** The measurable unit a free-text unit string refers to, or null for a
 * count unit, an unknown word, or no unit at all. */
export function lookupUnit(raw: string | null): UnitId | null {
  if (!raw) return null;
  return ALIAS_TO_ID.get(normalizeUnitWord(raw)) ?? null;
}

export function unitDimension(id: UnitId): Dimension {
  return UNIT_DEFINITIONS[id].dimension;
}

export function toBase(value: number, id: UnitId): number {
  return value * UNIT_DEFINITIONS[id].toBase;
}

export function fromBase(base: number, id: UnitId): number {
  return base / UNIT_DEFINITIONS[id].toBase;
}

export function unitLabel(id: UnitId, value: number, language: RecipeLanguage): string {
  const label = UNIT_DEFINITIONS[id].label[language];
  return value === 1 ? label.one : label.many;
}

/** Units of one dimension, for pickers like "I have [__] [unit ▾]". */
export function unitsOfDimension(dimension: Dimension): UnitId[] {
  return (Object.keys(UNIT_DEFINITIONS) as UnitId[]).filter(
    (id) => UNIT_DEFINITIONS[id].dimension === dimension,
  );
}

import { formatQuantity } from "./format";
import type { RecipeLanguage, UnitPreferences } from "./preferences";
import { parseQuantity, type Quantity } from "./quantity";
import { fromBase, lookupUnit, toBase, unitDimension, unitLabel, type UnitId } from "./units";

/** The amount-carrying part of an ingredient — structurally compatible with
 * both the frontend's and the backend's ingredient types. */
export interface IngredientAmount {
  quantity: string | null;
  unit: string | null;
  name: string;
}

export interface ConvertOptions extends UnitPreferences {
  /** Multiplier applied before converting (recipe scaling). Default 1. */
  factor?: number;
  /** Language for a unit label that conversion *introduces* ("el" vs
   * "tbsp"). Units the recipe already used keep their own spelling.
   * Default "en". */
  language?: RecipeLanguage | null;
}

// Floating-point slack for "is this >= 1" / "is this a whole quarter":
// 3 tsp is 1.0000000000000002 tbsp in binary floating point.
const EPSILON = 1e-9;

function isQuarterExact(value: number): boolean {
  return Math.abs(value * 4 - Math.round(value * 4)) < EPSILON;
}

/** The units a converted amount may be expressed in, smallest first. */
function ladderFor(source: UnitId, base: number, options: UnitPreferences): UnitId[] {
  if (unitDimension(source) === "mass") {
    return options.unitSystem === "metric" ? ["mg", "g", "kg"] : ["oz", "lb"];
  }
  if (options.unitSystem === "us") {
    // fl oz only ever appears if the author wrote it; otherwise US volumes
    // read as spoons and cups.
    return source === "floz" ? ["floz"] : ["tsp", "tbsp", "cup"];
  }
  const isSpoon = source === "tsp" || source === "tbsp";
  // Past a cup's worth, counting spoons stops being practical even when
  // the user prefers to keep them.
  if (options.keepSpoons && isSpoon && base < toBase(16, "tbsp") - EPSILON) return ["tsp", "tbsp"];
  return ["ml", "l"];
}

/**
 * Picks the unit to show `base` (grams or millilitres) in: the "auto-tidy"
 * rule, see docs/decisions.md.
 * - Converting into a unit system: the largest unit whose value is >= 1
 *   (1500 g -> 1.5 kg, 250 ml -> 250 ml).
 * - Already in that system: keep the author's unit, but move *up* when that
 *   lands on a whole quarter (48 tsp -> 1 cup, 3 tsp -> 1 tbsp, while 4 tsp
 *   stays 4 tsp rather than 1.33 tbsp), and *down* only once the amount
 *   drops below a quarter (1/8 cup -> 2 tbsp).
 */
function chooseUnit(source: UnitId, base: number, options: UnitPreferences): UnitId {
  const ladder = ladderFor(source, base, options);
  const values = ladder.map((unit) => fromBase(base, unit));
  let largestAtLeastOne = 0;
  values.forEach((value, index) => {
    if (value >= 1 - EPSILON) largestAtLeastOne = index;
  });

  const sourceIndex = ladder.indexOf(source);
  if (sourceIndex === -1) return ladder[largestAtLeastOne]!;

  if (largestAtLeastOne > sourceIndex) {
    for (let index = largestAtLeastOne; index > sourceIndex; index--) {
      if (isQuarterExact(values[index]!)) return ladder[index]!;
    }
    return source;
  }
  if (largestAtLeastOne < sourceIndex && values[sourceIndex]! < 0.25 - EPSILON) {
    return ladder[largestAtLeastOne]!;
  }
  return source;
}

function scale(quantity: Quantity, factor: number): Quantity {
  switch (quantity.kind) {
    case "single":
      return { kind: "single", value: quantity.value * factor };
    case "range":
      return {
        kind: "range",
        min: quantity.min * factor,
        max: quantity.max * factor,
      };
    case "multipack":
      // Two 400 g tins scale to three 400 g tins, not two 600 g ones.
      return {
        kind: "multipack",
        count: quantity.count * factor,
        size: quantity.size,
      };
  }
}

/** The number that decides which unit to use: the per-pack size for a
 * multipack, the low end for a range. */
function measuredValue(quantity: Quantity): number {
  switch (quantity.kind) {
    case "single":
      return quantity.value;
    case "range":
      return quantity.min;
    case "multipack":
      return quantity.size;
  }
}

function mapMeasured(quantity: Quantity, convert: (value: number) => number): Quantity {
  switch (quantity.kind) {
    case "single":
      return { kind: "single", value: convert(quantity.value) };
    case "range":
      return {
        kind: "range",
        min: convert(quantity.min),
        max: convert(quantity.max),
      };
    case "multipack":
      return { ...quantity, size: convert(quantity.size) };
  }
}

function formatQuantityValue(quantity: Quantity): string {
  switch (quantity.kind) {
    case "single":
      return formatQuantity(quantity.value);
    case "range":
      return `${formatQuantity(quantity.min)}-${formatQuantity(quantity.max)}`;
    case "multipack":
      return `${formatQuantity(quantity.count)} x ${formatQuantity(quantity.size)}`;
  }
}

/**
 * Scales an ingredient by `factor` and converts it to the user's unit
 * system, returning a copy with new `quantity`/`unit` text. Anything it
 * can't evaluate (no quantity, "a pinch", an unknown format) comes back
 * unchanged, never guessed at.
 */
export function convertIngredient<T extends IngredientAmount>(
  ingredient: T,
  options: ConvertOptions,
): T {
  const parsed = parseQuantity(ingredient.quantity);
  if (!parsed) return ingredient;

  const scaled = scale(parsed, options.factor ?? 1);
  const source = lookupUnit(ingredient.unit);
  if (!source) {
    // A count ("2 eggs", "3 cloves"): scale it, nothing to convert.
    return { ...ingredient, quantity: formatQuantityValue(scaled) };
  }

  const target = chooseUnit(source, toBase(measuredValue(scaled), source), options);
  if (target === source) return { ...ingredient, quantity: formatQuantityValue(scaled) };

  const converted = mapMeasured(scaled, (value) => fromBase(toBase(value, source), target));
  const labelValue = converted.kind === "single" ? Number(formatQuantity(converted.value)) : 2;
  return {
    ...ingredient,
    quantity: formatQuantityValue(converted),
    unit: unitLabel(target, labelValue, options.language ?? "en"),
  };
}

/** Whether an ingredient can be the anchor for "I have ___": a single,
 * positive, evaluable amount (not a range, multipack, or "to taste"). */
export function canAnchor(ingredient: IngredientAmount): boolean {
  const parsed = parseQuantity(ingredient.quantity);
  return parsed?.kind === "single" && parsed.value > 0;
}

/**
 * The scale factor that turns `ingredient` (as stored in the recipe) into
 * `amount` of `unit`: "the recipe says 150 g, I have 200 g" gives 1.333...
 * Measured against the stored amount, not the rounded displayed one, so
 * the factor stays exact. `unit` must be the same dimension as the
 * ingredient's (no volume/weight conversion); pass null for a count
 * ingredient, or to mean "in the ingredient's own unit". Returns null when
 * it can't apply.
 */
export function anchorFactor(
  ingredient: IngredientAmount,
  amount: number,
  unit: UnitId | null,
): number | null {
  const parsed = parseQuantity(ingredient.quantity);
  if (parsed?.kind !== "single" || parsed.value <= 0 || !(amount > 0)) return null;

  const source = lookupUnit(ingredient.unit);
  if (!source || !unit) return amount / parsed.value;
  if (unitDimension(source) !== unitDimension(unit)) return null;
  return toBase(amount, unit) / toBase(parsed.value, source);
}

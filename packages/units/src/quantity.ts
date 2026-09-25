/**
 * A free-text ingredient quantity, evaluated to numbers. Ingredient
 * quantities are stored as text ("1 1/2", "½", "2-3", "2 x 400"); this is
 * the one place that turns them into something you can do arithmetic on.
 */
export type Quantity =
  | { kind: "single"; value: number }
  | { kind: "range"; min: number; max: number }
  /** "2 x 400" (g): `count` packs of `size` each. */
  | { kind: "multipack"; count: number; size: number };

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅐": 1 / 7,
  "⅑": 1 / 9,
  "⅒": 1 / 10,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

/**
 * One number: "2", "2.5", "2,5", "1/2", "½", "1 1/2", "1 ½", "1½".
 * Same approach as backend/src/services/ingredientLine.ts: single-`\d+`
 * regexes composed by hand rather than one compound pattern with several
 * quantified groups (which static analyzers flag as backtracking-prone).
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const lastChar = text.slice(-1);
  const unicode = UNICODE_FRACTIONS[lastChar];
  if (unicode !== undefined) {
    const whole = text.slice(0, -1).trim();
    if (!whole) return unicode;
    return /^\d+$/.test(whole) ? Number(whole) + unicode : null;
  }

  const parts = text.split(" ");
  if (parts.length === 2) {
    const [whole, fraction] = parts as [string, string];
    if (!/^\d+$/.test(whole) || !fraction.includes("/")) return null;
    const value = parseFraction(fraction);
    return value === null ? null : Number(whole) + value;
  }
  if (parts.length !== 1) return null;

  if (text.includes("/")) return parseFraction(text);

  const whole = /^\d+/.exec(text);
  if (!whole) return null;
  const rest = text.slice(whole[0].length);
  if (!rest) return Number(whole[0]);
  const decimal = /^[.,]\d+$/.exec(rest);
  return decimal ? Number(`${whole[0]}.${decimal[0].slice(1)}`) : null;
}

function parseFraction(text: string): number | null {
  const [numerator, denominator, ...extra] = text.split("/");
  if (extra.length || !numerator || !denominator) return null;
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator)) return null;
  const divisor = Number(denominator);
  return divisor === 0 ? null : Number(numerator) / divisor;
}

/** Splits "a <sep> b" on the first separator matching one of `separators`. */
function splitPair(text: string, separators: RegExp): [string, string] | null {
  const match = separators.exec(text);
  if (!match || match.index === 0) return null;
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

/** Evaluates a stored quantity string, or null if it isn't one we
 * understand (in which case it's shown exactly as written and never
 * scaled). */
export function parseQuantity(raw: string | null): Quantity | null {
  if (raw === null) return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;

  const multipack = splitPair(text, / ?[x×] ?/);
  if (multipack) {
    const count = parseNumber(multipack[0]);
    const size = parseNumber(multipack[1]);
    if (count !== null && size !== null) return { kind: "multipack", count, size };
  }

  const range = splitPair(text, / ?(?:[-–—]|tot|to) ?/);
  if (range) {
    const min = parseNumber(range[0]);
    const max = parseNumber(range[1]);
    if (min !== null && max !== null) return { kind: "range", min, max };
  }

  const value = parseNumber(text);
  return value === null ? null : { kind: "single", value };
}

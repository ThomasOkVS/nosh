import type { TemperatureUnit } from "./preferences";

// Deliberately conservative: a temperature must carry an explicit scale:
// "180°C", "350 °F", "350 degrees F", "180 graden Celsius", or a bare
// uppercase "200C" as UK recipes write it. A lone number is never touched
// ("bake 20 minutes at 180" stays as written). Oven temperatures are two or
// three digits, which also keeps things like "5C" out.
const WITH_MARKER =
  /\b(\d{2,3})(?:\s?(?:-|–|tot|to)\s?(\d{2,3}))?\s?(?:°\s?|º\s?|degrees\s|graden\s)(celsius|fahrenheit|c|f)\b/gi;
const BARE_LETTER = /\b(\d{2,3})(?:\s?(?:-|–)\s?(\d{2,3}))?(C|F)\b/g;

function toScale(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  if (from === to) return value;
  // Whole degrees: ovens don't have decimals (docs/decisions.md).
  return Math.round(to === "C" ? ((value - 32) * 5) / 9 : (value * 9) / 5 + 32);
}

function replacer(target: TemperatureUnit) {
  return (match: string, first: string, second: string | undefined, scale: string): string => {
    const from: TemperatureUnit = scale.charAt(0).toUpperCase() === "C" ? "C" : "F";
    if (from === target) return match;
    const low = toScale(Number(first), from, target);
    const text =
      second === undefined ? `${low}` : `${low}-${toScale(Number(second), from, target)}`;
    return `${text}°${target}`;
  };
}

/** Rewrites explicit temperatures in free text (a recipe step) into
 * `target`, leaving everything else untouched. */
export function convertTemperaturesInText(text: string, target: TemperatureUnit): string {
  return text.replace(WITH_MARKER, replacer(target)).replace(BARE_LETTER, replacer(target));
}

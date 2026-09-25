/**
 * Formats an amount exactly enough for baking: at most two decimals,
 * trailing zeros dropped, never snapped to a "friendly" fraction —
 * 133.333 → "133.33", 1.5 → "1.5", 2 → "2". A tiny non-zero amount that
 * would round to "0" keeps two significant digits instead ("0.004").
 */
export function formatQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0 && value !== 0) return String(Number(value.toPrecision(2)));
  return String(rounded);
}

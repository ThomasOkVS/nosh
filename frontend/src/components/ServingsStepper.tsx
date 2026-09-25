import { ArrowCounterClockwiseIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { formatQuantity } from "@nosh/units";

const stepButtonClass =
  "flex h-11 w-11 items-center justify-center rounded-md border border-border text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** Multiplier steps for a recipe with no servings count. */
const MULTIPLIER_STEP = 0.5;

/**
 * Next whole serving count up or down from a possibly fractional one:
 * 5.33 goes to 6 or 5, 4 goes to 5 or 3. Stepping always lands back on
 * whole servings after a scale-by-ingredient.
 */
function stepServings(current: number, direction: 1 | -1): number {
  const EPSILON = 1e-9;
  if (direction === 1) return Math.floor(current + EPSILON) + 1;
  return Math.ceil(current - EPSILON) - 1;
}

/**
 * `[−] 6 servings [+]` over the Ingredients list — see
 * docs/design-system.md#recipe-scaling. Works in terms of the scale
 * `factor` (what the parent stores); a recipe without a servings count
 * steps the multiplier in halves instead.
 */
export function ServingsStepper({
  servings,
  factor,
  onChange,
}: Readonly<{
  /** The recipe's own servings count, or null if it doesn't say. */
  servings: number | null;
  factor: number;
  onChange: (factor: number) => void;
}>) {
  const scaled = factor !== 1;

  let label: string;
  let canDecrease: boolean;
  let decrease: () => void;
  let increase: () => void;
  if (servings) {
    const current = servings * factor;
    label = `${formatQuantity(current)} ${current === 1 ? "serving" : "servings"}`;
    canDecrease = stepServings(current, -1) >= 1;
    decrease = () => onChange(stepServings(current, -1) / servings);
    increase = () => onChange(stepServings(current, 1) / servings);
  } else {
    label = `×${formatQuantity(factor)}`;
    canDecrease = factor - MULTIPLIER_STEP > 0;
    decrease = () => onChange(factor - MULTIPLIER_STEP);
    increase = () => onChange(factor + MULTIPLIER_STEP);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scaled && (
        <button
          type="button"
          onClick={() => onChange(1)}
          className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowCounterClockwiseIcon size={16} />
          Reset
        </button>
      )}
      <div className="flex items-center gap-2" role="group" aria-label="Scale recipe">
        <button
          type="button"
          onClick={decrease}
          disabled={!canDecrease}
          aria-label={servings ? "Fewer servings" : "Smaller batch"}
          className={stepButtonClass}
        >
          <MinusIcon size={16} />
        </button>
        <span aria-live="polite" className="min-w-20 text-center font-mono text-sm text-ink">
          {label}
        </span>
        <button
          type="button"
          onClick={increase}
          aria-label={servings ? "More servings" : "Bigger batch"}
          className={stepButtonClass}
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}

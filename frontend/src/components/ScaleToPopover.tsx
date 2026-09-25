import {
  anchorFactor,
  lookupUnit,
  parseNumber,
  unitDimension,
  unitLabel,
  unitsOfDimension,
  type IngredientAmount,
  type RecipeLanguage,
  type UnitId,
} from "@nosh/units";
import { useEffect, useId, useRef, useState, type RefObject, type SubmitEvent } from "react";
import { inputClass } from "../styles";

/**
 * "I have [___] [unit ▾]": rescales the whole recipe from how much of one
 * ingredient you actually have. See docs/design-system.md#recipe-scaling.
 *
 * `original` is the ingredient as stored (the factor is measured against it,
 * so it stays exact); `shown` is what the list currently displays (scaled and
 * converted), used to prefill the field and pick the default unit.
 */
export function ScaleToPopover({
  original,
  shown,
  language,
  triggerRef,
  onScale,
  onClose,
}: Readonly<{
  original: IngredientAmount;
  shown: IngredientAmount;
  language: RecipeLanguage;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onScale: (factor: number) => void;
  onClose: () => void;
}>) {
  const shownUnit = lookupUnit(shown.unit);
  const [amount, setAmount] = useState(shown.quantity ?? "");
  const [unit, setUnit] = useState<UnitId | null>(shownUnit);
  const [invalid, setInvalid] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // Outside click / Escape close it, like UserMenu; focus goes back to the
  // quantity that opened it so keyboard users don't lose their place.
  useEffect(() => {
    const trigger = triggerRef.current;
    const close = () => {
      onClose();
      trigger?.focus();
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !trigger?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, triggerRef]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = parseNumber(amount);
    const factor = value === null ? null : anchorFactor(original, value, unit);
    if (factor === null) {
      setInvalid(true);
      return;
    }
    onScale(factor);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={panelRef}
      className="glass-menu animate-dialog-in absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg p-3"
    >
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor={inputId} className="block text-sm text-ink-muted">
          I have
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={inputId}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setInvalid(false);
            }}
            aria-invalid={invalid}
            placeholder="200"
            className={`${inputClass} w-0 min-w-0 flex-1`}
          />
          {shownUnit ? (
            <select
              aria-label="Unit"
              value={unit ?? shownUnit}
              onChange={(event) => setUnit(event.target.value as UnitId)}
              className={`${inputClass} px-2`}
            >
              {unitsOfDimension(unitDimension(shownUnit)).map((id) => (
                <option key={id} value={id}>
                  {unitLabel(id, 2, language)}
                </option>
              ))}
            </select>
          ) : (
            shown.unit && <span className="self-center text-sm text-ink-muted">{shown.unit}</span>
          )}
        </div>
        {invalid && (
          <p className="text-xs text-danger-700 dark:text-danger-500">Enter an amount above 0.</p>
        )}
        <button
          type="submit"
          className="min-h-11 w-full rounded-md bg-sauce-500 px-4 text-sm font-medium text-white transition-colors duration-standard ease-standard hover:bg-sauce-600 active:scale-[0.98] active:bg-sauce-700"
        >
          Scale recipe
        </button>
      </form>
    </div>
  );
}

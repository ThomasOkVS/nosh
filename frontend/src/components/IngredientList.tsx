import { canAnchor, convertIngredient } from "@nosh/units";
import { useMemo, useRef, useState } from "react";
import type { Ingredient } from "../api/types";
import type { RecipePreferences } from "../api/settings";
import { ScaleToPopover } from "./ScaleToPopover";

/**
 * The recipe's ingredients as an "index" list (see
 * docs/design-system.md#ingredient--step-display), scaled by `factor` and
 * converted to the user's units. Tapping an amount opens "I have…" to
 * rescale from that ingredient (docs/design-system.md#recipe-scaling).
 */
export function IngredientList({
  ingredients,
  factor,
  preferences,
  anchorId,
  onAnchor,
}: Readonly<{
  ingredients: Ingredient[];
  factor: number;
  preferences: RecipePreferences;
  /** The ingredient the current scale was set from, highlighted. */
  anchorId: number | null;
  onAnchor: (ingredientId: number, factor: number) => void;
}>) {
  const [openId, setOpenId] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Derived, never stored: the displayed amounts are a pure function of the
  // stored recipe, the scale factor and the preferences, recomputed only
  // when one of those changes.
  const shown = useMemo(
    () =>
      ingredients.map((ingredient) =>
        convertIngredient(ingredient, {
          ...preferences,
          factor,
          language: preferences.language,
        }),
      ),
    [ingredients, factor, preferences],
  );

  return (
    <ul className="mt-3 divide-y divide-border border-y border-border">
      {ingredients.map((ingredient, index) => {
        const display = shown[index]!;
        const amount = [display.quantity, display.unit].filter(Boolean).join(" ");
        const anchorable = canAnchor(ingredient);
        const isOpen = openId === ingredient.id;
        return (
          <li key={ingredient.id} className="relative flex items-baseline gap-4 py-2.5 text-ink">
            <span className="w-6 flex-shrink-0 font-mono text-xs text-ink-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              {amount &&
                (anchorable ? (
                  <button
                    type="button"
                    ref={isOpen ? triggerRef : undefined}
                    onClick={() => setOpenId(isOpen ? null : ingredient.id)}
                    aria-expanded={isOpen}
                    aria-label={`${amount}: scale recipe from ${ingredient.name}`}
                    className={`font-medium underline decoration-sauce-500/50 decoration-dotted underline-offset-4 hover:decoration-sauce-500 ${
                      anchorId === ingredient.id ? "text-sauce-600 dark:text-sauce-400" : ""
                    }`}
                  >
                    {amount}
                  </button>
                ) : (
                  amount
                ))}
              {amount && " "}
              {display.name}
            </span>
            {isOpen && (
              <ScaleToPopover
                original={ingredient}
                shown={display}
                language={preferences.language ?? "en"}
                triggerRef={triggerRef}
                onScale={(next) => {
                  onAnchor(ingredient.id, next);
                  setOpenId(null);
                }}
                onClose={() => setOpenId(null)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

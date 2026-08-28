export type TagChipVariant = "default" | "editorial";

// Each variant supplies its own shape/spacing/type, not just color — the
// "editorial" variant (recipe list/detail, see docs/design-system.md#tagschips)
// is a small-caps hairline-underlined label rather than a pill, which the
// old shared rounded-full/px-2/py-0.5 base couldn't express.
const VARIANT_CLASS: Record<TagChipVariant, string> = {
  default: "rounded-full px-2 py-0.5 text-xs bg-sage-50 text-sage-700 hover:bg-sage-100 dark:bg-sage-500/15 dark:text-sage-300",
  editorial:
    "border-b border-border pb-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted hover:border-sauce-500 hover:text-sauce-600 dark:hover:text-sauce-400",
};

interface TagChipProps {
  tag: string;
  variant?: TagChipVariant;
  onClick: (tag: string) => void;
}

/** A read-only, clickable tag pill — navigates to the tag-filtered recipe
 * list. Used both on `RecipeCard` (where it sits inside the card's own
 * `<Link>`) and `RecipeDetailPage`. Needs both `preventDefault` and
 * `stopPropagation`: `stopPropagation` alone stops the *Link's own* onClick
 * from running, but that's exactly the handler that would have called
 * `preventDefault()` to cancel the anchor's native navigation — skip it and
 * the browser follows the href anyway, so this button has to cancel that
 * default itself. */
export function TagChip({ tag, variant = "default", onClick }: Readonly<TagChipProps>) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(tag);
      }}
      className={`${variant === "editorial" ? "" : "capitalize"} transition-colors duration-standard ease-standard ${VARIANT_CLASS[variant]}`}
    >
      {tag}
    </button>
  );
}

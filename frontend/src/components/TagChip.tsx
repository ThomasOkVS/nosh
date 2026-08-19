export type TagChipVariant = "default" | "overlay";

const VARIANT_CLASS: Record<TagChipVariant, string> = {
  default: "bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300",
  overlay: "bg-white/20 text-white hover:bg-white/30",
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
      className={`rounded-full px-2 py-0.5 text-xs capitalize transition-colors duration-standard ease-standard ${VARIANT_CLASS[variant]}`}
    >
      {tag}
    </button>
  );
}

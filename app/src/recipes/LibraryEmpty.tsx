import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * REC-40: the empty-state drawing (empty-state mockup, direction A). Ink
 * lines in currentColor, a card-white pot, mustard steam and shadow, so it
 * follows the palette in light and dark.
 */
function PotIllustration({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="A steaming pot"
      viewBox="0 0 170 130"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-foreground", className)}
    >
      <ellipse cx="85" cy="118" rx="62" ry="6" fill="var(--accent)" stroke="none" opacity=".55" />
      <path d="M30 62h110c0 30-22 52-55 52S30 92 30 62z" fill="var(--card)" />
      <path d="M22 62h126" />
      <path
        d="M62 50c-4-8 4-12 0-20M85 46c-4-8 4-12 0-20M108 50c-4-8 4-12 0-20"
        stroke="var(--highlight)"
      />
      <path d="M118 40l30-28" />
      <circle cx="150" cy="10" r="4" fill="var(--accent)" />
    </svg>
  );
}

const inkButton =
  "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring";

function EmptyFrame({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 pt-14 text-center">
      <PotIllustration className="h-[130px] w-[170px]" />
      <h2 className="mt-5 mb-2 text-[1.75rem] leading-tight">{title}</h2>
      <p className="mb-6 max-w-xs text-sm leading-normal text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

/** COL-05 REC-40: a library with no recipes invites the first one. */
export function LibraryEmpty() {
  return (
    <EmptyFrame
      title="Your library is empty"
      text="Add a recipe you love and it'll live here, photo and all."
      action={
        <Link to="/recipes/new" className={inkButton}>
          <Plus aria-hidden className="size-4" />
          Add your first recipe
        </Link>
      }
    />
  );
}

/** COL-05 REC-40: a tag filter that matches nothing, with the way back to all. */
export function LibraryNoMatch() {
  return (
    <EmptyFrame
      title="No recipes match"
      text="Nothing in your library carries this tag."
      action={
        <Link to="/" search={{}} className={inkButton}>
          Show all recipes
        </Link>
      }
    />
  );
}

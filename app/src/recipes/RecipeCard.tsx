import type { RecipeDto } from "@nosh/shared";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { coverCardUrl, factsLine, placeholderLetter } from "./facts";

interface RecipeCardProps {
  recipe: RecipeDto;
  /** Shown above the title, e.g. the folder path in search results. */
  caption?: string;
}

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring";

/**
 * REC-38: the cover (or a letter placeholder), the title, the facts line and
 * the tags. The card link and the tag links are siblings, so a tap on a tag
 * only ever filters the library. Nothing is draggable: COL adds that.
 */
export function RecipeCard({ recipe, caption }: RecipeCardProps) {
  const cover = coverCardUrl(recipe);
  const facts = factsLine(recipe);
  return (
    <article className="min-w-0">
      <Link
        to="/recipes/$id"
        params={{ id: String(recipe.id) }}
        draggable={false}
        className={cn("group block rounded-lg", focusRing)}
      >
        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-secondary">
          {cover === null ? (
            <div
              data-testid="card-placeholder"
              aria-hidden
              className="grid size-full place-items-center font-display text-[2.1rem] text-muted-foreground"
            >
              {placeholderLetter(recipe.title)}
            </div>
          ) : (
            <img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="size-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]"
            />
          )}
        </div>
        {caption !== undefined && (
          <p data-testid="card-caption" className="mt-2 truncate text-xs text-muted-foreground">
            {caption}
          </p>
        )}
        <h2
          data-testid="card-title"
          className={cn("text-lg leading-[1.1] break-words", caption === undefined ? "mt-2" : "mt-0.5")}
        >
          {recipe.title}
        </h2>
        {facts !== "" && (
          <p data-testid="card-facts" className="mt-1 text-xs text-muted-foreground">
            {facts}
          </p>
        )}
      </Link>
      {recipe.tags.length > 0 && (
        <ul className="mt-0.5 flex flex-wrap gap-x-2.5">
          {recipe.tags.map((tag) => (
            <li key={tag}>
              <Link
                to="/"
                search={{ tag }}
                draggable={false}
                className={cn(
                  "inline-block rounded-sm py-1 text-[0.625rem] font-semibold tracking-[0.12em] text-highlight uppercase hover:underline",
                  focusRing,
                )}
              >
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

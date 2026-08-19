import { ImageSquareIcon, XIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "react-router-dom";
import { recipeImageUrl } from "../api/recipes";
import type { Recipe } from "../api/types";
import { Skeleton } from "./Skeleton";
import { TagChip } from "./TagChip";

/** Matches RecipeCard's shape — shown in a grid while the initial recipe
 * list is loading, see docs/design-system.md#loading-states. */
export function RecipeCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-3/4 rounded-full" />
        <Skeleton className="h-4 w-1/2 rounded-full" />
        <div className="flex gap-1 pt-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
  /** Renders a small overlaid remove button when present — used on
   * `CollectionDetailPage` to drop a recipe from the collection without
   * navigating to it. */
  onRemove?: () => void;
}

export function RecipeCard({ recipe, onRemove }: Readonly<RecipeCardProps>) {
  const thumbnail = recipe.images[0];
  const navigate = useNavigate();

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="relative block overflow-hidden rounded-lg border border-border bg-surface transition-[transform,box-shadow] duration-standard ease-standard hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(35,32,28,0.04),0_8px_20px_rgba(35,32,28,0.08)] dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_20px_rgba(0,0,0,0.35)]"
    >
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${recipe.title} from this collection`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white transition-colors duration-standard ease-standard hover:bg-black/60"
        >
          <XIcon size={16} weight="bold" />
        </button>
      )}
      <div className="aspect-[4/3] w-full bg-surface-sunken">
        {thumbnail ? (
          <img src={recipeImageUrl(recipe.id, thumbnail.id)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-citrus-50 text-citrus-500 dark:bg-citrus-500/15 dark:text-citrus-400">
            <ImageSquareIcon size={32} />
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="truncate font-display font-bold text-ink">{recipe.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {[
            recipe.servings ? `${recipe.servings} servings` : null,
            recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes} min prep` : null,
            recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes} min cook` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.tags.map((tag) => (
              <TagChip key={tag} tag={tag} onClick={(t) => navigate(`/?tag=${encodeURIComponent(t)}`)} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

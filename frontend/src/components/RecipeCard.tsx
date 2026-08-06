import { ImageSquareIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { recipeImageUrl } from "../api/recipes";
import type { Recipe } from "../api/types";
import { Skeleton } from "./Skeleton";

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

export function RecipeCard({ recipe }: Readonly<{ recipe: Recipe }>) {
  const thumbnail = recipe.images[0];

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="block overflow-hidden rounded-lg border border-border bg-surface transition-[transform,box-shadow] duration-standard ease-standard hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(35,32,28,0.04),0_8px_20px_rgba(35,32,28,0.08)] dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_20px_rgba(0,0,0,0.35)]"
    >
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
              <span
                key={tag}
                className="rounded-full bg-teal-50 px-2 py-0.5 text-xs capitalize text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

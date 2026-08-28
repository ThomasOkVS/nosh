import { ImageSquareIcon } from "@phosphor-icons/react";
import type { DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recipeImageUrl } from "../api/recipes";
import type { Recipe } from "../api/types";
import { setDraggedRecipeId } from "../lib/recipeDrag";
import { Skeleton } from "./Skeleton";
import { TagChip } from "./TagChip";

/** Matches RecipeCard's shape — shown in a grid while the initial recipe
 * list is loading, see docs/design-system.md#loading-states. */
export function RecipeCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
  /** Lets this card be dragged onto a collection drop target (see
   * docs/design-system.md#drag-and-drop). Off by default — only
   * `CollectionsPage`'s grid has folders to drop into; `RecipeListPage`'s
   * flat grid doesn't opt in. */
  draggable?: boolean;
}

export function RecipeCard({ recipe, draggable = false }: Readonly<RecipeCardProps>) {
  const thumbnail = recipe.images[0];
  const navigate = useNavigate();

  const handleDragStart = (event: DragEvent<HTMLAnchorElement>) => {
    setDraggedRecipeId(event.dataTransfer, recipe.id);
  };

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      className="relative block overflow-hidden rounded-lg border border-border bg-surface transition-[transform,box-shadow] duration-standard ease-standard hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(35,25,15,0.05),0_8px_20px_rgba(35,25,15,0.1)] dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.25),0_8px_20px_rgba(0,0,0,0.4)]"
    >
      <div className="aspect-[4/3] w-full bg-surface-sunken">
        {thumbnail ? (
          <img src={recipeImageUrl(recipe.id, thumbnail.id)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-sauce-50 text-sauce-500 dark:bg-sauce-500/15 dark:text-sauce-400">
            <ImageSquareIcon size={32} />
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="truncate font-display text-lg font-semibold italic text-ink">{recipe.title}</h2>
        <hr className="mt-1.5 border-border" />
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
          {[
            recipe.servings ? `Serves ${recipe.servings}` : null,
            recipe.prepTimeMinutes ? `Prep ${recipe.prepTimeMinutes} min` : null,
            recipe.cookTimeMinutes ? `Cook ${recipe.cookTimeMinutes} min` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {recipe.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                variant="editorial"
                onClick={(t) => navigate(`/recipes?tag=${encodeURIComponent(t)}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

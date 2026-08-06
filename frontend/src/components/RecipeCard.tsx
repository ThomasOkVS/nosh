import { Link } from "react-router-dom";
import { recipeImageUrl } from "../api/recipes";
import type { Recipe } from "../api/types";

export function RecipeCard({ recipe }: Readonly<{ recipe: Recipe }>) {
  const thumbnail = recipe.images[0];

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
        {thumbnail && (
          <img src={recipeImageUrl(recipe.id, thumbnail.id)} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-medium text-slate-800">{recipe.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
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
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

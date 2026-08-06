import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteRecipe, getRecipe, recipeImageUrl } from "../api/recipes";
import { useAsync } from "../hooks/useAsync";

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const recipeId = Number(id);
  const navigate = useNavigate();

  const fetchRecipe = useCallback(() => getRecipe(recipeId), [recipeId]);
  const { data: recipe, loading, error } = useAsync(fetchRecipe);

  const handleDelete = useCallback(() => {
    if (!window.confirm("Delete this recipe? This can't be undone.")) {
      return;
    }
    deleteRecipe(recipeId)
      .then(() => navigate("/"))
      .catch(() => window.alert("Failed to delete recipe"));
  }, [recipeId, navigate]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (error) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }
  if (!recipe) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← All recipes
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{recipe.title}</h1>
          {recipe.description && <p className="mt-1 text-slate-600">{recipe.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/recipes/${recipe.id}/edit`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {[
          recipe.servings ? `${recipe.servings} servings` : null,
          recipe.prepTimeMinutes ? `${recipe.prepTimeMinutes} min prep` : null,
          recipe.cookTimeMinutes ? `${recipe.cookTimeMinutes} min cook` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recipe.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      )}

      {recipe.images.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {recipe.images.map((image) => (
            <img
              key={image.id}
              src={recipeImageUrl(recipe.id, image.id)}
              alt=""
              className="h-40 w-40 flex-shrink-0 rounded-md object-cover"
            />
          ))}
        </div>
      )}

      {recipe.ingredients.length > 0 && (
        <section>
          <h2 className="font-medium text-slate-800">Ingredients</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section>
          <h2 className="font-medium text-slate-800">Steps</h2>
          <ol className="mt-2 list-inside list-decimal space-y-2 text-slate-700">
            {recipe.steps.map((step) => (
              <li key={step.id}>{step.instruction}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

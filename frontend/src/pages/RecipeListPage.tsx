import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRecipes, searchRecipes } from "../api/recipes";
import { RecipeCard } from "../components/RecipeCard";
import { useAsync } from "../hooks/useAsync";

export function RecipeListPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const fetchRecipes = useCallback(
    () => (debouncedQuery ? searchRecipes(debouncedQuery) : listRecipes()),
    [debouncedQuery],
  );
  const { data: recipes, loading, error } = useAsync(fetchRecipes);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          type="search"
          placeholder="Search recipes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <Link
          to="/recipes/new"
          className="whitespace-nowrap rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New recipe
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {recipes?.length === 0 && (
        <p className="text-sm text-slate-500">
          {debouncedQuery ? "No recipes match your search." : "No recipes yet — add your first one."}
        </p>
      )}
      {recipes && recipes.length > 0 && (
        <div className="space-y-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

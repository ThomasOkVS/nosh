import { CircleNotchIcon, LinkIcon, PlusIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRecipes, searchRecipes } from "../api/recipes";
import { EmptyRecipesIllustration, EmptySearchIllustration } from "../components/EmptyStateIllustration";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import { useAsync } from "../hooks/useAsync";
import { useImport } from "../import/ImportContext";
import { buttonClass, errorBannerClass, inputClass } from "../styles";

export function RecipeListPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { openDialog } = useImport();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const fetchRecipes = useCallback(
    () => (debouncedQuery ? searchRecipes(debouncedQuery) : listRecipes()),
    [debouncedQuery],
  );
  const { data: recipes, loading, error } = useAsync(fetchRecipes);

  // useAsync keeps the previous `data` around while a new fetch is in
  // flight, so only the very first load (no data yet) needs to fully
  // replace the page with a skeleton — a search refetch should keep
  // showing the current results with a small inline spinner instead of
  // blanking the list on every keystroke. See
  // docs/design-system.md#loading-states.
  const isInitialLoad = loading && recipes === null;
  const isRefetching = loading && recipes !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <input
            type="search"
            placeholder="Search recipes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`w-full ${inputClass}`}
          />
          {isRefetching && (
            <CircleNotchIcon
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-faint"
            />
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={openDialog} className={buttonClass("secondary")}>
            <LinkIcon size={18} weight="bold" />
            Import from URL
          </button>
          <Link to="/recipes/new" className={buttonClass("primary")}>
            <PlusIcon size={18} weight="bold" />
            New recipe
          </Link>
        </div>
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}
      {isInitialLoad && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <RecipeCardSkeleton key={index} />
          ))}
        </div>
      )}
      {!isInitialLoad && recipes?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          {debouncedQuery ? (
            <EmptySearchIllustration className="h-32 w-32" />
          ) : (
            <EmptyRecipesIllustration className="h-32 w-32" />
          )}
          <h2 className="font-display text-lg font-bold text-ink">
            {debouncedQuery ? "No recipes match your search" : "No recipes yet"}
          </h2>
          <p className="max-w-xs text-sm text-ink-muted">
            {debouncedQuery
              ? "Try a different search term, or clear the search to see everything."
              : "Add your first recipe to get your collection started."}
          </p>
          {!debouncedQuery && (
            <Link to="/recipes/new" className={`mt-2 ${buttonClass("primary")}`}>
              <PlusIcon size={18} weight="bold" />
              Add your first recipe
            </Link>
          )}
        </div>
      )}
      {recipes && recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

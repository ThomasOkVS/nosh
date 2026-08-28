import { CircleNotchIcon, ImageSquareIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { listRecipes, recipeImageUrl, searchRecipes } from "../api/recipes";
import { useAsync } from "../hooks/useAsync";
import { inputClass } from "../styles";

interface RecipePickerDialogProps {
  open: boolean;
  onSelect: (recipeId: number) => void;
  onCancel: () => void;
}

/** A search-and-pick modal for assigning a recipe to a meal-plan day —
 * there's no existing recipe-search combobox to reuse. Structural
 * conventions (native `<dialog>`, `showModal()`, intercepting the `cancel`
 * event, backdrop-click-to-close, explicit focus management rather than
 * relying on the dialog's own default) match `ConfirmDialog`. */
export function RecipePickerDialog({ open, onSelect, onCancel }: Readonly<RecipePickerDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const { data: recipes, loading } = useAsync(fetchRecipes);

  // Same one-effect shape as ConfirmDialog: `open` flipping true mounts a
  // fresh <dialog> node every time (the parent keeps rendering this
  // component, just with a different prop), so the query is reset and the
  // dialog (re-)opened together here rather than in separate effects.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    setQuery("");
    setDebouncedQuery("");
    dialog.showModal();
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    dialog.addEventListener("cancel", handleCancel);

    return () => {
      document.body.style.overflow = "";
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="recipe-picker-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
      className="glass animate-dialog-in m-auto w-full max-w-md rounded-lg p-6"
    >
      <div className="flex items-center justify-between">
        <h2 id="recipe-picker-title" className="font-display text-lg font-bold text-ink">
          Add a recipe
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="text-ink-muted hover:text-ink"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="relative mt-4">
        <label htmlFor="recipe-picker-search" className="sr-only">
          Search recipes
        </label>
        <input
          ref={inputRef}
          id="recipe-picker-search"
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Search recipes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`w-full ${inputClass}`}
        />
        {loading && (
          <CircleNotchIcon
            size={18}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-faint"
          />
        )}
      </div>

      <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto">
        {recipes?.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-muted">No recipes found</li>
        )}
        {recipes?.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onSelect(recipe.id)}
              className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors duration-standard ease-standard hover:bg-surface-sunken"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-sunken">
                {recipe.images[0] ? (
                  <img
                    src={recipeImageUrl(recipe.id, recipe.images[0].id)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageSquareIcon size={18} className="text-ink-faint" />
                )}
              </div>
              <span className="truncate text-sm text-ink">{recipe.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

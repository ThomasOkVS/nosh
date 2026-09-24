import {
  CircleNotchIcon,
  FolderIcon,
  LinkIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useState, type DragEvent, type SubmitEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from "../api/collections";
import { listRecipes, moveRecipeCollection, searchRecipes } from "../api/recipes";
import type { Collection } from "../api/types";
import { CollectionBreadcrumb } from "../components/CollectionBreadcrumb";
import { CollectionSelect } from "../components/CollectionSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  EmptyRecipesIllustration,
  EmptySearchIllustration,
} from "../components/EmptyStateIllustration";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import { useAsync } from "../hooks/useAsync";
import { useRecipeDropTargets, type FolderTarget } from "../hooks/useRecipeDropTargets";
import { useImport } from "../import/ImportContext";
import { collectionPathLabel, collectionSubtreeIds, libraryPath } from "../lib/collectionTree";
import { buttonClass, errorBannerClass, inputClass } from "../styles";
import { useToast } from "../toast/ToastContext";

/** Every sub-collection and recipe anywhere inside `id`'s subtree — used for
 * the delete-confirmation copy. `recipeCount` on a `Collection` is a direct
 * count (recipes filed in that exact collection), so the subtree total is
 * the sum of it across `id` and every descendant. */
function subtreeCounts(
  collections: Collection[],
  id: number,
): { subCollectionCount: number; recipeCount: number } {
  const subtreeIds = collectionSubtreeIds(collections, id);
  let recipeCount = 0;
  for (const collection of collections) {
    if (subtreeIds.has(collection.id)) {
      recipeCount += collection.recipeCount;
    }
  }
  return { subCollectionCount: subtreeIds.size - 1, recipeCount };
}

function deleteMessage(subCollectionCount: number, recipeCount: number): string {
  const parts: string[] = [];
  if (subCollectionCount > 0) {
    parts.push(`${subCollectionCount} sub-collection${subCollectionCount === 1 ? "" : "s"}`);
  }
  if (recipeCount > 0) {
    parts.push(`${recipeCount} recipe${recipeCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return "This can't be undone.";
  }
  return `This deletes ${parts.join(" and ")} inside it. This can't be undone.`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The library: the app's home page (`/`) and every collection's folder view
 * (`/collections/:id`), in one component. `collectionId` of `null` means
 * Home, which holds top-level collections *and* recipes of its own.
 *
 * Two modes, picked by the URL:
 * - **Browse** (no `?q`/`?tag`): like a file explorer — this folder's
 *   sub-collections, then the recipes directly inside it.
 * - **Search** (`?q` from the header's `LibrarySearch`, and/or `?tag` from a
 *   clicked tag chip): one flat list of matches from this folder *and
 *   everything beneath it*, each labelled with where it lives, plus a
 *   "Search everywhere" link to widen the scope to the whole library.
 */
export function CollectionsPage() {
  const { id } = useParams<{ id: string }>();
  const collectionId = id ? Number(id) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const activeTag = searchParams.get("tag") ?? undefined;
  const searching = query !== "" || activeTag !== undefined;

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { openDialog } = useImport();

  // The flat list of every collection is enough to derive this folder, its
  // sub-collections and its breadcrumb — no separate per-folder request.
  const {
    data: allCollections,
    error: collectionsError,
    reload: reloadCollections,
  } = useAsync(listCollections);

  const fetchRecipes = useCallback(() => {
    if (!searching) {
      return listRecipes({ collection: collectionId ?? "root" });
    }
    const filters = { tag: activeTag, within: collectionId ?? undefined };
    return query ? searchRecipes(query, filters) : listRecipes(filters);
  }, [searching, query, activeTag, collectionId]);
  const {
    data: recipes,
    loading: recipesLoading,
    error: recipesError,
    reload: reloadRecipes,
  } = useAsync(fetchRecipes);

  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [parentDraft, setParentDraft] = useState<number | null>(null);

  const reload = useCallback(() => {
    reloadCollections();
    reloadRecipes();
  }, [reloadCollections, reloadRecipes]);

  const moveDroppedRecipe = useCallback(
    (recipeId: number, target: FolderTarget) => {
      moveRecipeCollection(recipeId, target)
        .then(reload)
        .catch(() => showToast("Failed to move recipe"));
    },
    [reload, showToast],
  );
  const dropTargets = useRecipeDropTargets(moveDroppedRecipe);

  // Safety net for the whole page: `RecipeCard` renders as an `<a>`, which
  // is natively draggable with the link's own URL as the browser's default
  // drag payload. Without this, releasing a drag outside a recognized drop
  // target (anywhere else on the page) falls back to that native behavior
  // -- navigating the whole page to the recipe's URL.
  const preventUnhandledDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const current =
    collectionId !== null ? (allCollections?.find((c) => c.id === collectionId) ?? null) : null;
  const notFound = collectionId !== null && allCollections !== null && current === null;

  const handleCreate = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    createCollection(name, collectionId)
      .then(() => {
        setNewName("");
        reloadCollections();
      })
      .catch(() => showToast("Failed to create collection"));
  };

  const startRenaming = () => {
    if (!current) return;
    setNameDraft(current.name);
    setParentDraft(current.parentId);
    setRenaming(true);
  };

  const submitRename = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (collectionId === null) return;
    const name = nameDraft.trim();
    if (!name) return;

    updateCollection(collectionId, name, parentDraft)
      .then(() => {
        setRenaming(false);
        reloadCollections();
      })
      .catch(() => showToast("Failed to save changes"));
  };

  const confirmDelete = useCallback(() => {
    if (collectionId === null || !current) return;
    const parentId = current.parentId;
    deleteCollection(collectionId)
      .then(() => {
        // `allCollections` only refetches when explicitly reloaded — a plain
        // navigate() to the parent/home wouldn't otherwise pick up the
        // deletion, since neither the fetcher function nor the reload index
        // it depends on changes just because the URL does.
        reloadCollections();
        navigate(libraryPath(parentId));
      })
      .catch(() => showToast("Failed to delete collection"));
  }, [collectionId, current, navigate, reloadCollections, showToast]);

  const clearTag = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("tag");
      return next;
    });
  };

  const error = collectionsError ?? recipesError;
  const subCollections = (allCollections ?? []).filter((c) => c.parentId === collectionId);
  // useAsync keeps the previous `data` while a new fetch is in flight, so
  // only the very first load needs a skeleton — a search refetch keeps the
  // current results on screen. See docs/design-system.md#loading-states.
  const isInitialLoad = recipesLoading && recipes === null;
  const recipeList = recipes ?? [];
  const browseEmpty =
    !searching &&
    allCollections !== null &&
    recipes !== null &&
    subCollections.length === 0 &&
    recipeList.length === 0;
  const { subCollectionCount, recipeCount } =
    allCollections && collectionId !== null
      ? subtreeCounts(allCollections, collectionId)
      : { subCollectionCount: 0, recipeCount: 0 };

  // The same search, but with the folder scope removed.
  const everywhereParams = new URLSearchParams();
  if (query) everywhereParams.set("q", query);
  if (activeTag) everywhereParams.set("tag", activeTag);
  const searchEverywhereHref = `/?${everywhereParams.toString()}`;

  const title = collectionId === null ? "Library" : (current?.name ?? "");
  const newRecipeHref =
    collectionId === null ? "/recipes/new" : `/recipes/new?collection=${collectionId}`;

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className={errorBannerClass}>Collection not found</p>
        <Link to="/" className="text-sm text-ink-muted hover:text-ink">
          Back to your library
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" onDragOver={preventUnhandledDrop} onDrop={preventUnhandledDrop}>
      {collectionId !== null && allCollections && (
        <CollectionBreadcrumb
          collections={allCollections}
          collectionId={collectionId}
          dropTargets={dropTargets}
          className="text-ink-muted"
        />
      )}

      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {renaming && current && allCollections ? (
            <form onSubmit={submitRename} className="flex flex-1 flex-wrap items-center gap-2">
              <label htmlFor="collection-name" className="sr-only">
                Collection name
              </label>
              <input
                id="collection-name"
                name="name"
                type="text"
                autoComplete="off"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                autoFocus
                className={`w-full max-w-xs ${inputClass}`}
              />
              <label htmlFor="collection-parent" className="sr-only">
                Parent collection
              </label>
              <CollectionSelect
                id="collection-parent"
                collections={allCollections}
                value={parentDraft}
                onChange={setParentDraft}
                placeholderLabel="Home (top level)"
                excludeIds={collectionSubtreeIds(allCollections, current.id)}
                className={inputClass}
              />
              <button type="submit" disabled={!nameDraft.trim()} className={buttonClass("primary")}>
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="font-display text-3xl font-bold italic text-ink sm:text-4xl">{title}</h1>
          )}
          {!renaming && (
            <div className="flex flex-wrap gap-2">
              <Link to={newRecipeHref} className={buttonClass("primary")}>
                <PlusIcon size={18} weight="bold" />
                New recipe
              </Link>
              <button
                type="button"
                onClick={() => openDialog({ collectionId })}
                className={buttonClass("secondary")}
              >
                <LinkIcon size={18} weight="bold" />
                Import
              </button>
              {current && (
                <>
                  <button type="button" onClick={startRenaming} className={buttonClass("ghost")}>
                    <PencilSimpleIcon size={16} />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(true)}
                    className={buttonClass("ghost")}
                  >
                    <TrashIcon size={16} />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {!searching && !browseEmpty && allCollections && recipes && !renaming && (
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-muted">
            {plural(subCollections.length, "collection")}
            {" · "}
            {plural(recipeList.length, "recipe")}
          </p>
        )}
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {searching ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          <span>
            {recipes ? plural(recipeList.length, "result") : "Results"}
            {query && (
              <>
                {" for "}
                <span className="font-medium text-ink">“{query}”</span>
              </>
            )}
            {" in "}
            <span className="font-medium text-ink">
              {collectionId === null ? "your whole library" : title}
            </span>
          </span>
          {/* Refetch indicator — results already on screen stay visible
            * (see docs/design-system.md#loading-states). */}
          {recipesLoading && (
            <CircleNotchIcon
              size={16}
              role="status"
              aria-label="Searching"
              className="animate-spin text-ink-faint"
            />
          )}
          {activeTag && (
            <button
              type="button"
              onClick={clearTag}
              aria-label={`Remove tag filter ${activeTag}`}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink hover:border-sauce-500 hover:text-sauce-600"
            >
              {activeTag}
              <XIcon size={12} />
            </button>
          )}
          {collectionId !== null && (
            <Link to={searchEverywhereHref} className="text-sauce-600 hover:underline">
              Search everywhere
            </Link>
          )}
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex gap-2">
          <label htmlFor="new-collection-name" className="sr-only">
            Collection name
          </label>
          <input
            id="new-collection-name"
            name="name"
            type="text"
            autoComplete="off"
            placeholder={collectionId === null ? "New collection…" : "New sub-collection…"}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className={`w-full sm:w-64 ${inputClass}`}
          />
          <button type="submit" disabled={!newName.trim()} className={buttonClass("secondary")}>
            <FolderIcon size={18} />
            Create
          </button>
        </form>
      )}

      {browseEmpty && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <EmptyRecipesIllustration className="h-32 w-32" />
          <h2 className="font-display text-lg font-semibold italic text-ink">
            {collectionId === null ? "Your library is empty" : "This collection is empty"}
          </h2>
          <p className="max-w-xs text-sm text-ink-muted">
            {collectionId === null
              ? 'Add your first recipe, or create collections like "Weeknight dinners" to organize them.'
              : "Add or import a recipe straight into it, or create a sub-collection above."}
          </p>
        </div>
      )}

      {searching && recipes !== null && recipeList.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <EmptySearchIllustration className="h-32 w-32" />
          <h2 className="font-display text-lg font-semibold italic text-ink">No recipes match</h2>
          <p className="max-w-xs text-sm text-ink-muted">
            {collectionId !== null
              ? "Nothing in this collection or its sub-collections. Try searching everywhere."
              : "Try a different search term, or clear the filter."}
          </p>
        </div>
      )}

      {!searching && subCollections.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {subCollections.map((collection) => (
            <li
              key={collection.id}
              {...dropTargets.dropTargetProps(collection.id)}
              className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-standard ease-standard ${
                dropTargets.isActive(collection.id)
                  ? "bg-sauce-50 ring-1 ring-inset ring-sauce-500 dark:bg-sauce-500/10"
                  : ""
              }`}
            >
              <Link
                to={libraryPath(collection.id)}
                className="flex min-w-0 items-center gap-2 text-ink hover:text-sauce-600"
              >
                <FolderIcon size={20} className="flex-shrink-0 text-sauce-500" />
                <span className="truncate font-medium">{collection.name}</span>
                <span className="flex-shrink-0 text-sm text-ink-muted">
                  ({collection.recipeCount})
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isInitialLoad && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <RecipeCardSkeleton key={index} />
          ))}
        </div>
      )}

      {recipeList.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipeList.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              draggable={!searching}
              caption={
                searching && allCollections
                  ? collectionPathLabel(allCollections, recipe.collectionId)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete}
        title="Delete this collection?"
        message={deleteMessage(subCollectionCount, recipeCount)}
        confirmLabel="Delete"
        onConfirm={() => {
          setPendingDelete(false);
          confirmDelete();
        }}
        onCancel={() => setPendingDelete(false)}
      />
    </div>
  );
}

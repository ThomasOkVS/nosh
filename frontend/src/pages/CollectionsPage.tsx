import { FolderIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useState, type DragEvent, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createCollection,
  deleteCollection,
  getCollectionContents,
  listCollections,
  updateCollection,
} from "../api/collections";
import { moveRecipeCollection } from "../api/recipes";
import type { Collection } from "../api/types";
import { CollectionSelect } from "../components/CollectionSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecipeCard } from "../components/RecipeCard";
import { useAsync } from "../hooks/useAsync";
import { collectionBreadcrumb, collectionSubtreeIds } from "../lib/collectionTree";
import { getDraggedRecipeId, isRecipeDrag } from "../lib/recipeDrag";
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

/** The app's home page (`/`) and every collection's folder view
 * (`/collections/:id`) in one component — a real folder shows its
 * sub-folders and its files together, so there's no separate "list of
 * collections" vs. "one collection's recipes" page any more. `collectionId`
 * of `null` means the root/home level, which is just the collections with no
 * parent — not a real row of its own. */
export function CollectionsPage() {
  const { id } = useParams<{ id: string }>();
  const collectionId = id ? Number(id) : null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: allCollections, error: allError, reload: reloadAll } = useAsync(listCollections);

  const fetchContents = useCallback(
    () => (collectionId !== null ? getCollectionContents(collectionId) : Promise.resolve(null)),
    [collectionId],
  );
  const { data: contents, error: contentsError, reload: reloadContents } = useAsync(fetchContents);

  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [parentDraft, setParentDraft] = useState<number | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<number | null>(null);

  const reload = useCallback(() => {
    reloadAll();
    if (collectionId !== null) reloadContents();
  }, [collectionId, reloadAll, reloadContents]);

  // Drag-and-drop: a recipe card dropped on a sub-collection row or an
  // ancestor breadcrumb crumb moves it there — see
  // docs/design-system.md#drag-and-drop-moving-a-recipe-between-collections.
  const handleDragOverTarget = useCallback(
    (targetId: number) => (event: DragEvent<HTMLElement>) => {
      // dragover can't read the payload (getData() is drop-only), only
      // whether a recipe-card drag is in progress at all -- enough to
      // decide whether this target should light up.
      if (!isRecipeDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverTargetId(targetId);
    },
    [],
  );

  const handleDragLeaveTarget = useCallback((targetId: number) => {
    setDragOverTargetId((current) => (current === targetId ? null : current));
  }, []);

  const handleDropOnTarget = useCallback(
    (targetId: number) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOverTargetId(null);
      const recipeId = getDraggedRecipeId(event.dataTransfer);
      if (recipeId === null) return;
      moveRecipeCollection(recipeId, targetId)
        .then(reload)
        .catch(() => showToast("Failed to move recipe"));
    },
    [reload, showToast],
  );

  // Safety net for the whole page: `RecipeCard` renders as an `<a>`, which
  // is natively draggable with the link's own URL as the browser's default
  // drag payload. Without this, releasing a drag outside a recognized drop
  // target (anywhere else on the page) falls back to that native behavior
  // -- navigating the whole page to the recipe's URL.
  const preventUnhandledDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const handleCreate = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    createCollection(name, collectionId)
      .then(() => {
        setNewName("");
        reload();
      })
      .catch(() => showToast("Failed to create collection"));
  };

  const startRenaming = () => {
    if (!contents) return;
    setNameDraft(contents.collection.name);
    setParentDraft(contents.collection.parentId);
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
        reload();
      })
      .catch(() => showToast("Failed to save changes"));
  };

  const confirmDelete = useCallback(() => {
    if (collectionId === null || !contents) return;
    const parentId = contents.collection.parentId;
    deleteCollection(collectionId)
      .then(() => {
        // `allCollections` only refetches when explicitly reloaded — a plain
        // navigate() to the parent/home wouldn't otherwise pick up the
        // deletion, since neither the fetcher function nor the reload index
        // it depends on changes just because the URL does.
        reloadAll();
        navigate(parentId !== null ? `/collections/${parentId}` : "/");
      })
      .catch(() => showToast("Failed to delete collection"));
  }, [collectionId, contents, navigate, reloadAll, showToast]);

  const error = allError ?? contentsError;
  const subCollections =
    collectionId === null
      ? (allCollections ?? []).filter((collection) => collection.parentId === null)
      : (contents?.subCollections ?? []);
  const recipes = contents?.recipes ?? [];
  const loaded = collectionId === null ? allCollections !== null : contents !== null;
  const isEmpty = loaded && subCollections.length === 0 && recipes.length === 0;
  const breadcrumb = allCollections ? collectionBreadcrumb(allCollections, collectionId) : [];
  const { subCollectionCount, recipeCount } =
    allCollections && collectionId !== null
      ? subtreeCounts(allCollections, collectionId)
      : { subCollectionCount: 0, recipeCount: 0 };

  // Every crumb except the last (the current collection -- dropping "on
  // yourself" is meaningless, and it isn't a valid destination anyway).
  const ancestorCrumbs = breadcrumb.slice(0, -1);

  return (
    <div className="space-y-6" onDragOver={preventUnhandledDrop} onDrop={preventUnhandledDrop}>
      {collectionId !== null && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          {breadcrumb.map((collection) => {
            const isAncestor = ancestorCrumbs.includes(collection);
            return (
              <span key={collection.id} className="flex items-center gap-1.5">
                <span aria-hidden="true">/</span>
                <Link
                  to={`/collections/${collection.id}`}
                  onDragOver={isAncestor ? handleDragOverTarget(collection.id) : undefined}
                  onDragLeave={isAncestor ? () => handleDragLeaveTarget(collection.id) : undefined}
                  onDrop={isAncestor ? handleDropOnTarget(collection.id) : undefined}
                  className={`rounded-sm px-1 -mx-1 transition-colors duration-standard ease-standard hover:text-ink ${
                    dragOverTargetId === collection.id
                      ? "bg-sauce-50 text-sauce-600 ring-1 ring-sauce-500 dark:bg-sauce-500/10"
                      : ""
                  }`}
                >
                  {collection.name}
                </Link>
              </span>
            );
          })}
        </nav>
      )}

      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between gap-3">
          {renaming && contents ? (
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
              {allCollections && (
                <CollectionSelect
                  id="collection-parent"
                  collections={allCollections}
                  value={parentDraft}
                  onChange={setParentDraft}
                  placeholderLabel="Home (top level)"
                  excludeIds={collectionSubtreeIds(allCollections, collectionId!)}
                  className={inputClass}
                />
              )}
              <button type="submit" disabled={!nameDraft.trim()} className={buttonClass("primary")}>
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)} className={buttonClass("ghost")}>
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="font-display text-3xl font-bold italic text-ink sm:text-4xl">
              {collectionId === null ? "Collections" : (contents?.collection.name ?? "")}
            </h1>
          )}
          {collectionId !== null && !renaming && (
            <div className="flex flex-shrink-0 gap-2">
              <button type="button" onClick={startRenaming} className={buttonClass("secondary")}>
                <PencilSimpleIcon size={16} />
                Rename
              </button>
              <button type="button" onClick={() => setPendingDelete(true)} className={buttonClass("ghost")}>
                <TrashIcon size={16} />
                Delete
              </button>
            </div>
          )}
        </div>
        {loaded && !renaming && (subCollections.length > 0 || recipes.length > 0) && (
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-muted">
            {subCollections.length} collection{subCollections.length === 1 ? "" : "s"}
            {" · "}
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <label htmlFor="new-collection-name" className="sr-only">
          Collection name
        </label>
        <input
          id="new-collection-name"
          name="name"
          type="text"
          autoComplete="off"
          placeholder="New collection…"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          className={`w-full sm:w-64 ${inputClass}`}
        />
        <button type="submit" disabled={!newName.trim()} className={buttonClass("primary")}>
          <PlusIcon size={18} weight="bold" />
          Create
        </button>
      </form>

      {error && <p className={errorBannerClass}>{error}</p>}

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-sauce-50 text-sauce-500 dark:bg-sauce-500/15 dark:text-sauce-400">
            <FolderIcon size={56} />
          </div>
          <h2 className="font-display text-lg font-bold text-ink">
            {collectionId === null ? "No collections yet" : "This collection is empty"}
          </h2>
          <p className="max-w-xs text-sm text-ink-muted">
            {collectionId === null
              ? 'Group your recipes into collections like "Weeknight dinners" or "Holiday baking" using the form above.'
              : "Add a sub-collection above, or move a recipe in from its detail page."}
          </p>
        </div>
      )}

      {subCollections.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {subCollections.map((collection) => (
            <li
              key={collection.id}
              onDragOver={handleDragOverTarget(collection.id)}
              onDragLeave={() => handleDragLeaveTarget(collection.id)}
              onDrop={handleDropOnTarget(collection.id)}
              className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-standard ease-standard ${
                dragOverTargetId === collection.id
                  ? "bg-sauce-50 ring-1 ring-inset ring-sauce-500 dark:bg-sauce-500/10"
                  : ""
              }`}
            >
              <Link
                to={`/collections/${collection.id}`}
                className="flex min-w-0 items-center gap-2 text-ink hover:text-sauce-600"
              >
                <FolderIcon size={20} className="flex-shrink-0 text-sauce-500" />
                <span className="truncate font-medium">{collection.name}</span>
                <span className="flex-shrink-0 text-sm text-ink-muted">({collection.recipeCount})</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} draggable />
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

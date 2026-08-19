import { FolderIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from "react";
import {
  addRecipeToCollection,
  createCollection,
  listCollections,
  removeRecipeFromCollection,
} from "../api/collections";
import { listRecipeCollections } from "../api/recipes";
import { useAsync } from "../hooks/useAsync";
import { buttonClass, inputClass, sectionHeadingClass } from "../styles";
import { useToast } from "../toast/ToastContext";

interface RecipeCollectionsEditorProps {
  recipeId: number;
}

/** Lets a recipe be added to/removed from the user's collections. Membership
 * isn't part of `RecipeInput`/the create-update payload — like image
 * upload, it's a side-effecting relationship managed on its own, only once a
 * real recipe id exists. */
export function RecipeCollectionsEditor({ recipeId }: Readonly<RecipeCollectionsEditorProps>) {
  const { showToast } = useToast();
  const fetchMemberships = useCallback(() => listRecipeCollections(recipeId), [recipeId]);
  const { data: memberships, reload: reloadMemberships } = useAsync(fetchMemberships);
  const { data: allCollections, reload: reloadAll } = useAsync(listCollections);

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Same outside-click/Escape pattern as UserMenu.tsx.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!memberships || !allCollections) {
    return null;
  }

  const memberIds = new Set(memberships.map((membership) => membership.id));
  const availableCollections = allCollections.filter((collection) => !memberIds.has(collection.id));

  const refresh = () => {
    reloadMemberships();
    reloadAll();
  };

  const handleRemove = (collectionId: number) => {
    removeRecipeFromCollection(collectionId, recipeId)
      .then(refresh)
      .catch(() => showToast("Failed to remove from collection"));
  };

  const handleAdd = (collectionId: number) => {
    addRecipeToCollection(collectionId, recipeId)
      .then(() => {
        setOpen(false);
        refresh();
      })
      .catch(() => showToast("Failed to add to collection"));
  };

  const handleCreateAndAdd = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    createCollection(name)
      .then((collection) => addRecipeToCollection(collection.id, recipeId))
      .then(() => {
        setNewName("");
        setOpen(false);
        refresh();
      })
      .catch(() => showToast("Failed to create collection"));
  };

  return (
    <section>
      <h2 className={sectionHeadingClass}>
        <FolderIcon size={20} className="text-citrus-500" />
        Collections
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {memberships.map((collection) => (
          <span
            key={collection.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm text-ink"
          >
            {collection.name}
            <button
              type="button"
              aria-label={`Remove from ${collection.name}`}
              onClick={() => handleRemove(collection.id)}
              className="text-ink-faint hover:text-danger-500"
            >
              <XIcon size={12} weight="bold" />
            </button>
          </span>
        ))}

        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={open}
            className={buttonClass("ghost")}
          >
            <PlusIcon size={16} weight="bold" />
            Add to collection
          </button>

          {open && (
            <div
              ref={popoverRef}
              role="menu"
              aria-label="Add to collection"
              className="glass-menu animate-dialog-in absolute left-0 z-20 mt-2 w-64 rounded-lg p-2"
            >
              {availableCollections.length > 0 && (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {availableCollections.map((collection) => (
                    <li key={collection.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleAdd(collection.id)}
                        className="flex min-h-11 w-full items-center rounded-sm px-3 text-left text-sm text-ink transition-colors duration-standard ease-standard hover:bg-surface-sunken"
                      >
                        {collection.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={handleCreateAndAdd} className="mt-1 flex gap-1.5 border-t border-border pt-2">
                <input
                  type="text"
                  placeholder="New collection…"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className={`w-full ${inputClass}`}
                />
                <button type="submit" disabled={!newName.trim()} className={buttonClass("secondary")}>
                  Add
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

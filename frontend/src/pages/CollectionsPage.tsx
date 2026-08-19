import { FolderIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type SubmitEvent } from "react";
import { Link } from "react-router-dom";
import { createCollection, deleteCollection, listCollections } from "../api/collections";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAsync } from "../hooks/useAsync";
import { buttonClass, errorBannerClass, inputClass } from "../styles";
import { useToast } from "../toast/ToastContext";

export function CollectionsPage() {
  const { data: collections, loading, error, reload } = useAsync(listCollections);
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const handleCreate = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    createCollection(name)
      .then(() => {
        setNewName("");
        reload();
      })
      .catch(() => showToast("Failed to create collection"));
  };

  const confirmDelete = () => {
    if (pendingDeleteId === null) return;
    deleteCollection(pendingDeleteId)
      .then(() => {
        setPendingDeleteId(null);
        reload();
      })
      .catch(() => showToast("Failed to delete collection"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink">Collections</h1>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
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
      </div>

      {error && <p className={errorBannerClass}>{error}</p>}

      {!loading && collections?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-citrus-50 text-citrus-500 dark:bg-citrus-500/15 dark:text-citrus-400">
            <FolderIcon size={56} />
          </div>
          <h2 className="font-display text-lg font-bold text-ink">No collections yet</h2>
          <p className="max-w-xs text-sm text-ink-muted">
            Group your recipes into collections like "Weeknight dinners" or
            "Holiday baking" using the form above.
          </p>
        </div>
      )}

      {collections && collections.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {collections.map((collection) => (
            <li key={collection.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link
                to={`/collections/${collection.id}`}
                className="flex min-w-0 items-center gap-2 text-ink hover:text-citrus-600"
              >
                <FolderIcon size={20} className="flex-shrink-0 text-citrus-500" />
                <span className="truncate font-medium">{collection.name}</span>
                <span className="flex-shrink-0 text-sm text-ink-muted">
                  ({collection.recipeCount})
                </span>
              </Link>
              <button
                type="button"
                aria-label={`Delete ${collection.name}`}
                onClick={() => setPendingDeleteId(collection.id)}
                className={buttonClass("ghost")}
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this collection?"
        message="The recipes in it aren't deleted, just ungrouped."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

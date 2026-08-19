import { ArrowLeftIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteCollection,
  getCollectionRecipes,
  removeRecipeFromCollection,
  renameCollection,
} from "../api/collections";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecipeCard } from "../components/RecipeCard";
import { useAsync } from "../hooks/useAsync";
import { buttonClass, errorBannerClass, inputClass } from "../styles";
import { useToast } from "../toast/ToastContext";

export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const collectionId = Number(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const fetchCollection = useCallback(() => getCollectionRecipes(collectionId), [collectionId]);
  const { data, loading, error, reload } = useAsync(fetchCollection);

  const confirmDelete = useCallback(() => {
    deleteCollection(collectionId)
      .then(() => navigate("/collections"))
      .catch(() => showToast("Failed to delete collection"));
  }, [collectionId, navigate, showToast]);

  const handleRemoveRecipe = (recipeId: number) => {
    removeRecipeFromCollection(collectionId, recipeId)
      .then(reload)
      .catch(() => showToast("Failed to remove recipe from collection"));
  };

  const startRenaming = () => {
    if (!data) return;
    setNameDraft(data.collection.name);
    setRenaming(true);
  };

  const submitRename = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;

    renameCollection(collectionId, name)
      .then(() => {
        setRenaming(false);
        reload();
      })
      .catch(() => showToast("Failed to rename collection"));
  };

  if (loading) {
    return null;
  }
  if (error) {
    return <p className={errorBannerClass}>{error}</p>;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/collections"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon size={16} />
        All collections
      </Link>

      <div className="flex items-center justify-between gap-3">
        {renaming ? (
          <form onSubmit={submitRename} className="flex flex-1 gap-2">
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              autoFocus
              className={`w-full max-w-xs ${inputClass}`}
            />
            <button type="submit" disabled={!nameDraft.trim()} className={buttonClass("primary")}>
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)} className={buttonClass("ghost")}>
              Cancel
            </button>
          </form>
        ) : (
          <h1 className="font-display text-2xl font-extrabold text-ink">{data.collection.name}</h1>
        )}
        {!renaming && (
          <div className="flex flex-shrink-0 gap-2">
            <button type="button" onClick={startRenaming} className={buttonClass("secondary")}>
              <PencilSimpleIcon size={16} />
              Rename
            </button>
            <button type="button" onClick={() => setConfirmingDelete(true)} className={buttonClass("ghost")}>
              <TrashIcon size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      {data.recipes.length === 0 ? (
        <p className="text-sm text-ink-muted">No recipes in this collection yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onRemove={() => handleRemoveRecipe(recipe.id)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this collection?"
        message="The recipes in it aren't deleted, just ungrouped."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

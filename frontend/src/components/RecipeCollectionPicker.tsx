import { FolderIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { listCollections } from "../api/collections";
import { moveRecipeCollection } from "../api/recipes";
import { useAsync } from "../hooks/useAsync";
import { sectionHeadingClass } from "../styles";
import { useToast } from "../toast/ToastContext";
import { CollectionBreadcrumb } from "./CollectionBreadcrumb";
import { CollectionSelect } from "./CollectionSelect";

interface RecipeCollectionPickerProps {
  recipeId: number;
  /** `null` = the recipe sits at Home. */
  collectionId: number | null;
  onMoved: () => void;
}

/** Shows where a recipe lives in the library and lets it be moved — to a
 * different collection, or back to Home. */
export function RecipeCollectionPicker({
  recipeId,
  collectionId,
  onMoved,
}: Readonly<RecipeCollectionPickerProps>) {
  const { data: collections } = useAsync(listCollections);
  const { showToast } = useToast();
  const [moving, setMoving] = useState(false);

  const handleMove = useCallback(
    (nextCollectionId: number | null) => {
      if (nextCollectionId === collectionId) {
        return;
      }
      setMoving(true);
      moveRecipeCollection(recipeId, nextCollectionId)
        .then(onMoved)
        .catch(() => showToast("Failed to move recipe"))
        .finally(() => setMoving(false));
    },
    [collectionId, onMoved, recipeId, showToast],
  );

  if (!collections) {
    return null;
  }

  return (
    <section>
      <h2 className={sectionHeadingClass}>
        <FolderIcon size={20} className="text-sauce-500" />
        Collection
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <CollectionBreadcrumb collections={collections} collectionId={collectionId} className="text-ink" />
        <label htmlFor={`move-recipe-${recipeId}`} className="sr-only">
          Move to a different collection
        </label>
        <CollectionSelect
          id={`move-recipe-${recipeId}`}
          collections={collections}
          value={collectionId}
          onChange={handleMove}
          placeholderLabel="Home (top level)"
          className="w-auto rounded-sm border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sauce-500 focus:ring-offset-2 focus:ring-offset-transparent"
        />
        {moving && <span className="text-xs text-ink-faint">Moving…</span>}
      </div>
    </section>
  );
}

import { FolderIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { listCollections } from "../api/collections";
import { moveRecipeCollection } from "../api/recipes";
import { useAsync } from "../hooks/useAsync";
import { collectionBreadcrumb } from "../lib/collectionTree";
import { sectionHeadingClass } from "../styles";
import { useToast } from "../toast/ToastContext";
import { CollectionSelect } from "./CollectionSelect";

interface RecipeCollectionPickerProps {
  recipeId: number;
  collectionId: number;
  onMoved: () => void;
}

/** Shows which collection a recipe lives in and lets it be moved to a
 * different one. A recipe always belongs to exactly one collection, so
 * unlike the old chips-and-popover editor this replaces, there's no "remove"
 * affordance — only reassignment. */
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
      if (nextCollectionId === null || nextCollectionId === collectionId) {
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

  const trail = collectionBreadcrumb(collections, collectionId);

  return (
    <section>
      <h2 className={sectionHeadingClass}>
        <FolderIcon size={20} className="text-sauce-500" />
        Collection
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="flex flex-wrap items-center gap-1 text-sm text-ink">
          {trail.map((collection, index) => (
            <span key={collection.id} className="flex items-center gap-1">
              {index > 0 && <span className="text-ink-faint">/</span>}
              <Link to={`/collections/${collection.id}`} className="hover:text-sauce-600">
                {collection.name}
              </Link>
            </span>
          ))}
        </p>
        <label htmlFor={`move-recipe-${recipeId}`} className="sr-only">
          Move to a different collection
        </label>
        <CollectionSelect
          id={`move-recipe-${recipeId}`}
          collections={collections}
          value={collectionId}
          onChange={handleMove}
          className="w-auto rounded-sm border border-border bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sauce-500 focus:ring-offset-2 focus:ring-offset-transparent"
        />
        {moving && <span className="text-xs text-ink-faint">Moving…</span>}
      </div>
    </section>
  );
}

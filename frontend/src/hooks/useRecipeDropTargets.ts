import { useCallback, useState, type DragEvent } from "react";
import { getDraggedRecipeId, isRecipeDrag } from "../lib/recipeDrag";

/** A folder a recipe card can be dropped on — a collection id, or `null`
 * for Home. */
export type FolderTarget = number | null;

export interface DropTargetProps {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

/** Shared drag-and-drop wiring for every folder drop target on a page
 * (sub-collection rows, breadcrumb crumbs) — see
 * docs/design-system.md#drag-and-drop-moving-a-recipe-between-collections.
 * `dropTargetProps(target)` is spread onto an element to make it a target;
 * `isActive(target)` says whether a drag is currently hovering it. */
export function useRecipeDropTargets(
  onDropRecipe: (recipeId: number, target: FolderTarget) => void,
) {
  // `undefined` = nothing hovered; `null` is a real target (Home).
  const [hovered, setHovered] = useState<FolderTarget | undefined>(undefined);

  const dropTargetProps = useCallback(
    (target: FolderTarget): DropTargetProps => ({
      onDragOver: (event) => {
        // dragover can't read the payload (getData() is drop-only), only
        // whether a recipe-card drag is in progress at all -- enough to
        // decide whether this target should light up.
        if (!isRecipeDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHovered(target);
      },
      onDragLeave: () => setHovered((current) => (current === target ? undefined : current)),
      onDrop: (event) => {
        event.preventDefault();
        setHovered(undefined);
        const recipeId = getDraggedRecipeId(event.dataTransfer);
        if (recipeId !== null) onDropRecipe(recipeId, target);
      },
    }),
    [onDropRecipe],
  );

  const isActive = useCallback((target: FolderTarget) => hovered === target, [hovered]);

  return { dropTargetProps, isActive };
}

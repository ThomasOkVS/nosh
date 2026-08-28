// A dedicated MIME type for the drag payload, rather than relying on
// `RecipeCard`'s native link-drag default (an `<a>` is natively draggable,
// and browsers default its payload to the link's own href/URL). Every drop
// target reads only this type, so a stray drag that isn't a recipe card
// (an ordinary link, a text selection) is never mistaken for one.
export const RECIPE_DRAG_MIME_TYPE = "application/x-nosh-recipe-id";

export function setDraggedRecipeId(dataTransfer: DataTransfer, recipeId: number): void {
  dataTransfer.setData(RECIPE_DRAG_MIME_TYPE, String(recipeId));
  dataTransfer.effectAllowed = "move";
}

export function getDraggedRecipeId(dataTransfer: DataTransfer): number | null {
  const raw = dataTransfer.getData(RECIPE_DRAG_MIME_TYPE);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** `dragover` handlers can't read `getData()` (browsers only expose it on
 * `drop`, for security) — `types` is the one thing readable throughout the
 * whole drag, and is enough to tell "is this a recipe card?" apart from any
 * other draggable thing (a plain link, selected text) before deciding
 * whether to show drop-target hover styling. */
export function isRecipeDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(RECIPE_DRAG_MIME_TYPE);
}

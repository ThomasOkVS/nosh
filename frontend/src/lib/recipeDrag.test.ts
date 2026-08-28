import { describe, expect, it } from "vitest";
import { getDraggedRecipeId, isRecipeDrag, RECIPE_DRAG_MIME_TYPE, setDraggedRecipeId } from "./recipeDrag";

// jsdom doesn't implement a real DataTransfer, so tests (here and anywhere
// that fires drag events) use a minimal stand-in covering just the surface
// this module actually touches.
function fakeDataTransfer(initial: Record<string, string> = {}): DataTransfer {
  const store = { ...initial };
  return {
    effectAllowed: "none",
    dropEffect: "none",
    types: Object.keys(store),
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
  } as unknown as DataTransfer;
}

describe("recipeDrag", () => {
  it("round-trips a recipe id through setData/getData", () => {
    const dataTransfer = fakeDataTransfer();
    setDraggedRecipeId(dataTransfer, 42);

    expect(dataTransfer.getData(RECIPE_DRAG_MIME_TYPE)).toBe("42");
    expect(dataTransfer.effectAllowed).toBe("move");
  });

  it("getDraggedRecipeId returns null when the payload is missing or malformed", () => {
    expect(getDraggedRecipeId(fakeDataTransfer())).toBeNull();
    expect(getDraggedRecipeId(fakeDataTransfer({ [RECIPE_DRAG_MIME_TYPE]: "not-a-number" }))).toBeNull();
  });

  it("isRecipeDrag distinguishes a recipe-card drag from any other drag", () => {
    const dataTransfer = fakeDataTransfer();
    setDraggedRecipeId(dataTransfer, 1);
    // setData doesn't update `types` on this fake the way a real
    // DataTransfer does -- rebuild it the way a real dragover handler would
    // actually see it (types populated up front, from dragstart onward).
    const withType = fakeDataTransfer({ [RECIPE_DRAG_MIME_TYPE]: "1" });
    expect(isRecipeDrag(withType)).toBe(true);

    const plainLinkDrag = fakeDataTransfer({ "text/uri-list": "https://example.com" });
    expect(isRecipeDrag(plainLinkDrag)).toBe(false);
  });
});

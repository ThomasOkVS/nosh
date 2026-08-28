import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import * as recipesApi from "../api/recipes";
import type { Collection, Recipe } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeCollectionPicker } from "./RecipeCollectionPicker";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    parentId: null,
    name: "Weeknight dinners",
    createdAt: "2026-01-01T00:00:00Z",
    recipeCount: 1,
    ...overrides,
  };
}

function renderPicker(collectionId: number, onMoved: () => void) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <RecipeCollectionPicker recipeId={7} collectionId={collectionId} onMoved={onMoved} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("RecipeCollectionPicker", () => {
  it("shows the breadcrumb trail for the recipe's current collection", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
      makeCollection({ id: 2, name: "Cookies", parentId: 1 }),
    ]);

    renderPicker(2, vi.fn());

    expect(await screen.findByRole("link", { name: "Baking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookies" })).toBeInTheDocument();
  });

  it("moves the recipe to a different collection when a new one is selected", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking" }),
      makeCollection({ id: 2, name: "Desserts" }),
    ]);
    const move = vi
      .spyOn(recipesApi, "moveRecipeCollection")
      .mockResolvedValue({ collectionId: 2 } as Recipe);
    const onMoved = vi.fn();

    renderPicker(1, onMoved);
    await screen.findByRole("link", { name: "Baking" });

    fireEvent.change(screen.getByLabelText(/move to a different collection/i), {
      target: { value: "2" },
    });

    expect(move).toHaveBeenCalledWith(7, 2);
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
  });
});

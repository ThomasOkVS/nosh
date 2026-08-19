import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import * as recipesApi from "../api/recipes";
import type { Collection, RecipeCollectionSummary } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeCollectionsEditor } from "./RecipeCollectionsEditor";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return { id: 1, name: "Weeknight dinners", createdAt: "2026-01-01T00:00:00Z", recipeCount: 1, ...overrides };
}

function renderEditor() {
  return render(
    <ToastProvider>
      <RecipeCollectionsEditor recipeId={7} />
    </ToastProvider>,
  );
}

describe("RecipeCollectionsEditor", () => {
  it("renders current memberships as chips", async () => {
    vi.spyOn(recipesApi, "listRecipeCollections").mockResolvedValue([
      { id: 1, name: "Weeknight dinners" },
    ]);
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);

    renderEditor();

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
  });

  it("removes a membership when its chip's remove button is clicked", async () => {
    vi.spyOn(recipesApi, "listRecipeCollections")
      .mockResolvedValueOnce([{ id: 1, name: "Weeknight dinners" }])
      .mockResolvedValueOnce([]);
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    const remove = vi.spyOn(collectionsApi, "removeRecipeFromCollection").mockResolvedValue(undefined);

    renderEditor();
    await screen.findByText("Weeknight dinners");

    fireEvent.click(screen.getByRole("button", { name: /remove from weeknight dinners/i }));

    expect(remove).toHaveBeenCalledWith(1, 7);
    await waitFor(() => expect(screen.queryByText("Weeknight dinners")).not.toBeInTheDocument());
  });

  it("lists non-member collections in the add popover and adds one", async () => {
    const memberships: RecipeCollectionSummary[] = [];
    vi.spyOn(recipesApi, "listRecipeCollections")
      .mockResolvedValueOnce(memberships)
      .mockResolvedValueOnce([{ id: 2, name: "Desserts" }]);
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 2, name: "Desserts", recipeCount: 0 }),
    ]);
    const add = vi.spyOn(collectionsApi, "addRecipeToCollection").mockResolvedValue(undefined);

    renderEditor();
    await screen.findByRole("button", { name: /add to collection/i });

    fireEvent.click(screen.getByRole("button", { name: /add to collection/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Desserts" }));

    expect(add).toHaveBeenCalledWith(2, 7);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("creates a new collection and adds the recipe to it", async () => {
    vi.spyOn(recipesApi, "listRecipeCollections")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3, name: "Brand new" }]);
    vi.spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCollection({ id: 3, name: "Brand new", recipeCount: 1 })]);
    const create = vi.spyOn(collectionsApi, "createCollection").mockResolvedValue(
      makeCollection({ id: 3, name: "Brand new", recipeCount: 0 }),
    );
    const add = vi.spyOn(collectionsApi, "addRecipeToCollection").mockResolvedValue(undefined);

    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: /add to collection/i }));

    fireEvent.change(screen.getByPlaceholderText("New collection…"), {
      target: { value: "Brand new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(create).toHaveBeenCalledWith("Brand new");
    // Unlike handleAdd, this handler calls addRecipeToCollection inside
    // createCollection's own .then(), so it lands a microtask later than
    // the synchronous fireEvent.click above.
    await waitFor(() => expect(add).toHaveBeenCalledWith(3, 7));
  });
});

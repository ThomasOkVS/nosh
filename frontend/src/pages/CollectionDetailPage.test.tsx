import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import type { Collection, Recipe } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { CollectionDetailPage } from "./CollectionDetailPage";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    name: "Weeknight dinners",
    createdAt: "2026-01-01T00:00:00Z",
    recipeCount: 1,
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    userId: 1,
    title: "Tomato soup",
    description: null,
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    sourceUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ingredients: [],
    steps: [],
    tags: [],
    images: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/collections/1"]}>
        <Routes>
          <Route path="/collections" element={<p>All collections page</p>} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("CollectionDetailPage", () => {
  it("renders the collection's recipes", async () => {
    vi.spyOn(collectionsApi, "getCollectionRecipes").mockResolvedValue({
      collection: makeCollection(),
      recipes: [makeRecipe()],
    });

    renderPage();

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(screen.getByText("Tomato soup")).toBeInTheDocument();
  });

  it("shows an empty state with no recipes", async () => {
    vi.spyOn(collectionsApi, "getCollectionRecipes").mockResolvedValue({
      collection: makeCollection({ recipeCount: 0 }),
      recipes: [],
    });

    renderPage();

    expect(await screen.findByText(/no recipes in this collection yet/i)).toBeInTheDocument();
  });

  it("removes a recipe from the collection and drops it from the grid", async () => {
    vi.spyOn(collectionsApi, "getCollectionRecipes")
      .mockResolvedValueOnce({ collection: makeCollection(), recipes: [makeRecipe()] })
      .mockResolvedValueOnce({ collection: makeCollection({ recipeCount: 0 }), recipes: [] });
    const remove = vi.spyOn(collectionsApi, "removeRecipeFromCollection").mockResolvedValue(undefined);

    renderPage();
    await screen.findByText("Tomato soup");

    fireEvent.click(screen.getByRole("button", { name: /remove tomato soup/i }));

    expect(remove).toHaveBeenCalledWith(1, 1);
    expect(await screen.findByText(/no recipes in this collection yet/i)).toBeInTheDocument();
  });

  it("deletes the collection and navigates back to the collections list", async () => {
    vi.spyOn(collectionsApi, "getCollectionRecipes").mockResolvedValue({
      collection: makeCollection(),
      recipes: [],
    });
    const deleteCollection = vi.spyOn(collectionsApi, "deleteCollection").mockResolvedValue(undefined);

    renderPage();
    await screen.findByText("Weeknight dinners");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialogDeleteButton = screen.getAllByRole("button", { name: "Delete" }).at(-1)!;
    fireEvent.click(dialogDeleteButton);

    expect(deleteCollection).toHaveBeenCalledWith(1);
    expect(await screen.findByText("All collections page")).toBeInTheDocument();
  });

  it("renames the collection", async () => {
    vi.spyOn(collectionsApi, "getCollectionRecipes")
      .mockResolvedValueOnce({ collection: makeCollection(), recipes: [] })
      .mockResolvedValueOnce({ collection: makeCollection({ name: "Quick dinners" }), recipes: [] });
    const rename = vi.spyOn(collectionsApi, "renameCollection").mockResolvedValue(
      makeCollection({ name: "Quick dinners" }),
    );

    renderPage();
    await screen.findByText("Weeknight dinners");

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByDisplayValue("Weeknight dinners");
    fireEvent.change(input, { target: { value: "Quick dinners" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(rename).toHaveBeenCalledWith(1, "Quick dinners");
    expect(await screen.findByText("Quick dinners")).toBeInTheDocument();
  });
});

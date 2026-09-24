import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import * as recipesApi from "../api/recipes";
import type { Collection, Recipe } from "../api/types";
import { ImportProvider } from "../import/ImportProvider";
import { RECIPE_DRAG_MIME_TYPE } from "../lib/recipeDrag";
import { ToastProvider } from "../toast/ToastProvider";
import { CollectionsPage } from "./CollectionsPage";

// jsdom's DataTransfer doesn't behave like a real browser's -- see
// lib/recipeDrag.test.ts. `types` is populated up front here (unlike a real
// drag, where it fills in as setData() is called) since dragover handlers
// only ever read `types`, never the payload itself.
function fakeRecipeDataTransfer(recipeId: number): DataTransfer {
  const store: Record<string, string> = { [RECIPE_DRAG_MIME_TYPE]: String(recipeId) };
  return {
    types: [RECIPE_DRAG_MIME_TYPE],
    dropEffect: "none",
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
  } as unknown as DataTransfer;
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    parentId: null,
    name: "Weeknight dinners",
    createdAt: "2026-01-01T00:00:00Z",
    recipeCount: 2,
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    userId: 1,
    collectionId: 1,
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

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <ImportProvider>
          <Routes>
            <Route path="/" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionsPage />} />
          </Routes>
        </ImportProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function mockRecipes(recipes: Recipe[] = []) {
  return vi.spyOn(recipesApi, "listRecipes").mockResolvedValue(recipes);
}

describe("CollectionsPage — Home (/)", () => {
  it("shows top-level collections and the recipes filed directly at Home", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    const list = mockRecipes([makeRecipe({ collectionId: null, title: "Loose soup" })]);

    renderAt("/");

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(await screen.findByText("Loose soup")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ collection: "root" });
  });

  it("only lists root-level collections, not nested ones", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
      makeCollection({ id: 2, name: "Cookies", parentId: 1, recipeCount: 0 }),
    ]);
    mockRecipes();

    renderAt("/");

    expect(await screen.findByText("Baking")).toBeInTheDocument();
    expect(screen.queryByText("Cookies")).not.toBeInTheDocument();
  });

  it("shows an empty state when the library has nothing in it", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
    mockRecipes();

    renderAt("/");

    expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument();
  });

  it("offers New recipe straight into Home", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
    mockRecipes();

    renderAt("/");

    expect(await screen.findByRole("link", { name: /new recipe/i })).toHaveAttribute(
      "href",
      "/recipes/new",
    );
  });

  it("creates a root-level collection and reloads the list", async () => {
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCollection()]);
    mockRecipes();
    const create = vi.spyOn(collectionsApi, "createCollection").mockResolvedValue(makeCollection());

    renderAt("/");
    await screen.findByText(/your library is empty/i);

    fireEvent.change(screen.getByPlaceholderText("New collection…"), {
      target: { value: "Weeknight dinners" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith("Weeknight dinners", null);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("CollectionsPage — a collection (/collections/:id)", () => {
  it("renders a collection's sub-collections and its direct recipes", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection(),
      makeCollection({ id: 2, name: "Soups", parentId: 1, recipeCount: 0 }),
    ]);
    const list = mockRecipes([makeRecipe()]);

    renderAt("/collections/1");

    expect(await screen.findByRole("heading", { name: "Weeknight dinners" })).toBeInTheDocument();
    expect(screen.getByText("Soups")).toBeInTheDocument();
    expect(await screen.findByText("Tomato soup")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ collection: 1 });
  });

  it("offers New recipe pre-filed into this collection", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    mockRecipes();

    renderAt("/collections/1");

    expect(await screen.findByRole("link", { name: /new recipe/i })).toHaveAttribute(
      "href",
      "/recipes/new?collection=1",
    );
  });

  it("moves a recipe to a sub-collection when dropped on its row", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection(),
      makeCollection({ id: 2, name: "Soups", parentId: 1, recipeCount: 0 }),
    ]);
    const list = mockRecipes([makeRecipe({ id: 5 })]);
    const move = vi
      .spyOn(recipesApi, "moveRecipeCollection")
      .mockResolvedValue(makeRecipe({ id: 5 }));

    renderAt("/collections/1");
    await screen.findByText("Soups");

    fireEvent.drop(screen.getByText("Soups").closest("li")!, {
      dataTransfer: fakeRecipeDataTransfer(5),
    });

    expect(move).toHaveBeenCalledWith(5, 2);
    // Wait for the post-move reload to settle inside this test.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("moves a recipe to an ancestor when dropped on its breadcrumb crumb", async () => {
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValue([
        makeCollection({ id: 1, name: "Baking", parentId: null }),
        makeCollection({ id: 2, name: "Cookies", parentId: 1 }),
      ]);
    mockRecipes([makeRecipe({ id: 9, collectionId: 2 })]);
    const move = vi
      .spyOn(recipesApi, "moveRecipeCollection")
      .mockResolvedValue(makeRecipe({ id: 9 }));

    renderAt("/collections/2");
    await screen.findByRole("heading", { name: "Cookies" });

    fireEvent.drop(screen.getByRole("link", { name: "Baking" }), {
      dataTransfer: fakeRecipeDataTransfer(9),
    });

    expect(move).toHaveBeenCalledWith(9, 1);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("moves a recipe to Home when dropped on the Home crumb", async () => {
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValue([makeCollection({ id: 1, name: "Baking", parentId: null })]);
    mockRecipes([makeRecipe({ id: 5 })]);
    const move = vi
      .spyOn(recipesApi, "moveRecipeCollection")
      .mockResolvedValue(makeRecipe({ id: 5 }));

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Baking" });

    fireEvent.drop(screen.getByRole("link", { name: "Home" }), {
      dataTransfer: fakeRecipeDataTransfer(5),
    });

    expect(move).toHaveBeenCalledWith(5, null);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("does not offer the current collection's own crumb as a drop target", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
    ]);
    mockRecipes([makeRecipe({ id: 5 })]);
    const move = vi
      .spyOn(recipesApi, "moveRecipeCollection")
      .mockResolvedValue(makeRecipe({ id: 5 }));

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Baking" });

    fireEvent.drop(screen.getByRole("link", { name: "Baking" }), {
      dataTransfer: fakeRecipeDataTransfer(5),
    });

    expect(move).not.toHaveBeenCalled();
  });

  it("shows an empty state when a collection has no sub-collections or recipes", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    mockRecipes();

    renderAt("/collections/1");

    expect(await screen.findByText(/this collection is empty/i)).toBeInTheDocument();
  });

  it("creates a sub-collection inside the currently viewed collection", async () => {
    const list = vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    mockRecipes();
    const create = vi
      .spyOn(collectionsApi, "createCollection")
      .mockResolvedValue(makeCollection({ id: 2, name: "Soups", parentId: 1 }));

    renderAt("/collections/1");
    await screen.findByText(/this collection is empty/i);

    fireEvent.change(screen.getByPlaceholderText("New sub-collection…"), {
      target: { value: "Soups" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(create).toHaveBeenCalledWith("Soups", 1);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("renames a collection", async () => {
    vi.spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([makeCollection()])
      .mockResolvedValueOnce([makeCollection({ name: "Quick dinners" })]);
    mockRecipes();
    const update = vi
      .spyOn(collectionsApi, "updateCollection")
      .mockResolvedValue(makeCollection({ name: "Quick dinners" }));

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Weeknight dinners" });

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByDisplayValue("Weeknight dinners"), {
      target: { value: "Quick dinners" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(1, "Quick dinners", null);
    expect(await screen.findByRole("heading", { name: "Quick dinners" })).toBeInTheDocument();
  });

  it("deletes a collection, warning about what's inside it, and navigates to its parent", async () => {
    vi.spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([
        makeCollection({ id: 1, name: "Baking", parentId: null }),
        makeCollection({ id: 2, name: "Cookies", parentId: 1, recipeCount: 3 }),
      ])
      .mockResolvedValue([makeCollection({ id: 1, name: "Baking", parentId: null })]);
    mockRecipes();
    const deleteCollection = vi
      .spyOn(collectionsApi, "deleteCollection")
      .mockResolvedValue(undefined);

    renderAt("/collections/2");
    await screen.findByRole("heading", { name: "Cookies" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/this deletes 3 recipes inside it/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    expect(deleteCollection).toHaveBeenCalledWith(2);
    expect(await screen.findByRole("heading", { name: "Baking" })).toBeInTheDocument();
  });

  it("deletes a root-level collection and reflects that on Home", async () => {
    // Regression test (2026-08-28): Home kept showing an already-deleted
    // collection because the collections list wasn't reloaded after delete.
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([makeCollection({ id: 1, name: "Baking", parentId: null })])
      .mockResolvedValueOnce([]);
    mockRecipes();
    const deleteCollection = vi
      .spyOn(collectionsApi, "deleteCollection")
      .mockResolvedValue(undefined);

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Baking" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    expect(deleteCollection).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/your library is empty/i)).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("says so when the collection doesn't exist (or isn't yours)", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
    mockRecipes();

    renderAt("/collections/99");

    expect(await screen.findByText("Collection not found")).toBeInTheDocument();
  });
});

describe("CollectionsPage — search mode (?q / ?tag)", () => {
  const tree = [
    makeCollection({ id: 1, name: "Baking", parentId: null }),
    makeCollection({ id: 2, name: "Cookies", parentId: 1 }),
  ];

  it("searches this collection and everything below it, labelling where each result lives", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue(tree);
    const search = vi
      .spyOn(recipesApi, "searchRecipes")
      .mockResolvedValue([makeRecipe({ title: "Chocolate cookies", collectionId: 2 })]);

    renderAt("/collections/1?q=chocolate");

    expect(await screen.findByText("Chocolate cookies")).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("chocolate", { tag: undefined, within: 1 });
    expect(await screen.findByText("Home / Baking / Cookies")).toBeInTheDocument();
    // The create-collection form is browse-only.
    expect(screen.queryByPlaceholderText(/new sub-collection/i)).not.toBeInTheDocument();
  });

  it("offers a Search everywhere link that drops the folder scope", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue(tree);
    vi.spyOn(recipesApi, "searchRecipes").mockResolvedValue([]);

    renderAt("/collections/2?q=chocolate&tag=dessert");

    expect(await screen.findByRole("link", { name: "Search everywhere" })).toHaveAttribute(
      "href",
      "/?q=chocolate&tag=dessert",
    );
    expect(await screen.findByText("No recipes match")).toBeInTheDocument();
  });

  it("filters the whole library by tag at Home, and the tag can be cleared", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue(tree);
    const list = vi
      .spyOn(recipesApi, "listRecipes")
      .mockResolvedValue([makeRecipe({ title: "Brownies", collectionId: 1 })]);

    renderAt("/?tag=dessert");

    expect(await screen.findByText("Brownies")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ tag: "dessert", within: undefined });
    expect(screen.queryByRole("link", { name: "Search everywhere" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove tag filter dessert/i }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ collection: "root" }));
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import * as recipesApi from "../api/recipes";
import type { Collection, CollectionContents, Recipe } from "../api/types";
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
        <Routes>
          <Route path="/" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<CollectionsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("CollectionsPage — home (/)", () => {
  it("lists top-level collections with their recipe counts", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);

    renderAt("/");

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("only lists root-level collections, not nested ones", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
      makeCollection({ id: 2, name: "Cookies", parentId: 1, recipeCount: 0 }),
    ]);

    renderAt("/");

    expect(await screen.findByText("Baking")).toBeInTheDocument();
    expect(screen.queryByText("Cookies")).not.toBeInTheDocument();
  });

  it("shows an empty state with no collections", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);

    renderAt("/");

    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
  });

  it("creates a root-level collection and reloads the list", async () => {
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCollection()]);
    const create = vi.spyOn(collectionsApi, "createCollection").mockResolvedValue(makeCollection());

    renderAt("/");
    await screen.findByText(/no collections yet/i);

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
  function contentsFor(overrides: Partial<CollectionContents> = {}): CollectionContents {
    return {
      collection: makeCollection(),
      subCollections: [],
      recipes: [],
      ...overrides,
    };
  }

  it("renders a collection's sub-collections and recipes together", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({
        subCollections: [makeCollection({ id: 2, name: "Soups", parentId: 1, recipeCount: 0 })],
        recipes: [makeRecipe()],
      }),
    );

    renderAt("/collections/1");

    expect(await screen.findByRole("heading", { name: "Weeknight dinners" })).toBeInTheDocument();
    expect(screen.getByText("Soups")).toBeInTheDocument();
    expect(screen.getByText("Tomato soup")).toBeInTheDocument();
  });

  it("moves a recipe to a sub-collection when dropped on its row", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    const contents = vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({
        subCollections: [makeCollection({ id: 2, name: "Soups", parentId: 1, recipeCount: 0 })],
        recipes: [makeRecipe({ id: 5 })],
      }),
    );
    const move = vi.spyOn(recipesApi, "moveRecipeCollection").mockResolvedValue(makeRecipe({ id: 5 }));

    renderAt("/collections/1");
    await screen.findByText("Soups");

    const dropTarget = screen.getByText("Soups").closest("li")!;
    fireEvent.drop(dropTarget, { dataTransfer: fakeRecipeDataTransfer(5) });

    expect(move).toHaveBeenCalledWith(5, 2);
    // Wait for the post-move reload() to settle, so its state update happens
    // inside this test, not after it.
    await waitFor(() => expect(contents).toHaveBeenCalledTimes(2));
  });

  it("moves a recipe to an ancestor when dropped on its breadcrumb crumb", async () => {
    const list = vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
      makeCollection({ id: 2, name: "Cookies", parentId: 1 }),
    ]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({
        collection: makeCollection({ id: 2, name: "Cookies", parentId: 1 }),
        recipes: [makeRecipe({ id: 9, collectionId: 2 })],
      }),
    );
    const move = vi.spyOn(recipesApi, "moveRecipeCollection").mockResolvedValue(makeRecipe({ id: 9 }));

    renderAt("/collections/2");
    await screen.findByRole("heading", { name: "Cookies" });

    fireEvent.drop(screen.getByRole("link", { name: "Baking" }), {
      dataTransfer: fakeRecipeDataTransfer(9),
    });

    expect(move).toHaveBeenCalledWith(9, 1);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("does not offer 'Home' or the current collection itself as a drop target", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
    ]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({
        collection: makeCollection({ id: 1, name: "Baking", parentId: null }),
        recipes: [makeRecipe({ id: 5 })],
      }),
    );
    const move = vi.spyOn(recipesApi, "moveRecipeCollection").mockResolvedValue(makeRecipe({ id: 5 }));

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Baking" });

    fireEvent.drop(screen.getByRole("link", { name: "Home" }), {
      dataTransfer: fakeRecipeDataTransfer(5),
    });

    expect(move).not.toHaveBeenCalled();
  });

  it("shows an empty state when a collection has no sub-collections or recipes", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(contentsFor());

    renderAt("/collections/1");

    expect(await screen.findByText(/this collection is empty/i)).toBeInTheDocument();
  });

  it("creates a sub-collection inside the currently viewed collection", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(contentsFor());
    const create = vi
      .spyOn(collectionsApi, "createCollection")
      .mockResolvedValue(makeCollection({ id: 2, name: "Soups", parentId: 1 }));
    const contents = vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(contentsFor());

    renderAt("/collections/1");
    await screen.findByText(/this collection is empty/i);

    fireEvent.change(screen.getByPlaceholderText("New collection…"), {
      target: { value: "Soups" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(create).toHaveBeenCalledWith("Soups", 1);
    // Wait for the post-create reload (reloadAll + reloadContents) to settle
    // so its state update happens inside this test, not after it.
    await waitFor(() => expect(contents).toHaveBeenCalledTimes(2));
  });

  it("renames a collection", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);
    vi.spyOn(collectionsApi, "getCollectionContents")
      .mockResolvedValueOnce(contentsFor())
      .mockResolvedValueOnce(contentsFor({ collection: makeCollection({ name: "Quick dinners" }) }));
    const update = vi.spyOn(collectionsApi, "updateCollection").mockResolvedValue(
      makeCollection({ name: "Quick dinners" }),
    );

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Weeknight dinners" });

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    const input = screen.getByDisplayValue("Weeknight dinners");
    fireEvent.change(input, { target: { value: "Quick dinners" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(1, "Quick dinners", null);
    expect(await screen.findByRole("heading", { name: "Quick dinners" })).toBeInTheDocument();
  });

  it("deletes a collection, warning about what's inside it, and navigates to its parent", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([
      makeCollection({ id: 1, name: "Baking", parentId: null }),
      makeCollection({ id: 2, name: "Cookies", parentId: 1, recipeCount: 3 }),
    ]);
    const contents = vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({
        collection: makeCollection({ id: 2, name: "Cookies", parentId: 1, recipeCount: 3 }),
      }),
    );
    const deleteCollection = vi.spyOn(collectionsApi, "deleteCollection").mockResolvedValue(undefined);

    renderAt("/collections/2");
    await screen.findByRole("heading", { name: "Cookies" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/this deletes 3 recipes inside it/i)).toBeInTheDocument();
    const dialogDeleteButton = screen.getAllByRole("button", { name: "Delete" }).at(-1)!;
    fireEvent.click(dialogDeleteButton);

    expect(deleteCollection).toHaveBeenCalledWith(2);
    // Wait for the post-delete navigate to its parent to settle, so the
    // resulting re-fetch (new :id param -> new getCollectionContents call)
    // happens inside this test, not after it.
    await waitFor(() => expect(contents).toHaveBeenCalledTimes(2));
  });

  it("deletes a root-level collection and reflects that on the home page it navigates back to", async () => {
    // Regression test: a root-level delete navigates to "/", where the home
    // view renders purely from `allCollections` (there's no `:id` param
    // change to piggyback a refetch off, unlike deleting a nested
    // collection above) -- caught live, not by an earlier version of this
    // test suite, when the home page kept showing an already-deleted
    // collection because only `getCollectionContents` was being reloaded,
    // not `listCollections`.
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([makeCollection({ id: 1, name: "Baking", parentId: null })])
      .mockResolvedValueOnce([]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockResolvedValue(
      contentsFor({ collection: makeCollection({ id: 1, name: "Baking", parentId: null }) }),
    );
    const deleteCollection = vi.spyOn(collectionsApi, "deleteCollection").mockResolvedValue(undefined);

    renderAt("/collections/1");
    await screen.findByRole("heading", { name: "Baking" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    expect(deleteCollection).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("404s when fetching another user's collection recipes", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
    vi.spyOn(collectionsApi, "getCollectionContents").mockRejectedValue(
      new Error("Collection not found"),
    );

    renderAt("/collections/99");

    expect(await screen.findByText("Collection not found")).toBeInTheDocument();
  });
});

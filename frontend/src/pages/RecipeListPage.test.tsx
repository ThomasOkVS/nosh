import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as recipesApi from "../api/recipes";
import type { Recipe } from "../api/types";
import { ImportProvider } from "../import/ImportProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeListPage } from "./RecipeListPage";

/** Exposes the router's current search string so a test can assert the
 * search query round-trips into the URL, without reaching into history
 * internals. */
function SearchProbe() {
  const location = useLocation();
  return <div data-testid="search-probe">{location.search}</div>;
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    userId: 1,
    title: "Tomato soup",
    description: null,
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
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

function renderPage(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <ImportProvider>
          <RecipeListPage />
          <SearchProbe />
        </ImportProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("RecipeListPage", () => {
  it("lists recipes fetched from the API", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe()]);

    renderPage();

    expect(await screen.findByText("Tomato soup")).toBeInTheDocument();
  });

  it("searches instead of listing once a query is typed", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe()]);
    const search = vi
      .spyOn(recipesApi, "searchRecipes")
      .mockResolvedValue([makeRecipe({ id: 2, title: "Pumpkin soup" })]);

    renderPage();
    await screen.findByText("Tomato soup");

    fireEvent.change(screen.getByPlaceholderText("Search recipes…"), { target: { value: "soup" } });

    expect(await screen.findByText("Pumpkin soup")).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("soup", undefined);
  });

  it("filters by a tag carried in the URL (e.g. from a tag clicked on a recipe card)", async () => {
    const list = vi
      .spyOn(recipesApi, "listRecipes")
      .mockResolvedValue([makeRecipe({ title: "Dessert-tagged soup" })]);

    renderPage(["/?tag=dessert"]);

    expect(await screen.findByText("Dessert-tagged soup")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith("dessert");
  });

  it("writes a typed search query into the URL so it's shareable/restorable", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([]);
    vi.spyOn(recipesApi, "searchRecipes").mockResolvedValue([makeRecipe({ title: "Pumpkin soup" })]);

    renderPage();
    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "soup" } });

    await screen.findByText("Pumpkin soup");
    expect(screen.getByTestId("search-probe")).toHaveTextContent("?q=soup");
  });

  it("restores a search query already present in the URL on load", async () => {
    const search = vi
      .spyOn(recipesApi, "searchRecipes")
      .mockResolvedValue([makeRecipe({ title: "Pumpkin soup" })]);

    renderPage(["/?q=soup"]);

    expect(await screen.findByText("Pumpkin soup")).toBeInTheDocument();
    expect(screen.getByLabelText("Search recipes")).toHaveValue("soup");
    expect(search).toHaveBeenCalledWith("soup", undefined);
  });
});

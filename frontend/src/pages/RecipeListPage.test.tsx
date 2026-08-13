import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as recipesApi from "../api/recipes";
import type { Recipe } from "../api/types";
import { ImportProvider } from "../import/ImportProvider";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeListPage } from "./RecipeListPage";

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

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ImportProvider>
          <RecipeListPage />
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
    expect(search).toHaveBeenCalledWith("soup");
  });
});

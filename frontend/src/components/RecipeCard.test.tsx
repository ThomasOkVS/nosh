import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../api/types";
import { RecipeCard } from "./RecipeCard";

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

function ListPageProbe() {
  const [params] = useSearchParams();
  return <p>List page (tag={params.get("tag") ?? "none"})</p>;
}

function renderCard(recipe: Recipe) {
  return render(
    <MemoryRouter initialEntries={["/card"]}>
      <Routes>
        <Route path="/" element={<ListPageProbe />} />
        <Route path="/card" element={<RecipeCard recipe={recipe} />} />
        <Route path="/recipes/:id" element={<p>Recipe detail page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecipeCard", () => {
  it("clicking a tag chip navigates to the tag-filtered list, not the recipe detail page", () => {
    renderCard(makeRecipe({ tags: ["soup"] }));

    fireEvent.click(screen.getByRole("button", { name: "soup" }));

    expect(screen.getByText("List page (tag=soup)")).toBeInTheDocument();
    expect(screen.queryByText("Recipe detail page")).not.toBeInTheDocument();
  });

  it("clicking the card itself navigates to the recipe detail page", () => {
    renderCard(makeRecipe());

    fireEvent.click(screen.getByText("Tomato soup"));

    expect(screen.getByText("Recipe detail page")).toBeInTheDocument();
  });

  it("renders a remove button and calls onRemove without navigating, when provided", () => {
    const onRemove = vi.fn();
    render(
      <MemoryRouter initialEntries={["/card"]}>
        <Routes>
          <Route path="/" element={<ListPageProbe />} />
          <Route path="/card" element={<RecipeCard recipe={makeRecipe()} onRemove={onRemove} />} />
          <Route path="/recipes/:id" element={<p>Recipe detail page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove tomato soup/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Recipe detail page")).not.toBeInTheDocument();
  });
});

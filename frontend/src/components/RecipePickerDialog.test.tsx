import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as recipesApi from "../api/recipes";
import type { Recipe } from "../api/types";
import { RecipePickerDialog } from "./RecipePickerDialog";

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

describe("RecipePickerDialog", () => {
  it("renders nothing when closed", () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([]);

    render(<RecipePickerDialog open={false} onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText("Add a recipe")).not.toBeInTheDocument();
  });

  it("lists recipes by default and calls onSelect with the chosen recipe's id", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe({ id: 7, title: "Belgian Waffles" })]);
    const onSelect = vi.fn();

    render(<RecipePickerDialog open onSelect={onSelect} onCancel={vi.fn()} />);

    fireEvent.click(await screen.findByText("Belgian Waffles"));

    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("searches instead of listing once a query is typed", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe({ title: "Tomato Soup" })]);
    const search = vi
      .spyOn(recipesApi, "searchRecipes")
      .mockResolvedValue([makeRecipe({ id: 9, title: "Pumpkin Soup" })]);

    render(<RecipePickerDialog open onSelect={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByText("Tomato Soup");

    fireEvent.change(screen.getByLabelText("Search recipes"), { target: { value: "soup" } });

    expect(await screen.findByText("Pumpkin Soup")).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("soup");
  });

  it("calls onCancel without selecting when the close button is clicked", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe({ title: "Tomato Soup" })]);
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<RecipePickerDialog open onSelect={onSelect} onCancel={onCancel} />);
    await screen.findByText("Tomato Soup");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onCancel when the backdrop is clicked", async () => {
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([]);
    const onCancel = vi.fn();

    render(<RecipePickerDialog open onSelect={vi.fn()} onCancel={onCancel} />);
    await screen.findByText("Add a recipe");

    fireEvent.click(screen.getByRole("dialog"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

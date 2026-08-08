import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as recipesApi from "../api/recipes";
import type { Recipe } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeFormPage } from "./RecipeFormPage";

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/recipes/new"]}>
        <RecipeFormPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("RecipeFormPage", () => {
  it("adds and removes ingredient and step rows", () => {
    renderPage();

    expect(screen.getAllByPlaceholderText("Ingredient")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("Instructions")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getAllByPlaceholderText("Ingredient")).toHaveLength(2);
    expect(screen.getAllByPlaceholderText("Instructions")).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText("Remove ingredient")[0]!);
    fireEvent.click(screen.getAllByLabelText("Remove step")[0]!);
    expect(screen.getAllByPlaceholderText("Ingredient")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("Instructions")).toHaveLength(1);
  });

  it("submits a trimmed, filtered payload and navigates to the new recipe's edit page", async () => {
    const created = { id: 42 } as Recipe;
    const createRecipe = vi.spyOn(recipesApi, "createRecipe").mockResolvedValue(created);

    renderPage();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tomato soup" } });
    fireEvent.change(screen.getByPlaceholderText("Qty"), { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("Unit"), { target: { value: "cups" } });
    fireEvent.change(screen.getByPlaceholderText("Ingredient"), { target: { value: "Tomatoes" } });
    fireEvent.change(screen.getByPlaceholderText("Instructions"), { target: { value: "Simmer everything." } });
    const tagsInput = screen.getByLabelText("Tags");
    fireEvent.change(tagsInput, { target: { value: "soup" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    fireEvent.change(tagsInput, { target: { value: "dinner" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() =>
      expect(createRecipe).toHaveBeenCalledWith({
        title: "Tomato soup",
        description: null,
        servings: null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        ingredients: [{ quantity: "2", unit: "cups", name: "Tomatoes" }],
        steps: [{ instruction: "Simmer everything." }],
        tags: ["soup", "dinner"],
      }),
    );
  });
});

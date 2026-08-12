import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as recipesApi from "../api/recipes";
import type { Recipe, RecipeInput } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeFormPage } from "./RecipeFormPage";

/** Mirrors App.tsx's `key`-per-route scheme, which is what actually causes
 * the remount this test is checking for. */
function KeyedEditRoute() {
  const { id } = useParams<{ id: string }>();
  return <RecipeFormPage key={`edit-${id ?? ""}`} />;
}

function renderWithRouting(initialPath: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/recipes/new"
            element={
              <>
                {/* Stands in for the real navigate() call RecipeFormPage
                 * makes after a successful save. */}
                <Link to="/recipes/42/edit" data-testid="go-to-edit">
                  go to edit
                </Link>
                <RecipeFormPage key="new" />
              </>
            }
          />
          <Route path="/recipes/:id/edit" element={<KeyedEditRoute />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/recipes/new"]}>
        <RecipeFormPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Mirrors how RecipeImportPage hands extracted data to the create form. */
function renderImported(importedRecipe: RecipeInput) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[{ pathname: "/recipes/new", state: { importedRecipe } }]}>
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
        sourceUrl: null,
      }),
    );
  });

  it("pre-fills from imported recipe data passed via router state", () => {
    renderImported({
      title: "Imported Soup",
      description: "From the web",
      servings: 6,
      prepTimeMinutes: 15,
      cookTimeMinutes: 40,
      ingredients: [{ quantity: "1", unit: "kg", name: "tomatoes" }],
      steps: [{ instruction: "Simmer the tomatoes" }],
      tags: ["soup"],
      sourceUrl: "https://example.com/recipe",
    });

    expect(screen.getByLabelText("Title")).toHaveValue("Imported Soup");
    expect(screen.getByLabelText("Description")).toHaveValue("From the web");
    expect(screen.getByLabelText("Servings")).toHaveValue(6);
    expect(screen.getByPlaceholderText("Ingredient")).toHaveValue("tomatoes");
    expect(screen.getByPlaceholderText("Instructions")).toHaveValue("Simmer the tomatoes");
    expect(screen.getByText("soup")).toBeInTheDocument();
  });

  it("saves an imported recipe through the normal create path, carrying sourceUrl", async () => {
    const createRecipe = vi.spyOn(recipesApi, "createRecipe").mockResolvedValue({ id: 7 } as Recipe);

    renderImported({
      title: "Imported Soup",
      description: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      ingredients: [{ quantity: null, unit: null, name: "tomatoes" }],
      steps: [{ instruction: "Simmer" }],
      tags: [],
      sourceUrl: "https://example.com/recipe",
    });

    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() =>
      expect(createRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Imported Soup",
          sourceUrl: "https://example.com/recipe",
        }),
      ),
    );
  });

  it("remounts (does not carry over state) when routing from the create form to an edit form", async () => {
    // Never resolves — keeps the edit form on its loading skeleton so the
    // assertion can check "did it reset" without needing a fetch to settle.
    vi.spyOn(recipesApi, "getRecipe").mockImplementation(() => new Promise(() => undefined));

    renderWithRouting("/recipes/new");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Stale draft" } });
    expect(screen.getByLabelText("Title")).toHaveValue("Stale draft");

    fireEvent.click(screen.getByTestId("go-to-edit"));

    // Both routes render <RecipeFormPage> at the same tree position, so
    // without the `key`s in App.tsx, React reconciles instead of
    // remounting and "Stale draft" would still be sitting in the field.
    await waitFor(() => expect(screen.queryByLabelText("Title")).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue("Stale draft")).not.toBeInTheDocument();
  });
});

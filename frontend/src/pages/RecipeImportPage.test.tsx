import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as importApi from "../api/import";
import type { RecipeInput } from "../api/types";
import { RecipeImportPage } from "./RecipeImportPage";

/** Stands in for RecipeFormPage so the test can assert on the router state
 * the import page hands over, without rendering the whole form. */
function StateProbe() {
  const { state } = useLocation() as { state?: { importedRecipe?: RecipeInput } };
  return <div data-testid="imported-title">{state?.importedRecipe?.title ?? "none"}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/recipes/import"]}>
      <Routes>
        <Route path="/recipes/import" element={<RecipeImportPage />} />
        <Route path="/recipes/new" element={<StateProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecipeImportPage", () => {
  it("shows the current stage while importing, calling out the AI wait", async () => {
    // Never resolves: keeps the page in its loading state so the stage
    // callback's effect on the UI can be observed.
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, onStage) =>
        new Promise(() => {
          onStage?.("fetching");
          onStage?.("ai");
        }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("Recipe URL"), {
      target: { value: "https://example.com/recipe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /asking the AI to read it/i,
    );
  });

  it("navigates to the create form with the extracted recipe on success", async () => {
    const recipe = { title: "Tomato Soup" } as RecipeInput;
    const importRecipeFromUrl = vi.spyOn(importApi, "importRecipeFromUrl").mockResolvedValue(recipe);

    renderPage();
    fireEvent.change(screen.getByLabelText("Recipe URL"), {
      target: { value: "https://example.com/recipe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));

    await waitFor(() =>
      expect(importRecipeFromUrl).toHaveBeenCalledWith(
        "https://example.com/recipe",
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByTestId("imported-title")).toHaveTextContent("Tomato Soup");
  });

  it("does not navigate on a stale response after the user has left the page", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveImport!: (recipe: RecipeInput) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, _onStage, signal) =>
        new Promise((resolve) => {
          capturedSignal = signal;
          resolveImport = resolve;
        }),
    );

    const { unmount } = renderPage();
    fireEvent.change(screen.getByLabelText("Recipe URL"), {
      target: { value: "https://example.com/recipe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));

    // The user navigates away (e.g. clicks "All recipes") before the import
    // settles — simulated here by unmounting the page.
    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    // The in-flight promise still resolves later; without the abort guard
    // this used to call navigate() into whatever page the user had since
    // moved to.
    resolveImport({ title: "Tomato Soup" } as RecipeInput);
    await Promise.resolve();
    // No assertion beyond "this doesn't throw" — there's nothing left
    // mounted to navigate, which is exactly the point.
  });

  it("lets the user cancel an in-progress import", async () => {
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, onStage) =>
        new Promise(() => {
          onStage?.("fetching");
        }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("Recipe URL"), {
      target: { value: "https://example.com/recipe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Import recipe" })).toBeEnabled();
  });

  it("shows the server's error message and stays on the page when import fails", async () => {
    vi.spyOn(importApi, "importRecipeFromUrl").mockRejectedValue(
      new ApiError(422, "No recipe could be found on that page"),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText("Recipe URL"), {
      target: { value: "https://example.com/not-a-recipe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));

    expect(await screen.findByText("No recipe could be found on that page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import recipe/ })).toBeEnabled();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as importApi from "../api/import";
import type { ImportJob } from "../api/import";
import type { RecipeInput } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { NewRecipePage } from "./NewRecipePage";

const RECIPE: RecipeInput = {
  title: "Shakshuka",
  description: null,
  servings: 2,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  ingredients: [{ quantity: "4", unit: null, name: "eggs" }],
  steps: [{ instruction: "Poach the eggs in the sauce" }],
  tags: [],
} as unknown as RecipeInput;

function makeJob(patch: Partial<ImportJob> = {}): ImportJob {
  return {
    id: 5,
    url: "https://example.com/shakshuka",
    collectionId: null,
    status: "done",
    seenStages: ["fetching", "structured-data"],
    recipe: RECIPE,
    imageUrl: null,
    translationSkipped: false,
    errorStatus: null,
    errorMessage: null,
    reviewed: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

function renderAt(entry: string | { pathname: string; search?: string; state?: unknown }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/recipes/new" element={<NewRecipePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("NewRecipePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is just the blank create form without an importId", () => {
    const getImport = vi.spyOn(importApi, "getImport");
    renderAt("/recipes/new");

    expect(screen.getByLabelText(/Title/)).toHaveValue("");
    expect(getImport).not.toHaveBeenCalled();
  });

  it("loads the import by id when cold-started from a notification (no router state)", async () => {
    vi.spyOn(importApi, "getImport").mockResolvedValue(makeJob());
    const markReviewed = vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt("/recipes/new?importId=5");

    expect(await screen.findByDisplayValue("Shakshuka")).toBeInTheDocument();
    expect(screen.getByDisplayValue("eggs")).toBeInTheDocument();
    expect(markReviewed).toHaveBeenCalledWith(5);
  });

  it("says when an import couldn't be translated", async () => {
    vi.spyOn(importApi, "getImport").mockResolvedValue(makeJob({ translationSkipped: true }));
    vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt("/recipes/new?importId=5");

    expect(await screen.findByRole("status")).toHaveTextContent(/couldn.t translate this recipe/i);
  });

  it("shows no translation notice for a normal import", async () => {
    vi.spyOn(importApi, "getImport").mockResolvedValue(makeJob());
    vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt("/recipes/new?importId=5");

    expect(await screen.findByDisplayValue("Shakshuka")).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t translate/i)).not.toBeInTheDocument();
  });

  it("uses router state when it's already there, without refetching", async () => {
    const getImport = vi.spyOn(importApi, "getImport");
    vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt({
      pathname: "/recipes/new",
      search: "?importId=5",
      state: { importedRecipe: RECIPE, importedImageUrl: null },
    });

    expect(await screen.findByDisplayValue("Shakshuka")).toBeInTheDocument();
    expect(getImport).not.toHaveBeenCalled();
  });

  it("explains when the import failed", async () => {
    vi.spyOn(importApi, "getImport").mockResolvedValue(
      makeJob({ status: "error", recipe: null, errorMessage: "No recipe could be found on that page" }),
    );
    vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt("/recipes/new?importId=5");

    expect(await screen.findByRole("alert")).toHaveTextContent("No recipe could be found on that page");
    expect(screen.getByRole("link", { name: "Start a blank recipe" })).toBeInTheDocument();
  });

  it("explains when the import no longer exists", async () => {
    vi.spyOn(importApi, "getImport").mockRejectedValue(new ApiError(404, "Import not found"));
    vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);

    renderAt("/recipes/new?importId=5");

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't available any more");
  });
});

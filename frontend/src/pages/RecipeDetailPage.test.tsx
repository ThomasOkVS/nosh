import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import * as recipesApi from "../api/recipes";
import * as settingsApi from "../api/settings";
import type { RecipePreferences } from "../api/settings";
import type { Recipe } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { RecipeDetailPage } from "./RecipeDetailPage";

const metric: RecipePreferences = {
  language: null,
  unitSystem: "metric",
  temperatureUnit: "C",
  keepSpoons: true,
};

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 7,
    userId: 1,
    collectionId: null,
    title: "Cottage cheese pancakes",
    description: null,
    servings: 4,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    sourceUrl: null,
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    ingredients: [
      { id: 1, position: 0, quantity: "150", unit: "g", name: "cottage cheese" },
      { id: 2, position: 1, quantity: "2", unit: null, name: "eggs" },
      { id: 3, position: 2, quantity: "1", unit: "cup", name: "milk" },
      { id: 4, position: 3, quantity: null, unit: null, name: "salt to taste" },
    ],
    steps: [{ id: 1, position: 0, instruction: "Heat the oven to 350°F." }],
    tags: [],
    images: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/recipes/7"]}>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function ingredientTexts(): Promise<string[]> {
  const heading = await screen.findByRole("heading", { name: /ingredients/i });
  const list = heading.closest("section")!.querySelector("ul")!;
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent!.replace(/^\d{2}/, "").trim());
}

beforeEach(() => {
  vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
  vi.spyOn(settingsApi, "getRecipePreferences").mockResolvedValue(metric);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecipeDetailPage — units", () => {
  it("shows amounts in the user's units and converts oven temperatures", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();

    expect(await screen.findByText("Heat the oven to 177°C.")).toBeInTheDocument();
    expect(await ingredientTexts()).toEqual([
      "150 g cottage cheese",
      "2 eggs",
      "236.59 ml milk",
      "salt to taste",
    ]);
  });

  it("shows US units when that's the preference", async () => {
    vi.spyOn(settingsApi, "getRecipePreferences").mockResolvedValue({
      ...metric,
      unitSystem: "us",
      temperatureUnit: "F",
    });
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();

    expect(await screen.findByText("Heat the oven to 350°F.")).toBeInTheDocument();
    expect(await ingredientTexts()).toEqual([
      "5.29 oz cottage cheese",
      "2 eggs",
      "1 cup milk",
      "salt to taste",
    ]);
  });
});

describe("RecipeDetailPage — scaling", () => {
  it("rescales every amount with the servings stepper", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "More servings" }));
    fireEvent.click(screen.getByRole("button", { name: "More servings" }));

    expect(screen.getByText("6 servings")).toBeInTheDocument();
    expect(screen.getByText(/Serves 6/)).toBeInTheDocument();
    expect(await ingredientTexts()).toEqual([
      "225 g cottage cheese",
      "3 eggs",
      "354.88 ml milk",
      "salt to taste",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByText("4 servings")).toBeInTheDocument();
  });

  it("scales from one ingredient, exactly (150 g → 200 g)", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /scale recipe from cottage cheese/i }),
    );
    const amount = screen.getByLabelText("I have");
    fireEvent.change(amount, { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Scale recipe" }));

    expect(screen.getByText("5.33 servings")).toBeInTheDocument();
    expect(await ingredientTexts()).toEqual([
      "200 g cottage cheese",
      "2.67 eggs",
      "315.45 ml milk",
      "salt to taste",
    ]);
  });

  it("accepts another unit of the same kind", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /scale recipe from cottage cheese/i }),
    );
    fireEvent.change(screen.getByLabelText("I have"), { target: { value: "0.3" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Unit" }), { target: { value: "kg" } });
    fireEvent.click(screen.getByRole("button", { name: "Scale recipe" }));

    expect(screen.getByText("8 servings")).toBeInTheDocument();
  });

  it("rejects an unusable amount and keeps the popover open", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe());

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /scale recipe from eggs/i }));
    fireEvent.change(screen.getByLabelText("I have"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Scale recipe" }));

    expect(screen.getByText("Enter an amount above 0.")).toBeInTheDocument();
    expect(screen.getByText("4 servings")).toBeInTheDocument();
  });

  it("offers no scale-from button for amounts that can't anchor", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(
      makeRecipe({
        ingredients: [{ id: 1, position: 0, quantity: "2-3", unit: "cloves", name: "garlic" }],
      }),
    );

    renderPage();

    expect(await screen.findByText("2-3 cloves garlic")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /scale recipe from/i })).not.toBeInTheDocument();
  });

  it("uses a batch multiplier when the recipe has no servings count", async () => {
    vi.spyOn(recipesApi, "getRecipe").mockResolvedValue(makeRecipe({ servings: null }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Bigger batch" }));

    expect(screen.getByText("×1.5")).toBeInTheDocument();
    expect((await ingredientTexts())[1]).toBe("3 eggs");
  });
});

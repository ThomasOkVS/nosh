import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as mealPlanApi from "../api/mealPlan";
import * as recipesApi from "../api/recipes";
import type { MealPlanEntry, Recipe } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { MealPlanPage } from "./MealPlanPage";

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

function makeMealPlanEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: 1,
    date: "2026-08-24",
    recipe: makeRecipe(),
    ...overrides,
  };
}

/** Exposes the router's current search string so a test can assert the
 * current week round-trips into the URL, same pattern as
 * RecipeListPage.test.tsx's SearchProbe. */
function SearchProbe() {
  const location = useLocation();
  return <div data-testid="search-probe">{location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/meal-plan"
            element={
              <>
                <MealPlanPage />
                <SearchProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("MealPlanPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all 7 days of the week seeded from the URL", async () => {
    vi.spyOn(mealPlanApi, "getMealPlanRange").mockResolvedValue([]);

    renderAt("/meal-plan?week=2026-08-24");

    expect(await screen.findByText("Aug 24 – 30, 2026")).toBeInTheDocument();
    for (const date of [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]) {
      expect(screen.getByTestId(`meal-plan-day-${date}`)).toBeInTheDocument();
    }
  });

  it("assigns a recipe to a day via the picker and shows it in that day's cell", async () => {
    let entries: MealPlanEntry[] = [];
    vi.spyOn(mealPlanApi, "getMealPlanRange").mockImplementation(() => Promise.resolve(entries));
    vi.spyOn(recipesApi, "listRecipes").mockResolvedValue([makeRecipe({ id: 7, title: "Belgian Waffles" })]);
    const setEntry = vi.spyOn(mealPlanApi, "setMealPlanEntry").mockImplementation((date, recipeId) => {
      const entry = makeMealPlanEntry({ date, recipe: makeRecipe({ id: recipeId, title: "Belgian Waffles" }) });
      entries = [entry];
      return Promise.resolve(entry);
    });

    renderAt("/meal-plan?week=2026-08-24");
    await screen.findByText("Aug 24 – 30, 2026");

    const mondayCell = screen.getByTestId("meal-plan-day-2026-08-24");
    fireEvent.click(within(mondayCell).getByRole("button", { name: "Add recipe" }));

    fireEvent.click(await screen.findByText("Belgian Waffles"));

    expect(setEntry).toHaveBeenCalledWith("2026-08-24", 7);
    expect(await within(mondayCell).findByText("Belgian Waffles")).toBeInTheDocument();
  });

  it("clears an assigned day", async () => {
    const entry = makeMealPlanEntry({ date: "2026-08-24", recipe: makeRecipe({ title: "Tomato Soup" }) });
    vi.spyOn(mealPlanApi, "getMealPlanRange").mockResolvedValue([entry]);
    const clearEntry = vi.spyOn(mealPlanApi, "clearMealPlanEntry").mockResolvedValue(undefined);

    renderAt("/meal-plan?week=2026-08-24");
    await screen.findByText("Tomato Soup");

    fireEvent.click(screen.getByRole("button", { name: "Remove Tomato Soup from this day" }));

    expect(clearEntry).toHaveBeenCalledWith("2026-08-24");
  });

  it("navigates to the previous/next week and updates the URL", async () => {
    const getRange = vi.spyOn(mealPlanApi, "getMealPlanRange").mockResolvedValue([]);

    renderAt("/meal-plan?week=2026-08-24");
    await screen.findByText("Aug 24 – 30, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("Aug 17 – 23, 2026")).toBeInTheDocument();
    expect(screen.getByTestId("search-probe")).toHaveTextContent("week=2026-08-17");
    expect(getRange).toHaveBeenCalledWith("2026-08-17", "2026-08-23");

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(await screen.findByText("Aug 24 – 30, 2026")).toBeInTheDocument();
    expect(screen.getByTestId("search-probe")).toHaveTextContent("week=2026-08-24");
  });

  it("highlights today's cell", async () => {
    // `waitFor`/`findBy*` poll via a real setTimeout internally, which never
    // fires under fake timers unless explicitly advanced — flush the
    // mocked fetch's promise chain with `advanceTimersByTimeAsync(0)` and
    // then assert synchronously instead of using `findBy*` here.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26));
    vi.spyOn(mealPlanApi, "getMealPlanRange").mockResolvedValue([]);

    renderAt("/meal-plan?week=2026-08-24");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("meal-plan-day-2026-08-26")).toHaveClass("border-sauce-500");
    expect(screen.getByTestId("meal-plan-day-2026-08-24")).not.toHaveClass("border-sauce-500");
  });
});

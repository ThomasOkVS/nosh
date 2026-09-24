import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Recipe } from "../api/types";
import { RECIPE_DRAG_MIME_TYPE } from "../lib/recipeDrag";
import { RecipeCard } from "./RecipeCard";

// jsdom's DataTransfer doesn't round-trip data the way a real browser's
// does (see lib/recipeDrag.test.ts) -- this stand-in is just enough for
// setData() to be observable.
function fakeDataTransfer(): DataTransfer {
  const store: Record<string, string> = {};
  return {
    effectAllowed: "none",
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
  } as unknown as DataTransfer;
}

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

function LibraryProbe() {
  const [params] = useSearchParams();
  return <p>Library (tag={params.get("tag") ?? "none"})</p>;
}

function renderCard(recipe: Recipe, caption?: string) {
  return render(
    <MemoryRouter initialEntries={["/card"]}>
      <Routes>
        <Route path="/" element={<LibraryProbe />} />
        <Route path="/card" element={<RecipeCard recipe={recipe} caption={caption} />} />
        <Route path="/recipes/:id" element={<p>Recipe detail page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecipeCard", () => {
  it("clicking a tag chip filters the library by that tag, not the recipe detail page", () => {
    renderCard(makeRecipe({ tags: ["soup"] }));

    fireEvent.click(screen.getByRole("button", { name: "soup" }));

    expect(screen.getByText("Library (tag=soup)")).toBeInTheDocument();
    expect(screen.queryByText("Recipe detail page")).not.toBeInTheDocument();
  });

  it("shows a caption above the title when given one", () => {
    renderCard(makeRecipe(), "Home / Baking");

    expect(screen.getByText("Home / Baking")).toBeInTheDocument();
  });

  it("clicking the card itself navigates to the recipe detail page", () => {
    renderCard(makeRecipe());

    fireEvent.click(screen.getByText("Tomato soup"));

    expect(screen.getByText("Recipe detail page")).toBeInTheDocument();
  });

  it("is not draggable by default", () => {
    renderCard(makeRecipe());

    expect(screen.getByRole("link", { name: /Tomato soup/ })).toHaveAttribute("draggable", "false");
  });

  it("carries its id in a dedicated MIME type when draggable and dragged", () => {
    render(
      <MemoryRouter initialEntries={["/card"]}>
        <Routes>
          <Route path="/card" element={<RecipeCard recipe={makeRecipe({ id: 7 })} draggable />} />
        </Routes>
      </MemoryRouter>,
    );
    const card = screen.getByRole("link", { name: /Tomato soup/ });
    expect(card).toHaveAttribute("draggable", "true");

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });

    expect(dataTransfer.getData(RECIPE_DRAG_MIME_TYPE)).toBe("7");
  });
});

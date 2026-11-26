import type { RecipeDto } from "@nosh/shared";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { imageDto, recipeDto } from "../../test/recipes";
import { factsLine } from "./facts";
import { RecipeCard } from "./RecipeCard";

/** Renders one card on a bare router, so its links resolve and can be followed. */
function renderCard(recipe: RecipeDto, caption?: string) {
  const rootRoute = createRootRoute({
    component: () => <RecipeCard recipe={recipe} caption={caption} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  return { router, user };
}

const stew = recipeDto({
  id: 7,
  title: "Vlaamse Stoverij",
  servings: 6,
  prepTimeMinutes: 20,
  cookTimeMinutes: 170,
  tags: ["belgian", "stew"],
  // A hidden v1 photo first, then the cover: only the cover may show.
  images: [imageDto(7, 3, 0), imageDto(7, 9, 1)],
  coverImageId: 9,
});

describe("factsLine", () => {
  it("REC-38: joins serves, prep and cook with a middle dot", () => {
    expect(factsLine({ servings: 4, prepTimeMinutes: 20, cookTimeMinutes: 35 })).toBe(
      "Serves 4 · Prep 20 min · Cook 35 min",
    );
  });

  it("REC-38: leaves out each part that is not set", () => {
    expect(factsLine({ servings: 4, prepTimeMinutes: null, cookTimeMinutes: 35 })).toBe(
      "Serves 4 · Cook 35 min",
    );
    expect(factsLine({ servings: null, prepTimeMinutes: 20, cookTimeMinutes: null })).toBe(
      "Prep 20 min",
    );
    expect(factsLine({ servings: null, prepTimeMinutes: null, cookTimeMinutes: null })).toBe("");
  });
});

describe("RecipeCard", () => {
  it("REC-38: shows the cover's card copy, the title, the facts line and the tags", async () => {
    renderCard(stew);
    const card = await screen.findByRole("link", { name: /Vlaamse Stoverij/ });

    const img = card.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/recipes/7/images/9?size=card");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(card).toHaveTextContent("Serves 6 · Prep 20 min · Cook 170 min");
    expect(screen.getByRole("link", { name: "belgian" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "stew" })).toBeInTheDocument();
  });

  it("REC-38: without a cover it shows the first-letter placeholder, never another photo", async () => {
    renderCard(
      recipeDto({ id: 8, title: "tomato soup", images: [imageDto(8, 4)], coverImageId: null }),
    );
    const card = await screen.findByRole("link", { name: /tomato soup/ });

    expect(card.querySelector("img")).toBeNull();
    expect(screen.getByTestId("card-placeholder")).toHaveTextContent("T");
  });

  it("REC-38: leaves the facts line out when nothing is set", async () => {
    renderCard(recipeDto({ id: 8, title: "Toast" }));
    await screen.findByRole("link", { name: /Toast/ });
    expect(screen.queryByTestId("card-facts")).toBeNull();
  });

  it("REC-38: the caption sits above the title when given", async () => {
    renderCard(stew, "Mains / Belgian");
    const caption = await screen.findByText("Mains / Belgian");
    const title = screen.getByText("Vlaamse Stoverij");

    expect(caption.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("REC-38: shows no caption by default", async () => {
    renderCard(stew);
    await screen.findByRole("link", { name: /Vlaamse Stoverij/ });
    expect(screen.queryByTestId("card-caption")).toBeNull();
  });

  it("REC-38: the card opens /recipes/$id", async () => {
    const { router, user } = renderCard(stew);
    const card = await screen.findByRole("link", { name: /Vlaamse Stoverij/ });
    expect(card).toHaveAttribute("href", "/recipes/7");

    await user.click(card);
    expect(router.state.location.pathname).toBe("/recipes/7");
  });

  it("REC-38: a tag on the card filters the library and does not open the recipe", async () => {
    const { router, user } = renderCard(stew);
    const tag = await screen.findByRole("link", { name: "stew" });
    expect(tag).toHaveAttribute("href", "/?tag=stew");
    // Never a link inside the card link: a tap on a tag can only mean the tag.
    expect(tag.closest("a")).toBe(tag);
    expect(screen.getByRole("link", { name: /Vlaamse Stoverij/ })).not.toContainElement(tag);

    await user.click(tag);
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({ tag: "stew" });
  });

  it("REC-38: is not draggable by default", async () => {
    renderCard(stew);
    const card = await screen.findByRole("link", { name: /Vlaamse Stoverij/ });

    expect(card).toHaveAttribute("draggable", "false");
    expect(card.querySelector("img")).toHaveAttribute("draggable", "false");
    for (const tag of ["belgian", "stew"]) {
      expect(screen.getByRole("link", { name: tag })).toHaveAttribute("draggable", "false");
    }
  });
});

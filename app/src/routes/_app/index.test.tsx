import type { RecipeDto } from "@nosh/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../../test/msw";
import { recipeDto } from "../../../test/recipes";
import { renderApp } from "../../../test/render";

function signedIn(recipes: RecipeDto[] = []) {
  server.use(
    http.get("/api/auth/me", () => HttpResponse.json(owner)),
    http.get("/api/recipes", () => HttpResponse.json(recipes)),
  );
}

/** The card links in the grid, in screen order, by their title. */
function cardTitles() {
  return screen.getAllByTestId("card-title").map((el) => el.textContent);
}

// Served out of order on purpose: the library sorts newest first itself.
const library = [
  recipeDto({ id: 1, title: "Belgian Waffles", createdAt: "2026-11-01T09:00:00.000Z", tags: ["belgian", "sweet"] }),
  recipeDto({ id: 3, title: "Tomato Soup", createdAt: "2026-11-03T09:00:00.000Z", tags: ["soup", "vegetarian"] }),
  recipeDto({ id: 2, title: "Pea Soup", createdAt: "2026-11-02T09:00:00.000Z", tags: ["soup"] }),
  recipeDto({ id: 4, title: "Vlaamse Stoverij", createdAt: "2026-11-02T09:00:00.000Z", tags: ["belgian"] }),
];

describe("library", () => {
  it('REC-40 COL-05: a new account sees "Your library is empty", the illustration and an "Add your first recipe" link to /recipes/new; no tag chips', async () => {
    signedIn([]);
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Your library is empty" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A steaming pot" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first recipe" })).toHaveAttribute(
      "href",
      "/recipes/new",
    );
    expect(screen.getByText("0 recipes")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("REC-40: placeholder cards show while the list loads", async () => {
    const answer = deferred();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes", async () => {
        await answer.promise;
        return HttpResponse.json(library);
      }),
    );
    renderApp("/");

    const placeholder = await screen.findByRole("status", { name: "Loading recipes" });
    expect(within(placeholder).getAllByTestId("card-skeleton").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();

    answer.resolve();
    await screen.findByText("Tomato Soup");
    expect(screen.queryByRole("status", { name: "Loading recipes" })).not.toBeInTheDocument();
  });

  it('REC-09: cards show newest first with a "N recipes" kicker', async () => {
    signedIn(library);
    renderApp("/");

    await screen.findByText("Tomato Soup");
    // Same creation time: the higher id was made later.
    expect(cardTitles()).toEqual(["Tomato Soup", "Vlaamse Stoverij", "Pea Soup", "Belgian Waffles"]);
    expect(screen.getByText("4 recipes")).toBeInTheDocument();
  });

  it('REC-09: one recipe is "1 recipe"', async () => {
    signedIn([library[0]!]);
    renderApp("/");
    expect(await screen.findByText("1 recipe")).toBeInTheDocument();
  });

  it("REC-10: the chips are the owner's own tags, once each, after \"all\"", async () => {
    signedIn(library);
    renderApp("/");

    const chips = await screen.findByRole("navigation", { name: "Tags" });
    expect(within(chips).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "all",
      "belgian",
      "soup",
      "sweet",
      "vegetarian",
    ]);
    expect(within(chips).getByRole("link", { name: "all" })).toHaveAttribute("aria-current", "page");
  });

  it('REC-10 REC-23: /?tag=Soup shows only soup recipes with the "soup" chip active; "all" clears it', async () => {
    signedIn(library);
    const { router, user } = renderApp("/?tag=Soup");

    const chips = await screen.findByRole("navigation", { name: "Tags" });
    await screen.findByText("Tomato Soup");
    expect(cardTitles()).toEqual(["Tomato Soup", "Pea Soup"]);
    expect(within(chips).getByRole("link", { name: "soup" })).toHaveAttribute("aria-current", "page");
    expect(within(chips).getByRole("link", { name: "all" })).not.toHaveAttribute("aria-current");
    // The Library stays the current screen while a tag is chosen.
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");

    await user.click(within(chips).getByRole("link", { name: "all" }));
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    expect(router.state.location.search).toEqual({});
    expect(within(chips).getByRole("link", { name: "all" })).toHaveAttribute("aria-current", "page");
  });

  it('REC-10: under a tag filter the kicker reads "N of M"; without one, "M recipes"', async () => {
    signedIn([library[0]!, library[2]!, library[3]!]); // one of them is soup
    const { user } = renderApp("/?tag=soup");

    expect(await screen.findByText("1 of 3")).toBeInTheDocument();
    expect(screen.queryByText("3 recipes")).not.toBeInTheDocument();

    const chips = screen.getByRole("navigation", { name: "Tags" });
    await user.click(within(chips).getByRole("link", { name: "all" }));
    expect(await screen.findByText("3 recipes")).toBeInTheDocument();
    expect(screen.queryByText("1 of 3")).not.toBeInTheDocument();
  });

  it("REC-10 REC-38: a tag on a card filters the library", async () => {
    signedIn(library);
    const { router, user } = renderApp("/");
    await screen.findByText("Tomato Soup");

    const waffles = screen.getByRole("link", { name: /Belgian Waffles/ }).closest("article")!;
    await user.click(within(waffles).getByRole("link", { name: "sweet" }));

    await waitFor(() => expect(cardTitles()).toEqual(["Belgian Waffles"]));
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({ tag: "sweet" });
  });

  it('COL-05 REC-40: a tag that matches nothing says "No recipes match" with a way back to all', async () => {
    signedIn(library);
    const { router, user } = renderApp("/?tag=dessert");

    expect(await screen.findByRole("heading", { name: "No recipes match" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A steaming pot" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("card-title")).toHaveLength(0);

    await user.click(screen.getByRole("link", { name: "Show all recipes" }));
    await waitFor(() => expect(cardTitles()).toHaveLength(4));
    expect(router.state.location.search).toEqual({});
  });

  it("design §6.4: a list that fails to load says so", async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes", () => HttpResponse.json({ error: "Something went wrong" }, { status: 500 })),
    );
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("design §6.4: the + opens /recipes/new", async () => {
    signedIn([]);
    renderApp("/");
    await screen.findByRole("heading", { name: "Your library is empty" });

    expect(screen.getByRole("link", { name: "New recipe or import" })).toHaveAttribute(
      "href",
      "/recipes/new",
    );
  });
});

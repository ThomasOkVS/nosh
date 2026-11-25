import type { RecipeDto } from "@nosh/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../../../test/msw";
import { imageDto, recipeDto } from "../../../../test/recipes";
import { renderApp } from "../../../../test/render";

const notFound = () => HttpResponse.json({ error: "Recipe not found" }, { status: 404 });

/** Signed in, with `recipe` served at /api/recipes/<id>. */
function serve(recipe: RecipeDto) {
  server.use(
    http.get("/api/auth/me", () => HttpResponse.json(owner)),
    http.get("/api/recipes/:id", ({ params }) =>
      params.id === String(recipe.id) ? HttpResponse.json(recipe) : notFound(),
    ),
  );
}

const stoverij = recipeDto({
  id: 5,
  title: "Vlaamse Stoverij",
  description: "Beef braised slowly in brown ale.",
  servings: 6,
  prepTimeMinutes: null,
  cookTimeMinutes: 170,
  tags: ["belgian", "stew"],
  ingredients: [
    { id: 11, position: 0, quantity: "1", unit: "kg", name: "beef cheek" },
    { id: 12, position: 1, quantity: "2-3", unit: null, name: "onions" },
    { id: 13, position: 2, quantity: "a pinch", unit: null, name: "salt" },
    { id: 14, position: 3, quantity: null, unit: null, name: "mustard bread" },
  ],
  steps: [
    { id: 21, position: 0, instruction: "Brown the beef." },
    { id: 22, position: 1, instruction: "Add the ale and simmer." },
  ],
});

async function openPage(recipe: RecipeDto = stoverij) {
  serve(recipe);
  const app = renderApp(`/recipes/${recipe.id}`);
  // The first render also loads the code-split route; be patient on a busy machine.
  await screen.findByRole("heading", { level: 1, name: recipe.title }, { timeout: 3000 });
  return app;
}

describe("recipe page", () => {
  it("REC-20: shows the title, description, tags and the facts line with only the set parts", async () => {
    await openPage();

    expect(screen.getByText("Beef braised slowly in brown ale.")).toBeInTheDocument();
    expect(screen.getByText("Serves 6 · Cook 170 min")).toBeInTheDocument();
    expect(screen.queryByText(/Prep/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "belgian" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "stew" })).toBeInTheDocument();
  });

  it("REC-20: no description, no facts and no tags show nothing for them", async () => {
    await openPage(recipeDto({ id: 6, title: "Plain Toast" }));
    expect(screen.queryByTestId("recipe-facts")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-description")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recipe-tags")).not.toBeInTheDocument();
  });

  it('REC-20: the Ingredients tab lists the ingredients numbered and as stored ("2-3", "a pinch")', async () => {
    await openPage();

    const tab = screen.getByRole("tab", { name: "Ingredients" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Ingredients" });
    const list = within(panel).getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "11 kg beef cheek",
      "22-3 onions",
      "3a pinch salt",
      "4 mustard bread",
    ]);
  });

  it("REC-20: the Method tab lists the steps numbered", async () => {
    const { user } = await openPage();

    await user.click(screen.getByRole("tab", { name: "Method" }));
    expect(screen.getByRole("tab", { name: "Method" })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Method" });
    const list = within(panel).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1Brown the beef.",
      "2Add the ale and simmer.",
    ]);
    expect(screen.queryByText("beef cheek")).not.toBeInTheDocument();
  });

  it("REC-20: an empty ingredient list hides its section; the steps show", async () => {
    await openPage(
      recipeDto({ id: 7, title: "Toast", steps: [{ id: 1, position: 0, instruction: "Toast it." }] }),
    );
    expect(screen.queryByRole("tab", { name: "Ingredients" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Ingredients" })).not.toBeInTheDocument();
    expect(screen.getByText("Toast it.")).toBeInTheDocument();
  });

  it("REC-20: an empty step list hides its section; the ingredients show", async () => {
    await openPage(
      recipeDto({
        id: 8,
        title: "Butter",
        ingredients: [{ id: 1, position: 0, quantity: null, unit: null, name: "butter" }],
      }),
    );
    expect(screen.queryByRole("tab", { name: "Method" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Method" })).not.toBeInTheDocument();
    expect(screen.getByText("butter")).toBeInTheDocument();
  });

  it("REC-20: both lists empty shows neither section nor the pill", async () => {
    await openPage(recipeDto({ id: 9, title: "Idea" }));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
  });

  it("REC-20: Edit in the ⋯ menu goes to /recipes/$id/edit", async () => {
    const { user, router } = await openPage();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/5/edit"));
  });

  it("REC-20: Back goes to the library", async () => {
    const { user, router } = await openPage();

    await user.click(screen.getByRole("link", { name: "Back to library" }));
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(router.state.location.pathname).toBe("/");
  });

  it("REC-21: the cover photo shows large, full size", async () => {
    const recipe = recipeDto({
      id: 5,
      title: "Vlaamse Stoverij",
      images: [imageDto(5, 31, 0), imageDto(5, 32, 1)],
      coverImageId: 32,
    });
    await openPage(recipe);

    const imgs = document.body.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "/api/recipes/5/images/32");
    expect(screen.getByTestId("recipe-cover")).toContainElement(imgs[0]!);
    expect(screen.queryByTestId("cover-placeholder")).not.toBeInTheDocument();
  });

  it("REC-21: no cover shows the letter panel and hidden v1 photos never render", async () => {
    await openPage(
      recipeDto({ id: 5, title: "tomato soup", images: [imageDto(5, 31, 0)], coverImageId: null }),
    );
    expect(screen.getByTestId("cover-placeholder")).toHaveTextContent("T");
    expect(document.body.querySelectorAll("img")).toHaveLength(0);
  });

  it('REC-22: "Imported from <host>" opens the source in a new tab', async () => {
    await openPage(recipeDto({ id: 5, title: "Stoverij", sourceUrl: "https://example.com/stoverij?x=1" }));

    const link = screen.getByRole("link", { name: "Imported from example.com" });
    expect(link).toHaveAttribute("href", "https://example.com/stoverij?x=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it.each(["not a url", "javascript:alert(1)", "ftp://example.com/file"])(
    "REC-22: a stored %j shows no link and the page still renders",
    async (sourceUrl) => {
      await openPage(recipeDto({ id: 5, title: "Stoverij", sourceUrl }));
      expect(screen.queryByText(/Imported from/)).not.toBeInTheDocument();
    },
  );

  it("REC-23: a tag opens the library filtered by it", async () => {
    const { user, router } = await openPage();

    await user.click(screen.getByRole("link", { name: "stew" }));
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({ tag: "stew" });
  });

  it('REC-24 REC-39: delete asks "Delete this recipe? This can\'t be undone."; Cancel does nothing', async () => {
    let deletes = 0;
    server.use(
      http.delete("/api/recipes/:id", () => {
        deletes++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, router } = await openPage();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete this recipe?");
    expect(dialog).toHaveTextContent("This can't be undone.");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deletes).toBe(0);
    expect(router.state.location.pathname).toBe("/recipes/5");
    expect(screen.getByRole("heading", { level: 1, name: "Vlaamse Stoverij" })).toBeInTheDocument();
  });

  it("REC-24: confirming deletes the recipe and lands on the library, replacing the page in history", async () => {
    let deleted = false;
    const { user, router } = await openPage();
    server.use(
      http.get("/api/recipes/:id", () => (deleted ? notFound() : HttpResponse.json(stoverij))),
      http.delete("/api/recipes/5", () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const historyLength = router.history.length;

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(deleted).toBe(true);
    expect(router.state.location.pathname).toBe("/");
    expect(router.history.length).toBe(historyLength);
    expect(screen.queryByText("Recipe not found")).not.toBeInTheDocument();
  });

  it('REC-24: a failed delete shows "Failed to delete recipe" and stays on the page', async () => {
    server.use(
      http.delete("/api/recipes/:id", () =>
        HttpResponse.json({ error: "Something went wrong" }, { status: 500 }),
      ),
    );
    const { user, router } = await openPage();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Failed to delete recipe")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/recipes/5");
    expect(screen.getByRole("heading", { level: 1, name: "Vlaamse Stoverij" })).toBeInTheDocument();
  });

  it("REC-25: a page-shaped placeholder with a usable Back link shows while loading", async () => {
    const answer = deferred();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes/:id", async () => {
        await answer.promise;
        return HttpResponse.json(stoverij);
      }),
    );
    const { user, router } = renderApp("/recipes/5");

    expect(await screen.findByRole("status", { name: "Loading recipe" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to library" }));
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(router.state.location.pathname).toBe("/");
    answer.resolve();
  });

  it('REC-25: an unknown recipe shows "Recipe not found" with the Back link', async () => {
    serve(stoverij);
    renderApp("/recipes/404");

    expect(await screen.findByText("Recipe not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to library" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("status", { name: "Loading recipe" })).not.toBeInTheDocument();
  });

  it('REC-25: a network failure shows "Something went wrong"', async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes/:id", () => HttpResponse.error()),
    );
    renderApp("/recipes/5");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it.each(["abc", "0", "-1", "1.5", "99999999999"])(
    'REC-25: the odd id %j shows "Recipe not found" without asking the API',
    async (id) => {
      let asked = false;
      server.use(
        http.get("/api/auth/me", () => HttpResponse.json(owner)),
        http.get("/api/recipes/:id", () => {
          asked = true;
          return HttpResponse.json({ error: "Invalid recipe id" }, { status: 400 });
        }),
      );
      renderApp(`/recipes/${id}`);
      expect(await screen.findByText("Recipe not found")).toBeInTheDocument();
      expect(asked).toBe(false);
    },
  );

  it("design §7: the app nav and the frame header are hidden on the recipe page", async () => {
    await openPage();
    expect(screen.queryByRole("navigation", { name: "App" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByText("nosh")).not.toBeInTheDocument();
  });

  it("design §7: the app nav comes back on the library", async () => {
    const { user } = await openPage();
    await user.click(screen.getByRole("link", { name: "Back to library" }));
    expect(await screen.findByRole("navigation", { name: "App" })).toBeInTheDocument();
  });
});

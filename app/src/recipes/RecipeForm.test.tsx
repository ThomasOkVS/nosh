import { RECIPE_MESSAGES, type RecipeDto } from "@nosh/shared";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../test/msw";
import { recipeDto } from "../../test/recipes";
import { renderApp } from "../../test/render";

const stoverij = recipeDto({
  id: 5,
  title: "Vlaamse Stoverij",
  description: "Beef braised in ale.",
  servings: 6,
  cookTimeMinutes: 170,
  sourceUrl: "https://example.com/stoverij",
  collectionId: 3,
  tags: ["stew"],
  ingredients: [{ id: 11, position: 0, quantity: "1", unit: "kg", name: "beef cheek" }],
  steps: [{ id: 21, position: 0, instruction: "Brown the beef." }],
});

/** Signed in; `recipes` are served at /api/recipes/<id>. */
function signedIn(...recipes: RecipeDto[]) {
  server.use(
    http.get("/api/auth/me", () => HttpResponse.json(owner)),
    http.get("/api/recipes/:id", ({ params }) => {
      const recipe = recipes.find((r) => String(r.id) === params.id);
      return recipe
        ? HttpResponse.json(recipe)
        : HttpResponse.json({ error: "Recipe not found" }, { status: 404 });
    }),
  );
}

/** Records every POST /api/recipes body and answers with recipe 42 built from it. */
function acceptCreate(hold?: Promise<void>) {
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/recipes", async ({ request }) => {
      const body = (await request.json()) as { title: string };
      bodies.push(body);
      if (hold) await hold;
      const saved = recipeDto({ id: 42, title: body.title });
      // The page then loads it.
      server.use(http.get("/api/recipes/42", () => HttpResponse.json(saved)));
      return HttpResponse.json(saved, { status: 201 });
    }),
  );
  return bodies;
}

async function openNew() {
  const app = renderApp("/recipes/new");
  await screen.findByRole("heading", { level: 1, name: "New recipe" });
  return app;
}

async function openEdit(recipe: RecipeDto = stoverij) {
  const app = renderApp(`/recipes/${recipe.id}/edit`);
  await screen.findByRole("heading", { level: 1, name: "Edit recipe" });
  await screen.findByDisplayValue(recipe.title);
  return app;
}

const ingredientNames = () => screen.queryAllByRole("textbox", { name: /^Ingredient \d+$/ });
const stepFields = () => screen.queryAllByRole("textbox", { name: /^Step \d+$/ });

describe("recipe form", () => {
  it("REC-27: /recipes/new shows a blank \"New recipe\" form with one empty ingredient and step row", async () => {
    signedIn();
    await openNew();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(ingredientNames()).toHaveLength(1);
    expect(ingredientNames()[0]).toHaveValue("");
    expect(stepFields()).toHaveLength(1);
    expect(stepFields()[0]).toHaveValue("");
    expect(screen.getByRole("link", { name: "Back to library" })).toHaveAttribute("href", "/");
  });

  it('REC-27: /recipes/5/edit shows "Edit recipe", loads the recipe and links back to it', async () => {
    signedIn(stoverij);
    await openEdit();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Beef braised in ale.");
    expect(screen.getByRole("textbox", { name: "Servings" })).toHaveValue("6");
    expect(screen.getByRole("textbox", { name: "Prep time" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Cook time" })).toHaveValue("170");
    expect(screen.getByRole("textbox", { name: "Quantity 1" })).toHaveValue("1");
    expect(screen.getByRole("textbox", { name: "Unit 1" })).toHaveValue("kg");
    expect(screen.getByRole("textbox", { name: "Ingredient 1" })).toHaveValue("beef cheek");
    expect(screen.getByRole("textbox", { name: "Step 1" })).toHaveValue("Brown the beef.");
    expect(screen.getByRole("button", { name: "Remove tag stew" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to recipe" })).toHaveAttribute("href", "/recipes/5");
  });

  it("REC-27: the edit form shows a placeholder while loading, with the back link already there", async () => {
    const hold = deferred();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes/5", async () => {
        await hold.promise;
        return HttpResponse.json(stoverij);
      }),
    );
    renderApp("/recipes/5/edit");
    expect(await screen.findByRole("status", { name: "Loading recipe" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to recipe" })).toHaveAttribute("href", "/recipes/5");
    hold.resolve();
    expect(await screen.findByDisplayValue("Vlaamse Stoverij")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading recipe" })).not.toBeInTheDocument();
  });

  it("REC-27: the edit form shows an error when the recipe can't load", async () => {
    signedIn();
    renderApp("/recipes/9/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("Recipe not found");
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to recipe" })).toHaveAttribute("href", "/recipes/9");
  });

  it("REC-27: an impossible id shows the error without asking the API", async () => {
    let asked = false;
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.get("/api/recipes/:id", () => {
        asked = true;
        return HttpResponse.json({ error: "Invalid recipe id" }, { status: 400 });
      }),
    );
    renderApp("/recipes/abc/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("Recipe not found");
    expect(asked).toBe(false);
  });

  it("REC-28: rows can be added and removed down to none, and step numbers follow the order", async () => {
    signedIn();
    const { user } = await openNew();

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(ingredientNames()).toHaveLength(3);
    for (let n = 3; n >= 1; n--) {
      await user.click(screen.getByRole("button", { name: `Remove ingredient ${n}` }));
    }
    expect(ingredientNames()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: "Add step" }));
    const [first, second, third] = stepFields();
    await user.type(first!, "Chop.");
    await user.type(second!, "Fry.");
    await user.type(third!, "Serve.");
    const numbers = () => screen.getAllByTestId("step-number").map((n) => n.textContent);
    expect(numbers()).toEqual(["1", "2", "3"]);

    await user.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(numbers()).toEqual(["1", "2"]);
    expect(screen.getByRole("textbox", { name: "Step 1" })).toHaveValue("Fry.");
    expect(screen.getByRole("textbox", { name: "Step 2" })).toHaveValue("Serve.");

    await user.click(screen.getByRole("button", { name: "Remove step 2" }));
    await user.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(stepFields()).toHaveLength(0);
  });

  it("REC-28: 100 rows is the most the add buttons allow", async () => {
    signedIn(
      recipeDto({
        id: 7,
        title: "Long",
        ingredients: Array.from({ length: 99 }, (_, i) => ({
          id: i + 1,
          position: i,
          quantity: null,
          unit: null,
          name: `thing ${i}`,
        })),
        steps: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, position: i, instruction: `do ${i}` })),
      }),
    );
    const { user } = renderApp("/recipes/7/edit");
    await screen.findByDisplayValue("Long");

    expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
    const addIngredient = screen.getByRole("button", { name: "Add ingredient" });
    expect(addIngredient).toBeEnabled();
    await user.click(addIngredient);
    expect(ingredientNames()).toHaveLength(100);
    expect(addIngredient).toBeDisabled();
  });

  describe("auto-grow", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");
    afterEach(() => {
      if (original) Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", original);
    });

    it("REC-28: description and step fields grow with their content", async () => {
      // jsdom has no layout: the content height follows the text length.
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
        configurable: true,
        get(this: HTMLTextAreaElement) {
          return 24 + this.value.length;
        },
      });
      signedIn();
      const { user } = await openNew();

      const description = screen.getByRole("textbox", { name: "Description" });
      await user.type(description, "A long description.");
      expect(description.style.height).toBe(`${24 + 19}px`);

      const step = screen.getByRole("textbox", { name: "Step 1" });
      await user.type(step, "Stir well.");
      expect(step.style.height).toBe(`${24 + 10}px`);
    });
  });

  it('REC-28 REC-29: a typed "0" is refused with its message and nothing is sent', async () => {
    signedIn();
    const bodies = acceptCreate();
    const { user } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    await user.type(screen.getByRole("textbox", { name: "Servings" }), "0");
    await user.type(screen.getByRole("textbox", { name: "Prep time" }), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(RECIPE_MESSAGES.servings)).toBeInTheDocument();
    expect(screen.getByText(RECIPE_MESSAGES.prepTime)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("REC-29: the POST body is trimmed and filtered", async () => {
    signedIn();
    const bodies = acceptCreate();
    const { user } = await openNew();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "  Toast  ");
    await user.type(screen.getByRole("textbox", { name: "Servings" }), " 2 ");
    await user.type(screen.getByRole("textbox", { name: "Quantity 1" }), " 2 ");
    await user.type(screen.getByRole("textbox", { name: "Ingredient 1" }), " bread ");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByRole("textbox", { name: "Quantity 2" }), "1");
    await user.type(screen.getByRole("textbox", { name: "Step 1" }), "  Toast it. ");
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.type(screen.getByRole("textbox", { name: "Tags" }), "Breakfast{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("heading", { level: 1, name: "Toast" });
    expect(bodies).toEqual([
      {
        title: "Toast",
        description: null,
        servings: 2,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        sourceUrl: null,
        ingredients: [{ quantity: "2", unit: null, name: "bread" }],
        steps: [{ instruction: "Toast it." }],
        tags: ["breakfast"],
      },
    ]);
  });

  it("REC-29: the edit PUT keeps the stored sourceUrl and never sends a collection", async () => {
    signedIn(stoverij);
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/recipes/5", async ({ request }) => {
        const body = (await request.json()) as { title: string };
        bodies.push(body);
        return HttpResponse.json({ ...stoverij, title: body.title });
      }),
    );
    const { user, router } = await openEdit();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Stoverij");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/recipes/5"));
    expect(bodies).toEqual([
      {
        title: "Stoverij",
        description: "Beef braised in ale.",
        servings: 6,
        prepTimeMinutes: null,
        cookTimeMinutes: 170,
        sourceUrl: "https://example.com/stoverij",
        ingredients: [{ quantity: "1", unit: "kg", name: "beef cheek" }],
        steps: [{ instruction: "Brown the beef." }],
        tags: ["stew"],
      },
    ]);
  });

  it('REC-30: Save shows "Saving…" and is disabled while saving', async () => {
    signedIn();
    const hold = deferred();
    acceptCreate(hold.promise);
    const { user } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    hold.resolve();
    await screen.findByRole("heading", { level: 1, name: "Toast" });
  });

  it("REC-30: a server error shows a focused banner with its message and keeps the input", async () => {
    signedIn();
    server.use(
      http.post("/api/recipes", () =>
        HttpResponse.json({ error: "Collection not found" }, { status: 404 }),
      ),
    );
    const { user } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    await user.type(screen.getByRole("textbox", { name: "Ingredient 1" }), "bread");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Collection not found");
    await waitFor(() => expect(banner).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Toast");
    expect(screen.getByRole("textbox", { name: "Ingredient 1" })).toHaveValue("bread");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it('REC-30: a failure without a message says "Something went wrong"', async () => {
    signedIn();
    server.use(http.post("/api/recipes", () => new HttpResponse("oops", { status: 500 })));
    const { user } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("REC-30: after a create the owner lands on the recipe at once, and Back doesn't return to the form", async () => {
    signedIn();
    // The recipe page's own load is held: what it shows comes from the save.
    const hold = deferred();
    server.use(
      http.post("/api/recipes", () =>
        HttpResponse.json(recipeDto({ id: 42, title: "Toast" }), { status: 201 }),
      ),
      http.get("/api/recipes/42", async () => {
        await hold.promise;
        return HttpResponse.json(recipeDto({ id: 42, title: "Toast" }));
      }),
    );
    const { user, router } = renderApp("/");
    await screen.findByRole("heading", { name: "Library" });
    await user.click(screen.getByRole("link", { name: "New recipe or import" }));
    await screen.findByRole("heading", { level: 1, name: "New recipe" });
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Toast" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/42");
    hold.resolve();

    router.history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByRole("heading", { name: "New recipe" })).not.toBeInTheDocument();
  });

  it("REC-30: after an edit the owner lands on the recipe page with the saved data", async () => {
    signedIn(stoverij);
    server.use(
      http.put("/api/recipes/5", async ({ request }) => {
        const body = (await request.json()) as { title: string };
        const saved = { ...stoverij, title: body.title };
        // Like the real server, a refetch now returns the saved recipe.
        server.use(http.get("/api/recipes/5", () => HttpResponse.json(saved)));
        return HttpResponse.json(saved);
      }),
    );
    const { user, router } = await openEdit();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Stoverij");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Stoverij" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/recipes/5");
  });

  it("REC-32: going from /recipes/new with typed text to /recipes/5/edit starts fresh", async () => {
    signedIn(stoverij);
    const { user, router } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Draft text");
    await user.type(screen.getByRole("textbox", { name: "Tags" }), "draft{Enter}");

    await router.navigate({ to: "/recipes/$id/edit", params: { id: "5" } });
    await screen.findByDisplayValue("Vlaamse Stoverij");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Beef braised in ale.");
    expect(screen.queryByRole("button", { name: "Remove tag draft" })).not.toBeInTheDocument();

    await router.navigate({ to: "/recipes/new" });
    await screen.findByRole("heading", { level: 1, name: "New recipe" });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("");
  });

  it("Review Focus 4: double-clicking Save sends one POST", async () => {
    signedIn();
    const hold = deferred();
    const bodies = acceptCreate(hold.promise);
    const { user } = await openNew();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Toast");
    const save = screen.getByRole("button", { name: "Save" });
    // Two taps in the same tick, before React can re-render the disabled button.
    fireEvent.click(save);
    fireEvent.click(save);
    await user.dblClick(save);
    // Give a second request every chance to start before releasing the first.
    await screen.findByRole("button", { name: "Saving…" });
    await new Promise((r) => setTimeout(r, 50));
    hold.resolve();

    await screen.findByRole("heading", { level: 1, name: "Toast" });
    expect(bodies).toHaveLength(1);
  });

  it("design §6.4: the form has Ingredients, Method and Tags section headings and a Save bar", async () => {
    signedIn();
    await openNew();
    for (const name of ["Ingredients", "Method", "Tags"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    const bar = screen.getByTestId("save-bar");
    expect(within(bar).getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });
});

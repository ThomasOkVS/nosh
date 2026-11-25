import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";
import { RECIPE_MESSAGES, type RecipeDto } from "@nosh/shared";
import { describe, expect, it, vi } from "vitest";
import { createRecipe, makeRecipeApp, signedInHeaders } from "../../test/recipes.js";
import { ingredients, recipeImages, recipes, recipeTags, steps, tags } from "../db/schema.js";
import { parseRecipeId } from "./ids.js";

const { app, db, uploadsDir } = await makeRecipeApp();

const get = (path: string, headers: Record<string, string>) => app.request(path, { headers });
const json = async <T = RecipeDto>(res: Response) => (await res.json()) as T;

describe("authentication", () => {
  it("REC-01 SEC-23: list, read, create, update, delete, image upload, image read and image delete answer 401 without a session", async () => {
    const calls: [string, string][] = [
      ["GET", "/api/recipes"],
      ["GET", "/api/recipes/1"],
      ["POST", "/api/recipes"],
      ["PUT", "/api/recipes/1"],
      ["DELETE", "/api/recipes/1"],
      ["POST", "/api/recipes/1/images"],
      ["GET", "/api/recipes/1/images/1"],
      ["DELETE", "/api/recipes/1/images/1"],
    ];
    for (const [method, path] of calls) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    }
    const [row] = await db.select({ n: count() }).from(recipes);
    expect(row?.n).toBe(0);
  });
});

describe("create", () => {
  it("REC-02 REC-05: creates a recipe with ordered ingredients, steps and tags", async () => {
    const headers = await signedInHeaders(db);
    const res = await createRecipe(app, headers, {
      title: "Soup",
      description: "Warm",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 30,
      ingredients: [
        { quantity: "2", unit: "tbsp", name: "oil" },
        { name: "salt" },
        { quantity: "1", name: "onion" },
      ],
      steps: [{ instruction: "Chop" }, { instruction: "Cook" }, { instruction: "Serve" }],
      tags: ["Dinner"],
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBe(1);
    expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
    expect(body).toMatchObject({
      title: "Soup",
      description: "Warm",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 30,
      sourceUrl: null,
      images: [],
      coverImageId: null,
      collectionId: null,
      tags: ["dinner"],
    });
    expect(body.ingredients.map((i) => [i.position, i.name])).toEqual([
      [0, "oil"],
      [1, "salt"],
      [2, "onion"],
    ]);
    expect(body.ingredients[1]).toMatchObject({ quantity: null, unit: null });
    expect(body.steps.map((s) => [s.position, s.instruction])).toEqual([
      [0, "Chop"],
      [1, "Cook"],
      [2, "Serve"],
    ]);
    expect(typeof body.ingredients[0]?.id).toBe("number");
    expect(typeof body.steps[0]?.id).toBe("number");
  });

  it("REC-03: refuses a blank title with 400 and the message", async () => {
    const headers = await signedInHeaders(db);
    const res = await createRecipe(app, headers, { title: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title is required" });
    const [row] = await db.select({ n: count() }).from(recipes);
    expect(row?.n).toBe(0);
  });

  const make = (n: number, item: unknown) => Array.from({ length: n }, () => item);
  it.each<[string, Record<string, unknown>, string]>([
    ["title over 200 characters", { title: "a".repeat(201) }, RECIPE_MESSAGES.titleTooLong],
    ["101 ingredients", { title: "x", ingredients: make(101, { name: "a" }) }, RECIPE_MESSAGES.tooManyIngredients],
    ["101 steps", { title: "x", steps: make(101, { instruction: "a" }) }, RECIPE_MESSAGES.tooManySteps],
    ["31 tags", { title: "x", tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }, RECIPE_MESSAGES.tooManyTags],
    ["servings of 0", { title: "x", servings: 0 }, RECIPE_MESSAGES.servings],
    ["a prep time of 0", { title: "x", prepTimeMinutes: 0 }, RECIPE_MESSAGES.prepTime],
    ["a cook time above the integer range", { title: "x", cookTimeMinutes: 2147483648 }, RECIPE_MESSAGES.cookTime],
    ["an empty description", { title: "x", description: "" }, RECIPE_MESSAGES.descriptionBlank],
    ["a nameless ingredient", { title: "x", ingredients: [{ name: " " }] }, RECIPE_MESSAGES.ingredientName],
  ])("REC-03: refuses %s with 400 and its message", async (_label, body, message) => {
    const headers = await signedInHeaders(db);
    const res = await createRecipe(app, headers, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: message });
    const [row] = await db.select({ n: count() }).from(recipes);
    expect(row?.n).toBe(0);
  });

  it("REC-03: accepts exactly the caps (200-character title, 100 ingredients, 100 steps, 30 tags)", async () => {
    const headers = await signedInHeaders(db);
    const res = await createRecipe(app, headers, {
      title: "a".repeat(200),
      ingredients: make(100, { name: "a" }),
      steps: make(100, { instruction: "a" }),
      tags: Array.from({ length: 30 }, (_, i) => `t${i}`),
    });
    expect(res.status).toBe(201);
  });

  it("REC-04: sourceUrl defaults to null and round-trips; javascript: is 400", async () => {
    const headers = await signedInHeaders(db);
    const plain = await json(await createRecipe(app, headers, { title: "a" }));
    expect(plain.sourceUrl).toBeNull();
    const withUrl = await createRecipe(app, headers, {
      title: "b",
      sourceUrl: " https://example.com/r?x=1 ",
    });
    expect(withUrl.status).toBe(201);
    const created = await json(withUrl);
    expect(created.sourceUrl).toBe("https://example.com/r?x=1");
    expect((await json(await get(`/api/recipes/${created.id}`, headers))).sourceUrl).toBe(
      "https://example.com/r?x=1",
    );
    const bad = await createRecipe(app, headers, { title: "c", sourceUrl: "javascript:alert(1)" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: RECIPE_MESSAGES.sourceUrl });
  });

  it("REC-06: quantity is stored as given (\"2-3\", \"1/2\", \"a pinch\", \"1.5\"); name alone is valid", async () => {
    const headers = await signedInHeaders(db);
    const res = await createRecipe(app, headers, {
      title: "q",
      ingredients: [
        { quantity: "2-3", name: "a" },
        { quantity: "1/2", name: "b" },
        { quantity: "a pinch", name: "c" },
        { quantity: "1.5", unit: "kg", name: "d" },
        { name: "e" },
      ],
    });
    expect(res.status).toBe(201);
    const read = await json(await get(`/api/recipes/${(await json(res)).id}`, headers));
    expect(read.ingredients.map((i) => i.quantity)).toEqual(["2-3", "1/2", "a pinch", "1.5", null]);
    expect(read.ingredients[3]?.unit).toBe("kg");
    expect(read.ingredients[4]?.unit).toBeNull();
  });

  it("REC-07: tags are trimmed, lower-cased, de-duplicated and sorted; shared across users", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const first = await json(await createRecipe(app, alice, { title: "a", tags: ["Soup", "soup ", "Belgian"] }));
    expect(first.tags).toEqual(["belgian", "soup"]);
    const second = await json(await createRecipe(app, bob, { title: "b", tags: ["SOUP"] }));
    expect(second.tags).toEqual(["soup"]);
    const rows = await db.select({ name: tags.name }).from(tags);
    expect(rows.map((r) => r.name).sort()).toEqual(["belgian", "soup"]);
  });

  it("Review Focus 3: \"CRÈME\", \"crème\" and \" Crème \" make one tag", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(await createRecipe(app, headers, { title: "a", tags: ["CRÈME", "crème", " Crème "] }));
    expect(created.tags).toEqual(["crème"]);
    expect(await db.select().from(tags)).toHaveLength(1);
  });

  it("REC-11: no collectionId or null sits at Home; any given id is 404 \"Collection not found\" and creates nothing", async () => {
    const headers = await signedInHeaders(db);
    expect((await json(await createRecipe(app, headers, { title: "a" }))).collectionId).toBeNull();
    expect((await json(await createRecipe(app, headers, { title: "b", collectionId: null }))).collectionId).toBeNull();
    const refused = await createRecipe(app, headers, { title: "c", collectionId: 5 });
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: "Collection not found" });
    const [row] = await db.select({ n: count() }).from(recipes);
    expect(row?.n).toBe(2);
  });
});

describe("read", () => {
  it("REC-08: reads its own recipe; another user's or a missing id is 404 \"Recipe not found\"; \"abc\" is 400 \"Invalid recipe id\"", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const created = await json(await createRecipe(app, alice, { title: "mine", tags: ["a"], steps: [{ instruction: "s" }] }));
    const own = await get(`/api/recipes/${created.id}`, alice);
    expect(own.status).toBe(200);
    expect(await json(own)).toEqual(created);
    for (const path of [`/api/recipes/${created.id}`, "/api/recipes/9999"]) {
      const res = await get(path, bob);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Recipe not found" });
    }
    const bad = await get("/api/recipes/abc", alice);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Invalid recipe id" });
  });

  it("Review Focus 1: 99999999999 is 404, \"1e3\" and \"01\" are 400, and none reaches the database", async () => {
    const headers = await signedInHeaders(db);
    const huge = await get("/api/recipes/99999999999", headers);
    expect(huge.status).toBe(404);
    expect(await huge.json()).toEqual({ error: "Recipe not found" });
    for (const raw of ["1e3", "01", "0", "-1", "1.5", "2147483648x"]) {
      const res = await get(`/api/recipes/${raw}`, headers);
      expect(res.status, raw).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid recipe id" });
    }
    expect(parseRecipeId("2147483647")).toEqual({ ok: true, id: 2147483647 });
    expect(parseRecipeId("2147483648")).toEqual({ ok: false, status: 404 });
    // The id never leaves the parser: the session lookup is the only query.
    const spy = vi.spyOn(db, "select");
    await get("/api/recipes/99999999999", headers);
    expect(spy).toHaveBeenCalledTimes(1); // only the session lookup
    spy.mockRestore();
  });
});

describe("list", () => {
  it("REC-09: lists only my recipes, newest first, with their contents", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    await createRecipe(app, alice, { title: "first", tags: ["x"], ingredients: [{ name: "i" }], steps: [{ instruction: "s" }] });
    await createRecipe(app, bob, { title: "not mine" });
    await createRecipe(app, alice, { title: "second" });
    const res = await get("/api/recipes", alice);
    expect(res.status).toBe(200);
    const list = await json<RecipeDto[]>(res);
    expect(list.map((r) => r.title)).toEqual(["second", "first"]);
    expect(list[1]).toMatchObject({ tags: ["x"] });
    expect(list[1]?.ingredients).toHaveLength(1);
    expect(list[1]?.steps).toHaveLength(1);
    expect(list[0]?.images).toEqual([]);
  });

  it("REC-09 REC-10: a list takes six selects (seven with a tag filter: its exists subquery) (session, recipes, ingredients, steps, tags, images) however many recipes there are, filtered or not", async () => {
    const headers = await signedInHeaders(db);
    const selects = async (path: string) => {
      const spy = vi.spyOn(db, "select");
      await get(path, headers);
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    const add = (n: number) =>
      Promise.all(
        Array.from({ length: n }, (_, i) =>
          createRecipe(app, headers, {
            title: `r${i}`,
            tags: ["t"],
            ingredients: [{ name: "i" }],
            steps: [{ instruction: "s" }],
          }),
        ),
      );
    await add(2);
    const few = [await selects("/api/recipes"), await selects("/api/recipes?tag=t")];
    await add(3);
    const many = [await selects("/api/recipes"), await selects("/api/recipes?tag=t")];
    // Unfiltered: session + recipes + 4 child tables. Filtered: the same plus the
    // builder for the exists() subquery, which is not a round trip of its own.
    expect(few).toEqual([6, 7]);
    expect(many).toEqual([6, 7]);
  });

  it("REC-15 REC-09: images lists every stored image by position and coverImageId is the cover's id", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(await createRecipe(app, headers, { title: "p" }));
    const [hidden, cover] = await db
      .insert(recipeImages)
      .values([
        { recipeId: created.id, fileName: "a.jpg", contentType: "image/jpeg", position: 0, isCover: false },
        { recipeId: created.id, fileName: "b.jpg", contentType: "image/jpeg", position: 1, isCover: true },
      ])
      .returning({ id: recipeImages.id });
    if (!hidden || !cover) throw new Error("seed failed");
    for (const dto of [
      await json(await get(`/api/recipes/${created.id}`, headers)),
      (await json<RecipeDto[]>(await get("/api/recipes", headers)))[0],
    ]) {
      expect(dto?.coverImageId).toBe(cover.id);
      expect(dto?.images.map((i) => [i.id, i.position])).toEqual([
        [hidden.id, 0],
        [cover.id, 1],
      ]);
      expect(dto?.images[1]?.url).toBe(`/api/recipes/${created.id}/images/${cover.id}`);
      expect(dto?.images[1]?.cardUrl).toBe(`/api/recipes/${created.id}/images/${cover.id}?size=card`);
    }
  });

  it("REC-07: concurrent creates with the same tags in opposite order do not deadlock", async () => {
    const headers = await signedInHeaders(db);
    const names = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createRecipe(app, headers, { title: `c${i}`, tags: i % 2 ? names : [...names].reverse() }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
  });

  it("REC-10: tag= filters ignoring case; a recipe with two tags appears once; an empty tag is ignored", async () => {
    const headers = await signedInHeaders(db);
    await createRecipe(app, headers, { title: "both", tags: ["Soup", "Quick"] });
    await createRecipe(app, headers, { title: "soup only", tags: ["soup"] });
    await createRecipe(app, headers, { title: "none" });
    const titles = async (query: string) =>
      (await json<RecipeDto[]>(await get(`/api/recipes${query}`, headers))).map((r) => r.title);
    expect(await titles("?tag=SOUP")).toEqual(["soup only", "both"]);
    expect(await titles("?tag=quick")).toEqual(["both"]);
    expect(await titles("?tag=nothing")).toEqual([]);
    expect(await titles("?tag=")).toEqual(["none", "soup only", "both"]);
    expect(await titles("?tag=%20%20")).toEqual(["none", "soup only", "both"]);
  });

  it("REC-10 Review Focus 3: the tag filter folds accents and case the same way as writes", async () => {
    const headers = await signedInHeaders(db);
    await createRecipe(app, headers, { title: "dessert", tags: ["Crème"] });
    const res = await json<RecipeDto[]>(await get(`/api/recipes?tag=${encodeURIComponent("CRÈME")}`, headers));
    expect(res.map((r) => r.title)).toEqual(["dessert"]);
  });
});

const put = (id: number | string, headers: Record<string, string>, body: unknown) =>
  app.request(`/api/recipes/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const del = (id: number | string, headers: Record<string, string>) =>
  app.request(`/api/recipes/${id}`, { method: "DELETE", headers });
const fileExists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

describe("update", () => {
  it("REC-12: replaces fields, ingredients, steps and tags; keeps the collection and images; updatedAt moves forward", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(
      await createRecipe(app, headers, {
        title: "old",
        description: "d",
        servings: 2,
        prepTimeMinutes: 5,
        cookTimeMinutes: 6,
        ingredients: [{ name: "a" }, { name: "b" }, { name: "c" }],
        steps: [{ instruction: "one" }, { instruction: "two" }],
        tags: ["x", "y"],
      }),
    );
    await db.update(recipes).set({ collectionId: 7 }).where(eq(recipes.id, created.id));
    const [img] = await db
      .insert(recipeImages)
      .values({ recipeId: created.id, fileName: "a.jpg", contentType: "image/jpeg", position: 0, isCover: true })
      .returning({ id: recipeImages.id });
    await new Promise((r) => setTimeout(r, 20));

    const res = await put(created.id, headers, {
      title: "new",
      servings: 4,
      ingredients: [{ quantity: "1", name: "z" }],
      steps: [{ instruction: "only" }],
      tags: ["Y", "w"],
      collectionId: null,
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({
      id: created.id,
      title: "new",
      description: null,
      servings: 4,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      tags: ["w", "y"],
      collectionId: 7,
      coverImageId: img?.id,
    });
    expect(body.images.map((i) => i.id)).toEqual([img?.id]);
    expect(body.ingredients.map((i) => [i.position, i.name, i.quantity])).toEqual([[0, "z", "1"]]);
    expect(body.steps.map((s) => [s.position, s.instruction])).toEqual([[0, "only"]]);
    expect(body.createdAt).toBe(created.createdAt);
    expect(Date.parse(body.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    expect(await json(await get(`/api/recipes/${created.id}`, headers))).toEqual(body);
    const [ing] = await db.select({ n: count() }).from(ingredients);
    const [st] = await db.select({ n: count() }).from(steps);
    expect([ing?.n, st?.n]).toEqual([1, 1]);
  });

  it("REC-03 REC-12: an invalid body is 400 with the message and changes nothing", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(await createRecipe(app, headers, { title: "keep", tags: ["t"] }));
    const res = await put(created.id, headers, { title: " " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title is required" });
    expect(await json(await get(`/api/recipes/${created.id}`, headers))).toEqual(created);
  });

  it("REC-12 REC-08: PUT with a bad id is 400, a missing or oversized id is 404", async () => {
    const headers = await signedInHeaders(db);
    const bad = await put("abc", headers, { title: "x" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Invalid recipe id" });
    for (const id of [9999, "99999999999"]) {
      const res = await put(id, headers, { title: "x" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Recipe not found" });
    }
  });

  it("REC-12: another user's recipe is 404 and unchanged", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const created = await json(
      await createRecipe(app, alice, { title: "mine", tags: ["t"], steps: [{ instruction: "s" }] }),
    );
    const res = await put(created.id, bob, { title: "stolen" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Recipe not found" });
    expect(await json(await get(`/api/recipes/${created.id}`, alice))).toEqual(created);
  });

  it("REC-04: updating sourceUrl to null clears it", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(await createRecipe(app, headers, { title: "a", sourceUrl: "https://example.com/r" }));
    const kept = await json(await put(created.id, headers, { title: "a", sourceUrl: " https://example.com/s " }));
    expect(kept.sourceUrl).toBe("https://example.com/s");
    const cleared = await json(await put(created.id, headers, { title: "a", sourceUrl: null }));
    expect(cleared.sourceUrl).toBeNull();
    expect((await put(created.id, headers, { title: "a", sourceUrl: "ftp://x" })).status).toBe(400);
  });
});

describe("delete", () => {
  it("REC-13: deletes the recipe, its rows and its files (original and card); a missing file is fine; a later read is 404", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(
      await createRecipe(app, headers, {
        title: "gone",
        tags: ["t"],
        ingredients: [{ name: "i" }],
        steps: [{ instruction: "s" }],
      }),
    );
    await mkdir(uploadsDir, { recursive: true });
    for (const f of ["one.jpg", "one-card.jpg"]) await writeFile(join(uploadsDir, f), "x");
    await db.insert(recipeImages).values([
      { recipeId: created.id, fileName: "one.jpg", cardFileName: "one-card.jpg", contentType: "image/jpeg", position: 0, isCover: true },
      { recipeId: created.id, fileName: "missing.jpg", cardFileName: "missing-card.jpg", contentType: "image/jpeg", position: 1, isCover: false },
    ]);

    const res = await del(created.id, headers);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    for (const table of [recipes, ingredients, steps, recipeTags, recipeImages]) {
      const [row] = await db.select({ n: count() }).from(table);
      expect(row?.n).toBe(0);
    }
    expect(await fileExists(join(uploadsDir, "one.jpg"))).toBe(false);
    expect(await fileExists(join(uploadsDir, "one-card.jpg"))).toBe(false);
    const read = await get(`/api/recipes/${created.id}`, headers);
    expect(read.status).toBe(404);
    expect(await read.json()).toEqual({ error: "Recipe not found" });
  });

  it("REC-07: removing a recipe leaves its tag names in the tags table", async () => {
    const headers = await signedInHeaders(db);
    const created = await json(await createRecipe(app, headers, { title: "t", tags: ["soup", "quick"] }));
    expect((await del(created.id, headers)).status).toBe(204);
    const names = (await db.select({ name: tags.name }).from(tags)).map((t) => t.name);
    expect(names.sort()).toEqual(["quick", "soup"]);
  });

  it("REC-13: another user's recipe is 404 and nothing is deleted", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const created = await json(await createRecipe(app, alice, { title: "mine", tags: ["t"] }));
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, "keep.jpg"), "x");
    await db
      .insert(recipeImages)
      .values({ recipeId: created.id, fileName: "keep.jpg", contentType: "image/jpeg", position: 0, isCover: true });
    const res = await del(created.id, bob);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Recipe not found" });
    expect(await fileExists(join(uploadsDir, "keep.jpg"))).toBe(true);
    expect((await json(await get(`/api/recipes/${created.id}`, alice))).images).toHaveLength(1);
    expect((await del("abc", alice)).status).toBe(400);
  });
});

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getTestDb, resetDb } from "../../test/db.js";
import {
  ingredients,
  recipeImages,
  recipes,
  recipeTags,
  steps,
  tags,
  users,
} from "./schema.js";

const handle = await getTestDb();
const { db } = handle;
afterAll(() => handle.close());
beforeEach(() => resetDb(db));

async function seedRecipe(username = "cook") {
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: "x" })
    .returning();
  const [recipe] = await db
    .insert(recipes)
    .values({ userId: user!.id, title: "Soup" })
    .returning();
  return { user: user!, recipe: recipe! };
}

function pgCode(error: unknown): unknown {
  let e = error as { code?: unknown; cause?: unknown } | undefined;
  while (e) {
    if (e.code !== undefined) return e.code;
    e = e.cause as typeof e;
  }
  return undefined;
}

const image = (recipeId: number, n: number, isCover: boolean) => ({
  recipeId,
  fileName: `f${n}.jpg`,
  contentType: "image/jpeg",
  position: n,
  isCover,
});

describe("recipe tables", () => {
  it("design §6.1: one cover per recipe", async () => {
    const { recipe } = await seedRecipe();
    await db.insert(recipeImages).values(image(recipe.id, 0, true));
    const second = db.insert(recipeImages).values(image(recipe.id, 1, true));
    await expect(second).rejects.toSatisfy((e) => pgCode(e) === "23505");
    // non-cover images are unlimited, and another recipe can have its own cover
    await db.insert(recipeImages).values([image(recipe.id, 2, false), image(recipe.id, 3, false)]);
    const other = await db
      .insert(recipes)
      .values({ userId: recipe.userId, title: "Other" })
      .returning();
    await db.insert(recipeImages).values(image(other[0]!.id, 0, true));
  });

  it("REC-03 design §6.1: servings and times must be above zero", async () => {
    const { user } = await seedRecipe();
    for (const bad of [{ servings: 0 }, { prepTimeMinutes: 0 }, { cookTimeMinutes: -1 }]) {
      await expect(
        db.insert(recipes).values({ userId: user.id, title: "Bad", ...bad }),
      ).rejects.toSatisfy((e) => pgCode(e) === "23514");
    }
    await db.insert(recipes).values({ userId: user.id, title: "Ok", servings: 1 });
  });

  it("design §6.1 REC-15: recipe_images has a plain index on recipe_id for listing every image of a recipe", async () => {
    const rows = await db.execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where tablename = 'recipe_images' and indexname = 'recipe_images_recipe_idx'`,
    );
    expect([...rows].map((r) => r.indexdef)).toEqual([
      expect.stringMatching(/USING btree \(recipe_id\)$/),
    ]);
  });

  it("design §6.1: tag names are unique", async () => {
    await db.insert(tags).values({ name: "dinner" });
    await expect(db.insert(tags).values({ name: "dinner" })).rejects.toSatisfy(
      (e) => pgCode(e) === "23505",
    );
  });

  it("REC-13: deleting a user removes their recipes and rows below", async () => {
    const { user, recipe } = await seedRecipe();
    const [tag] = await db.insert(tags).values({ name: "dinner" }).returning();
    await db.insert(ingredients).values({ recipeId: recipe.id, position: 0, name: "water" });
    await db.insert(steps).values({ recipeId: recipe.id, position: 0, instruction: "Boil" });
    await db.insert(recipeTags).values({ recipeId: recipe.id, tagId: tag!.id });
    await db.insert(recipeImages).values(image(recipe.id, 0, true));

    await db.delete(users).where(eq(users.id, user.id));

    for (const table of [recipes, ingredients, steps, recipeTags, recipeImages]) {
      const rows = await db.select({ n: sql<number>`count(*)::int` }).from(table);
      expect(rows[0]?.n).toBe(0);
    }
    // tags are shared and never deleted
    expect(await db.select().from(tags)).toHaveLength(1);
  });
});

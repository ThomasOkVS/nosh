import {
  normaliseTag,
  type IngredientDto,
  type RecipeBody,
  type RecipeDto,
  type RecipeImageDto,
  type StepDto,
} from "@nosh/shared";
import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { ingredients, recipeImages, recipes, recipeTags, steps, tags } from "../db/schema.js";

type RecipeRow = typeof recipes.$inferSelect;

/** Distinct, normalised tag names (REC-07), computed in JS so accents fold the same way on write and filter. */
function tagNames(raw: string[]): string[] {
  return [...new Set(raw.map(normaliseTag))];
}

function imageDto(recipeId: number, row: typeof recipeImages.$inferSelect): RecipeImageDto {
  const url = `/api/recipes/${recipeId}/images/${row.id}`;
  return { id: row.id, position: row.position, url, cardUrl: `${url}?size=card` };
}

function group<T extends { recipeId: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const list = map.get(item.recipeId);
    if (list) list.push(item);
    else map.set(item.recipeId, [item]);
  }
  return map;
}

/** Loads the children of `rows` with one query per table, however many recipes there are. */
async function hydrate(db: Db, rows: RecipeRow[]): Promise<RecipeDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [ingredientRows, stepRows, tagRows, imageRows] = await Promise.all([
    db
      .select()
      .from(ingredients)
      .where(inArray(ingredients.recipeId, ids))
      .orderBy(asc(ingredients.position)),
    db.select().from(steps).where(inArray(steps.recipeId, ids)).orderBy(asc(steps.position)),
    db
      .select({ recipeId: recipeTags.recipeId, name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .where(inArray(recipeTags.recipeId, ids)),
    // Only the cover is ever shown; hidden v1 photos stay stored (REC-15, design §6.1).
    db
      .select()
      .from(recipeImages)
      .where(and(inArray(recipeImages.recipeId, ids), eq(recipeImages.isCover, true))),
  ]);

  const ingredientsBy = group(ingredientRows);
  const stepsBy = group(stepRows);
  const tagsBy = group(tagRows);
  const imagesBy = group(imageRows);

  return rows.map((r) => {
    const cover = imagesBy.get(r.id)?.[0];
    return {
      id: r.id,
      userId: r.userId,
      title: r.title,
      description: r.description,
      servings: r.servings,
      prepTimeMinutes: r.prepTimeMinutes,
      cookTimeMinutes: r.cookTimeMinutes,
      sourceUrl: r.sourceUrl,
      collectionId: r.collectionId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      ingredients: (ingredientsBy.get(r.id) ?? []).map(
        (i): IngredientDto => ({
          id: i.id,
          position: i.position,
          quantity: i.quantity,
          unit: i.unit,
          name: i.name,
        }),
      ),
      steps: (stepsBy.get(r.id) ?? []).map(
        (s): StepDto => ({ id: s.id, position: s.position, instruction: s.instruction }),
      ),
      tags: (tagsBy.get(r.id) ?? [])
        .map((t) => t.name)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      images: cover ? [imageDto(r.id, cover)] : [],
      coverImageId: cover?.id ?? null,
    };
  });
}

export type RecipeRepository = ReturnType<typeof createRecipeRepository>;

export function createRecipeRepository(db: Db) {
  async function get(userId: string, id: number): Promise<RecipeDto | null> {
    const rows = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
    return (await hydrate(db, rows))[0] ?? null;
  }

  return {
    get,

    /** REC-09, REC-10: newest first; the id breaks ties between recipes created in one instant. */
    async list(userId: string, filter: { tag?: string }): Promise<RecipeDto[]> {
      const name = filter.tag === undefined ? "" : normaliseTag(filter.tag);
      const tagged =
        name === ""
          ? undefined
          : exists(
              db
                .select({ one: sql`1` })
                .from(recipeTags)
                .innerJoin(tags, eq(tags.id, recipeTags.tagId))
                .where(and(eq(recipeTags.recipeId, recipes.id), eq(tags.name, name))),
            );
      const rows = await db
        .select()
        .from(recipes)
        .where(and(eq(recipes.userId, userId), tagged))
        .orderBy(desc(recipes.createdAt), desc(recipes.id));
      return hydrate(db, rows);
    },

    /** REC-02, REC-05, REC-07: one transaction, so a failure leaves nothing behind. */
    async create(userId: string, body: RecipeBody): Promise<RecipeDto> {
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(recipes)
          .values({
            userId,
            title: body.title,
            description: body.description,
            servings: body.servings,
            prepTimeMinutes: body.prepTimeMinutes,
            cookTimeMinutes: body.cookTimeMinutes,
            sourceUrl: body.sourceUrl,
            collectionId: body.collectionId ?? null,
          })
          .returning({ id: recipes.id });
        if (!row) throw new Error("recipe insert returned no row");
        const recipeId = row.id;

        if (body.ingredients.length > 0) {
          await tx.insert(ingredients).values(
            body.ingredients.map((i, position) => ({
              recipeId,
              position,
              quantity: i.quantity,
              unit: i.unit,
              name: i.name,
            })),
          );
        }
        if (body.steps.length > 0) {
          await tx
            .insert(steps)
            .values(
              body.steps.map((s, position) => ({ recipeId, position, instruction: s.instruction })),
            );
        }

        const names = tagNames(body.tags);
        if (names.length > 0) {
          await tx
            .insert(tags)
            .values(names.map((name) => ({ name })))
            .onConflictDoNothing({ target: tags.name });
          const tagRows = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(inArray(tags.name, names));
          await tx.insert(recipeTags).values(tagRows.map((t) => ({ recipeId, tagId: t.id })));
        }
        return recipeId;
      });
      const created = await get(userId, id);
      if (!created) throw new Error("created recipe not found");
      return created;
    },
  };
}

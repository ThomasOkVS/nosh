import { z } from "zod";

/** REC-03: the caps on a recipe (owner decision Q12). */
export const RECIPE_LIMITS = { title: 200, ingredients: 100, steps: 100, tags: 30 } as const;

/** The exact messages the API returns and the form shows for REC-03 and REC-04. */
export const RECIPE_MESSAGES = {
  titleRequired: "Title is required",
  titleTooLong: "Title must be at most 200 characters",
  descriptionBlank: "Description can't be blank",
  servings: "Servings must be a whole number of at least 1",
  prepTime: "Prep time must be a whole number of minutes, at least 1",
  cookTime: "Cook time must be a whole number of minutes, at least 1",
  tooManyIngredients: "At most 100 ingredients",
  tooManySteps: "At most 100 steps",
  tooManyTags: "At most 30 tags",
  ingredientName: "Every ingredient needs a name",
  stepInstruction: "Every step needs an instruction",
  tagBlank: "Tags can't be blank",
  sourceUrl: "Source URL must be an http or https link",
  quantityBlank: "Quantity can't be blank",
  unitBlank: "Unit can't be blank",
} as const;

/** The largest value a Postgres integer column holds. */
export const MAX_INT4 = 2147483647;

const M = RECIPE_MESSAGES;

/** A whole number of at least 1, or null when omitted. */
const positiveInt = (message: string) =>
  z
    .number({ error: message })
    .int(message)
    .min(1, message)
    .max(MAX_INT4, message)
    .nullish()
    .transform((v) => v ?? null);

/** Trimmed, non-blank text, or null when omitted. */
const optionalText = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .nullish()
    .transform((v) => v ?? null);

const httpUrl = z
  .string({ error: M.sourceUrl })
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: M.sourceUrl }))
  .nullish()
  .transform((v) => v ?? null);

const ingredientBody = z.object({
  quantity: optionalText(M.quantityBlank),
  unit: optionalText(M.unitBlank),
  name: z.string({ error: M.ingredientName }).trim().min(1, M.ingredientName),
});

const stepBody = z.object({
  instruction: z.string({ error: M.stepInstruction }).trim().min(1, M.stepInstruction),
});

/**
 * REC-03, REC-04: the body of a create or update. Omitted optional fields become
 * null and omitted lists become []. `collectionId` stays undefined when omitted so
 * that an update never moves a recipe as a side effect (REC-11, REC-12).
 */
export const recipeBody = z.object({
  title: z
    .string({ error: M.titleRequired })
    .trim()
    .min(1, M.titleRequired)
    .max(RECIPE_LIMITS.title, M.titleTooLong),
  description: optionalText(M.descriptionBlank),
  servings: positiveInt(M.servings),
  prepTimeMinutes: positiveInt(M.prepTime),
  cookTimeMinutes: positiveInt(M.cookTime),
  sourceUrl: httpUrl,
  collectionId: z.number().int().positive().nullable().optional(),
  ingredients: z.array(ingredientBody).max(RECIPE_LIMITS.ingredients, M.tooManyIngredients).default([]),
  steps: z.array(stepBody).max(RECIPE_LIMITS.steps, M.tooManySteps).default([]),
  tags: z
    .array(z.string().trim().min(1, M.tagBlank))
    .max(RECIPE_LIMITS.tags, M.tooManyTags)
    .default([]),
});
export type RecipeBody = z.output<typeof recipeBody>;

/** REC-07: a tag is stored trimmed and lower-cased. */
export const normaliseTag = (raw: string): string => raw.trim().toLocaleLowerCase("en");

export type IngredientDto = {
  id: number;
  position: number;
  quantity: string | null;
  unit: string | null;
  name: string;
};

export type StepDto = { id: number; position: number; instruction: string };

export type RecipeImageDto = { id: number; position: number; url: string; cardUrl: string };

export type RecipeDto = {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceUrl: string | null;
  collectionId: number | null;
  createdAt: string;
  updatedAt: string;
  ingredients: IngredientDto[];
  steps: StepDto[];
  tags: string[];
  images: RecipeImageDto[];
  coverImageId: number | null;
};

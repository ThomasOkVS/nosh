import { MAX_INT4, RECIPE_LIMITS, RECIPE_MESSAGES, type RecipeBody, type RecipeDto } from "@nosh/shared";
import { z } from "zod";

/** The form's fields as typed: every value is a string until the submit transform. */
export type RecipeFormValues = {
  title: string;
  description: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  ingredients: { quantity: string; unit: string; name: string }[];
  steps: { instruction: string }[];
  tags: string[];
};

/** What the submit transform produces; the caller adds `sourceUrl` (and later `collectionId`). */
export type RecipeFormOutput = Omit<RecipeBody, "sourceUrl" | "collectionId">;

export const emptyIngredient = () => ({ quantity: "", unit: "", name: "" });
export const emptyStep = () => ({ instruction: "" });

/** REC-27: a blank form starts with one empty ingredient row and one empty step row. */
export function emptyFormValues(): RecipeFormValues {
  return {
    title: "",
    description: "",
    servings: "",
    prepTimeMinutes: "",
    cookTimeMinutes: "",
    ingredients: [emptyIngredient()],
    steps: [emptyStep()],
    tags: [],
  };
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
const text = (value: string | null) => value ?? "";
const whole = (value: number | null) => (value === null ? "" : String(value));

/** REC-27: a stored recipe in the fields; an empty list still gets one empty row. */
export function toFormValues(recipe: RecipeDto): RecipeFormValues {
  const ingredients = [...recipe.ingredients].sort(byPosition).map((i) => ({
    quantity: text(i.quantity),
    unit: text(i.unit),
    name: i.name,
  }));
  const steps = [...recipe.steps].sort(byPosition).map((s) => ({ instruction: s.instruction }));
  return {
    title: recipe.title,
    description: text(recipe.description),
    servings: whole(recipe.servings),
    prepTimeMinutes: whole(recipe.prepTimeMinutes),
    cookTimeMinutes: whole(recipe.cookTimeMinutes),
    ingredients: ingredients.length > 0 ? ingredients : [emptyIngredient()],
    steps: steps.length > 0 ? steps : [emptyStep()],
    tags: [...recipe.tags],
  };
}

const M = RECIPE_MESSAGES;

/** Trimmed text, or null when blank. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/**
 * REC-28, REC-29: blank is null; otherwise a whole number from 1 to the
 * database maximum. A typed "0" is refused with the field's message.
 */
const positiveWhole = (message: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = /^\d+$/.test(v) ? Number(v) : NaN;
      if (!(n >= 1 && n <= MAX_INT4)) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });

const ingredientRow = z.object({ quantity: optionalText, unit: optionalText, name: z.string().trim() });
const stepRow = z.object({ instruction: z.string().trim() });

/**
 * Design §6.4 form schema: the strings as typed in, the API body out. Blank
 * rows are dropped before the caps are counted (REC-29), and the caps and
 * messages are the API's own (REC-28), so an over-cap import draft is refused
 * with the message naming the cap.
 */
export const recipeFormSchema = z.object({
  title: z.string().trim().min(1, M.titleRequired).max(RECIPE_LIMITS.title, M.titleTooLong),
  description: optionalText,
  servings: positiveWhole(M.servings),
  prepTimeMinutes: positiveWhole(M.prepTime),
  cookTimeMinutes: positiveWhole(M.cookTime),
  ingredients: z
    .array(ingredientRow)
    .transform((rows) => rows.filter((row) => row.name !== ""))
    .pipe(
      z
        .array(z.object({ quantity: z.string().nullable(), unit: z.string().nullable(), name: z.string() }))
        .max(RECIPE_LIMITS.ingredients, M.tooManyIngredients),
    ),
  steps: z
    .array(stepRow)
    .transform((rows) => rows.filter((row) => row.instruction !== ""))
    .pipe(z.array(z.object({ instruction: z.string() })).max(RECIPE_LIMITS.steps, M.tooManySteps)),
  // Tags are sent as entered; the tag field already trims, lower-cases and caps them (REC-35).
  tags: z.array(z.string()).max(RECIPE_LIMITS.tags, M.tooManyTags),
}) satisfies z.ZodType<RecipeFormOutput, RecipeFormValues>;

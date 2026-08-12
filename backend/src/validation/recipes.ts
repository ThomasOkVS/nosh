import { z } from "zod";

const ingredientSchema = z.object({
  quantity: z.string().trim().min(1).nullable().default(null),
  unit: z.string().trim().min(1).nullable().default(null),
  name: z.string().trim().min(1),
});

const stepSchema = z.object({
  instruction: z.string().trim().min(1),
});

export const recipeSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().default(null),
  servings: z.number().int().positive().nullable().default(null),
  prepTimeMinutes: z.number().int().nonnegative().nullable().default(null),
  cookTimeMinutes: z.number().int().nonnegative().nullable().default(null),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(stepSchema).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  // The protocol restriction matters: zod's bare `url()` accepts
  // `javascript:alert(1)`, and this field is rendered as an `<a href>` on the
  // detail page. React blocks javascript: hrefs today, but that shouldn't be
  // the only thing standing between a stored value and an XSS.
  sourceUrl: z.url({ protocol: /^https?$/ }).trim().nullable().default(null),
});

export type RecipeInput = z.infer<typeof recipeSchema>;

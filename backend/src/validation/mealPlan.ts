import { z } from "zod";

export const mealPlanEntrySchema = z.object({
  recipeId: z.number().int().positive(),
});

export type MealPlanEntryInput = z.infer<typeof mealPlanEntrySchema>;

export const mealPlanRangeSchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
});

export type MealPlanRangeInput = z.infer<typeof mealPlanRangeSchema>;

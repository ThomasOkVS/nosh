import { apiFetch } from "./client";
import type { MealPlanEntry } from "./types";

export function getMealPlanRange(start: string, end: string): Promise<MealPlanEntry[]> {
  return apiFetch<MealPlanEntry[]>(`/meal-plan?start=${start}&end=${end}`);
}

export function setMealPlanEntry(date: string, recipeId: number): Promise<MealPlanEntry> {
  return apiFetch<MealPlanEntry>(`/meal-plan/${date}`, { method: "PUT", body: { recipeId } });
}

export function clearMealPlanEntry(date: string): Promise<void> {
  return apiFetch<void>(`/meal-plan/${date}`, { method: "DELETE" });
}

export interface User {
  id: number;
  email: string;
  username: string;
}

export interface Ingredient {
  id: number;
  position: number;
  quantity: string | null;
  unit: string | null;
  name: string;
}

export interface Step {
  id: number;
  position: number;
  instruction: string;
}

export interface RecipeImage {
  id: number;
  filePath: string;
  position: number;
}

export interface Recipe {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  images: RecipeImage[];
}

export interface IngredientInput {
  quantity: string | null;
  unit: string | null;
  name: string;
}

export interface StepInput {
  instruction: string;
}

export interface RecipeInput {
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: IngredientInput[];
  steps: StepInput[];
  tags: string[];
  sourceUrl: string | null;
}

export interface Collection {
  id: number;
  name: string;
  createdAt: string;
  recipeCount: number;
}

export interface RecipeCollectionSummary {
  id: number;
  name: string;
}

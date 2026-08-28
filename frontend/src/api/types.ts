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
  collectionId: number;
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
  // Only meaningful on create (a new recipe with no explicit choice falls
  // back to the owner's "Other" collection server-side) — editing a recipe
  // never moves it; that's a separate action, see RecipeCollectionPicker.
  // Optional (unlike the rest of this interface) so call sites that only
  // ever build an edit-mode payload, or imported/pre-fill data that never
  // carries a collection, aren't forced to spell out a value that's ignored
  // anyway.
  collectionId?: number | null;
}

export interface Collection {
  id: number;
  parentId: number | null;
  name: string;
  createdAt: string;
  recipeCount: number;
}

/** The response shape for a single collection's contents: the collection
 * itself, the sub-collections nested directly inside it, and the recipes
 * filed directly in it — everything one "folder view" needs in one call. */
export interface CollectionContents {
  collection: Collection;
  subCollections: Collection[];
  recipes: Recipe[];
}

/** One day's meal-plan assignment. `date` is a plain "YYYY-MM-DD" string,
 * never a Date — see lib/week.ts for why. */
export interface MealPlanEntry {
  id: number;
  date: string;
  recipe: Recipe;
}

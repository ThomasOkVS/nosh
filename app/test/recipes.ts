import type { RecipeDto, RecipeImageDto } from "@nosh/shared";

/** A recipe as the API returns it; override what the test cares about. */
export function recipeDto(overrides: Partial<RecipeDto> & Pick<RecipeDto, "id" | "title">): RecipeDto {
  return {
    userId: "u1",
    description: null,
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    sourceUrl: null,
    collectionId: null,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ingredients: [],
    steps: [],
    tags: [],
    images: [],
    coverImageId: null,
    ...overrides,
  };
}

/** An image row with the URLs the server builds for it. */
export function imageDto(recipeId: number, id: number, position = 0): RecipeImageDto {
  const url = `/api/recipes/${recipeId}/images/${id}`;
  return { id, position, url, cardUrl: `${url}?size=card` };
}

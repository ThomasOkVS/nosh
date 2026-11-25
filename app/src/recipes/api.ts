import type { RecipeBody, RecipeDto, RecipeImageDto } from "@nosh/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "@/lib/api";

const RECIPES_KEY = ["recipes"] as const;

/** Every recipe of the owner; the library filters it on the client. */
export const recipesQuery = queryOptions({
  queryKey: RECIPES_KEY,
  queryFn: async (): Promise<RecipeDto[]> => {
    const res = await api.api.recipes.$get({ query: {} });
    if (!res.ok) throw await toApiError(res);
    return await res.json();
  },
});

export const recipeQuery = (id: number) =>
  queryOptions({
    queryKey: ["recipes", id],
    queryFn: async (): Promise<RecipeDto> => {
      const res = await api.api.recipes[":id"].$get({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
      return await res.json();
    },
  });

/** Every successful change makes the library and recipe pages refetch. */
function useInvalidateRecipes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: RECIPES_KEY });
}

export function useCreateRecipe() {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: async (body: RecipeBody): Promise<RecipeDto> => {
      const res = await api.api.recipes.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return await res.json();
    },
    onSuccess: invalidate,
  });
}

export function useUpdateRecipe(id: number) {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: async (body: RecipeBody): Promise<RecipeDto> => {
      const res = await api.api.recipes[":id"].$put({ param: { id: String(id) }, json: body });
      if (!res.ok) throw await toApiError(res);
      return await res.json();
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRecipe(id: number) {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await api.api.recipes[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: invalidate,
  });
}

/** Sends the file as multipart field "file"; the browser sets the Content-Type. */
export function useUploadCover(recipeId: number) {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: async (file: File): Promise<RecipeImageDto> => {
      // The route reads the multipart body itself, so the typed client has no form input.
      const body = new FormData();
      body.append("file", file);
      const url = new URL(`/api/recipes/${recipeId}/images`, window.location.origin);
      const res = await fetch(url, { method: "POST", body });
      if (!res.ok) throw await toApiError(res);
      return (await res.json()) as RecipeImageDto;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteImage(recipeId: number) {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: async (imageId: number): Promise<void> => {
      const res = await api.api.recipes[":id"].images[":imageId"].$delete({
        param: { id: String(recipeId), imageId: String(imageId) },
      });
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: invalidate,
  });
}

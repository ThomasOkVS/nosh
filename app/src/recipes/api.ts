import type { RecipeBody, RecipeDto, RecipeImageDto } from "@nosh/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, GENERIC_ERROR, toApiError } from "@/lib/api";

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

/**
 * REC-30: the saved recipe goes straight into its page's cache and the
 * library refresh is not awaited, so the caller's navigation never waits on a
 * refetch and the recipe page shows what was just saved.
 */
function useStoreSaved() {
  const queryClient = useQueryClient();
  return (saved: RecipeDto) => {
    queryClient.setQueryData(recipeQuery(saved.id).queryKey, saved);
    void queryClient.invalidateQueries({ queryKey: RECIPES_KEY });
  };
}

export function useCreateRecipe() {
  const storeSaved = useStoreSaved();
  return useMutation({
    mutationFn: async (body: RecipeBody): Promise<RecipeDto> => {
      const res = await api.api.recipes.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return await res.json();
    },
    onSuccess: storeSaved,
  });
}

export function useUpdateRecipe(id: number) {
  const storeSaved = useStoreSaved();
  return useMutation({
    mutationFn: async (body: RecipeBody): Promise<RecipeDto> => {
      const res = await api.api.recipes[":id"].$put({ param: { id: String(id) }, json: body });
      if (!res.ok) throw await toApiError(res);
      return await res.json();
    },
    onSuccess: storeSaved,
  });
}

/**
 * REC-24: the deleted recipe leaves the cache rather than being refetched
 * (a 404, retried in production), and the library refresh is not awaited, so
 * the caller's navigation never waits on either.
 */
export function useDeleteRecipe(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await api.api.recipes[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: recipeQuery(id).queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}

export const UPLOAD_FAILED = "Failed to upload image";

/**
 * Sends the file as multipart field "file"; the browser sets the Content-Type.
 * REC-33: the server's reason is kept; with none (or no answer at all) the
 * error says "Failed to upload image".
 */
async function postCover(recipeId: number, file: File): Promise<RecipeImageDto> {
  // The route reads the multipart body itself, so the typed client has no form input.
  const body = new FormData();
  body.append("file", file);
  const url = new URL(`/api/recipes/${recipeId}/images`, window.location.origin);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body });
  } catch {
    throw new ApiError(UPLOAD_FAILED, 0);
  }
  if (!res.ok) {
    const error = await toApiError(res);
    throw error.message === GENERIC_ERROR ? new ApiError(UPLOAD_FAILED, error.status) : error;
  }
  return (await res.json()) as RecipeImageDto;
}

/**
 * The cache refresh is part of the mutation (it is returned, so awaited): the
 * form shows the new cover as soon as the upload settles.
 */
export function useUploadCover(recipeId: number) {
  const invalidate = useInvalidateRecipes();
  return useMutation({
    mutationFn: (file: File) => postCover(recipeId, file),
    onSuccess: invalidate,
  });
}

/** The create form's upload: the id is only known once the recipe is saved. */
export function useUploadNewCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, file }: { recipeId: number; file: File }) => postCover(recipeId, file),
    // Not awaited, like useStoreSaved: the owner's navigation never waits on a refetch.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RECIPES_KEY });
    },
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

import type { AuthUserDto, LogInBody, SignUpBody } from "@nosh/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "@/lib/api";

/**
 * AUTH-17: who is logged in. Any failure, a 401 or the network being down,
 * counts as logged out, so the guard sends the visitor to login.
 */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<AuthUserDto | null> => {
    try {
      const res = await api.api.auth.me.$get();
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
  retry: false,
});

/** AUTH-07: on success the session holds the account at once. */
export function useLogIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LogInBody): Promise<AuthUserDto> => {
      const res = await api.api.auth.login.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (user) => queryClient.setQueryData(sessionQuery.queryKey, user),
  });
}

/** AUTH-01: a new account is logged in immediately. */
export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SignUpBody): Promise<AuthUserDto> => {
      const res = await api.api.auth.signup.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (user) => queryClient.setQueryData(sessionQuery.queryKey, user),
  });
}

/** AUTH-14: ends the session; the guard then treats the visitor as logged out. */
export function useLogOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await api.api.auth.logout.$post();
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: () => queryClient.setQueryData(sessionQuery.queryKey, null),
  });
}

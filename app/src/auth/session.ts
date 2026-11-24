import type { AuthUserDto, LogInBody, SignUpBody } from "@nosh/shared";
import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError, toApiError } from "@/lib/api";

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

export const SESSION_NOT_KEPT =
  "Signed in, but this browser didn't keep the session. Check the connection is HTTPS.";

/**
 * SEC-09: a 200 from login or sign-up does not prove the browser stored the
 * cookie (production sets none over plain HTTP or behind a wrong
 * TRUSTED_PROXIES). Ask the server afresh; that answer also fills the session.
 */
async function confirmSession(queryClient: QueryClient): Promise<AuthUserDto> {
  const user = await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
  if (user === null) throw new ApiError(SESSION_NOT_KEPT, 401);
  return user;
}

/** AUTH-07: on success the session holds the account at once. */
export function useLogIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LogInBody): Promise<AuthUserDto> => {
      const res = await api.api.auth.login.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return confirmSession(queryClient);
    },
  });
}

/** AUTH-01: a new account is logged in immediately. */
export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SignUpBody): Promise<AuthUserDto> => {
      const res = await api.api.auth.signup.$post({ json: body });
      if (!res.ok) throw await toApiError(res);
      return confirmSession(queryClient);
    },
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

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { sessionQuery } from "@/auth/session";
import { ApiError } from "./api";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { authRequest?: boolean };
  }
}

let onUnauthorized: (() => void) | undefined;

/** `App` registers what happens after a 401: re-run the route guards. Returns an unregister. */
export function setOnUnauthorized(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = undefined;
  };
}

/**
 * AUTH-12 AUTH-16: a 401 from any data call means the session is gone. Mark
 * the session empty and let the guard send the owner to login, with this
 * address kept. Login and sign-up answer 401 for a wrong password (AUTH-09),
 * so they opt out with `meta: { authRequest: true }`. The session query itself
 * never throws (it maps any failure to "logged out"), so it cannot loop.
 */
export function createQueryClient(opts: { test?: boolean } = {}): QueryClient {
  const handle = (error: unknown, authRequest: boolean | undefined) => {
    if (authRequest || !(error instanceof ApiError) || error.status !== 401) return;
    queryClient.clear(); // no data of this session may outlive it
    queryClient.setQueryData(sessionQuery.queryKey, null);
    onUnauthorized?.();
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handle(error, undefined) }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => handle(error, mutation.meta?.authRequest),
    }),
    defaultOptions: {
      queries: { retry: opts.test ? false : 1 },
      mutations: { retry: false },
    },
  });
  return queryClient;
}

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { Loading } from "@/components/Loading";
import { routeTree } from "./routeTree.gen";

interface AppRouterOptions {
  queryClient: QueryClient;
  /** Browser history by default; tests pass a memory history. */
  history?: RouterHistory;
}

export function createAppRouter({ queryClient, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    // "Loading" while a route waits. Later loaders get a short delay so a
    // fast one doesn't flash it; the session guard (_app) overrides the delay
    // to 0 for AUTH-17. Once shown it stays briefly.
    defaultPendingComponent: Loading,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

interface AppProps {
  router: ReturnType<typeof createAppRouter>;
  queryClient: QueryClient;
}

export function App({ router, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  );
}

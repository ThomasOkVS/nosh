import { createMemoryHistory } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App, createAppRouter } from "@/router";

/** Renders the whole app at `path` with an in-memory history. */
export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  // Every address the app passes through, redirects included.
  const visited: string[] = [];
  history.subscribe(({ location }) => visited.push(location.href));
  const router = createAppRouter({ queryClient, history });
  const user = userEvent.setup();
  render(<App router={router} queryClient={queryClient} />);
  return { router, visited, user };
}

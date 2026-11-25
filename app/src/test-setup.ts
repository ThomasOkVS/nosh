import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../test/msw";

// findBy* and waitFor wait up to 3 s (default 1 s): the first render of a
// screen also loads its code-split route, which is slow under load.
configure({ asyncUtilTimeout: 3000 });

// jsdom has no scrolling; the router's scroll restoration calls it.
window.scrollTo = () => {};

// Vitest globals are off, so Testing Library cannot register this itself.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// jsdom has no matchMedia; Sonner reads the system colour scheme through it.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

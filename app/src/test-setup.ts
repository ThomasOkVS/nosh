import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "../test/msw";

// findBy* and waitFor wait up to 3 s (default 1 s): the first render of a
// screen also loads its code-split route, which is slow under load.
configure({ asyncUtilTimeout: 3000 });

// jsdom has no scrolling; the router's scroll restoration calls it.
window.scrollTo = () => {};

// jsdom has no matchMedia; Sonner reads the system colour scheme through it.
// A vi.fn, so a test can answer a query its own way (mockReturnValue); every
// test starts again from "matches nothing".
const noMatch = (query: string) =>
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
const matchMedia = vi.fn(noMatch);
window.matchMedia = matchMedia;

// Vitest globals are off, so Testing Library cannot register this itself.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  // Sonner's toast store is global; clear it so a toast never leaks into the next test.
  toast.dismiss();
  cleanup();
  server.resetHandlers();
  matchMedia.mockReset();
  matchMedia.mockImplementation(noMatch);
});
afterAll(() => server.close());

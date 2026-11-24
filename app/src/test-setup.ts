import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../test/msw";

// jsdom has no scrolling; the router's scroll restoration calls it.
window.scrollTo = () => {};

// Vitest globals are off, so Testing Library cannot register this itself.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

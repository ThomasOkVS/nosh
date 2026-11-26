import type { AuthUserDto } from "@nosh/shared";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/**
 * One MSW server for every component test; each test adds its handlers.
 * The library at "/" lists recipes, so by default the owner has none; tests
 * that need recipes override it. `resetHandlers()` keeps this default.
 */
export const server = setupServer(http.get("/api/recipes", () => HttpResponse.json([])));

export const owner: AuthUserDto = { id: "u1", username: "thomas" };

/** A promise the test settles itself, to hold a response "pending". */
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

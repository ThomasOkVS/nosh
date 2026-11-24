import type { AuthUserDto } from "@nosh/shared";
import { setupServer } from "msw/node";

/** One MSW server for every component test; each test adds its handlers. */
export const server = setupServer();

export const owner: AuthUserDto = { id: "u1", username: "thomas" };

/** A promise the test settles itself, to hold a response "pending". */
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

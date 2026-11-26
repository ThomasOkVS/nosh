import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../src/db/client.js";
import { createImageStore } from "../src/images/store.js";

/**
 * `db` and `images` for tests that never touch recipes. postgres-js connects on
 * the first query, so this never opens a socket, and the store writes nothing
 * until asked to.
 */
export const unusedDeps = {
  db: createDb("postgres://unused").db,
  images: createImageStore(join(tmpdir(), "nosh-unused-images")),
};

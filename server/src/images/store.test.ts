import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createImageStore } from "./store.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "nosh-img-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("image store", () => {
  it("SEC-24: names are random and unguessable", async () => {
    const store = createImageStore(dir);
    const a = await store.save(Buffer.from("a"), "jpg");
    const b = await store.save(Buffer.from("b"), "jpg");
    expect(a).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(b).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(a).not.toBe(b);
    expect((await readFile(store.path(a))).toString()).toBe("a");
  });

  it("REC-13 REC-17: remove ignores files already gone", async () => {
    const store = createImageStore(dir);
    const a = await store.save(Buffer.from("a"), "webp");
    await expect(store.remove([a, "0".repeat(32) + ".webp"])).resolves.toBeUndefined();
    await expect(readFile(store.path(a))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

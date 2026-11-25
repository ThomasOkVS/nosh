import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImageStore, UnsafeFileNameError } from "./store.js";

const BACKSLASH = String.fromCharCode(92);

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

  it("design §6.2: a write that fails after the file was created leaves no partial file", async () => {
    const store = createImageStore(dir);
    // writeFile takes an async iterable: the first chunk lands on disk, then the source fails,
    // the way ENOSPC or EIO would part-way through a write.
    async function* failing() {
      yield Buffer.from("partial");
      throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    }
    await expect(store.save(failing() as unknown as Buffer, "jpg")).rejects.toMatchObject({
      code: "ENOSPC",
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it.each(["../x.jpg", "..", ".", "a/b.jpg", `a${BACKSLASH}b.jpg`, "", "c:x.jpg", "x.jpg\u0000", "x y.jpg"])(
    "SEC-24: path refuses the unsafe stored name %j",
    (name) => {
      const store = createImageStore(dir);
      expect(() => store.path(name)).toThrow(UnsafeFileNameError);
    },
  );

  it("SEC-24: path accepts plain names, also v1 shapes that are not 32 hex", () => {
    const store = createImageStore(dir);
    for (const name of ["0123abcd.jpg", "IMG_0001-v1.JPEG", ".hidden"]) {
      expect(store.path(name)).toBe(join(dir, name));
    }
  });

  it("SEC-24 REC-17: remove skips and logs an unsafe name and still removes the rest", async () => {
    const store = createImageStore(dir);
    const outside = join(dir, "..", `${basename(dir)}-outside.txt`);
    await writeFile(outside, "keep");
    const a = await store.save(Buffer.from("a"), "jpg");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(store.remove([`../${basename(outside)}`, a])).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toContain("unsafe image file name");
      expect((await readFile(outside)).toString()).toBe("keep");
      expect(await readdir(dir)).toEqual([]);
    } finally {
      log.mockRestore();
      await rm(outside, { force: true });
    }
  });
});

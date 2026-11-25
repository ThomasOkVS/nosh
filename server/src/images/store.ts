import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ImageStore = {
  save(bytes: Buffer, ext: string): Promise<string>;
  /** Throws UnsafeFileNameError for anything but a plain file name. */
  path(fileName: string): string;
  /** Skips (and logs) unsafe names; a file already gone is not an error. */
  remove(fileNames: string[]): Promise<void>;
};

/** A stored name that is not a plain file name in the store's directory. */
export class UnsafeFileNameError extends Error {
  constructor(fileName: string) {
    super(`unsafe image file name ${JSON.stringify(fileName)}`);
    this.name = "UnsafeFileNameError";
  }
}

/**
 * SEC-24: names come from the database, and rows migrated from v1 may carry other
 * shapes than ours, so only a plain basename may reach the file system (no separators,
 * no `.` or `..`).
 */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const isSafeName = (name: string) => SAFE_NAME.test(name) && name !== "." && name !== "..";

const isCode = (err: unknown, code: string) => (err as NodeJS.ErrnoException).code === code;

/** Files on disk under random names; the name is the only handle (SEC-24). */
export function createImageStore(dir: string): ImageStore {
  function path(fileName: string): string {
    if (!isSafeName(fileName)) throw new UnsafeFileNameError(fileName);
    return join(dir, fileName);
  }

  async function removeOne(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (err) {
      if (!isCode(err, "ENOENT")) throw err;
    }
  }

  return {
    async save(bytes, ext) {
      await mkdir(dir, { recursive: true });
      const fileName = `${randomBytes(16).toString("hex")}.${ext}`;
      const filePath = path(fileName);
      try {
        await writeFile(filePath, bytes, { flag: "wx" });
      } catch (err) {
        // A write that fails after creating the file (ENOSPC, EIO) must not leave a
        // partial file the caller never learns about. EEXIST means the file is not ours.
        if (!isCode(err, "EEXIST")) await removeOne(filePath);
        throw err;
      }
      return fileName;
    },
    path,
    async remove(fileNames) {
      await Promise.all(
        fileNames.map(async (name) => {
          if (!isSafeName(name)) {
            console.error(JSON.stringify({ level: "error", error: "unsafe image file name skipped", name }));
            return;
          }
          await removeOne(path(name));
        }),
      );
    },
  };
}

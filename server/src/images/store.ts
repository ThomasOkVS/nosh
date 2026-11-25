import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ImageStore = {
  save(bytes: Buffer, ext: string): Promise<string>;
  path(fileName: string): string;
  remove(fileNames: string[]): Promise<void>;
};

/** Files on disk under random names; the name is the only handle (SEC-24). */
export function createImageStore(dir: string): ImageStore {
  return {
    async save(bytes, ext) {
      await mkdir(dir, { recursive: true });
      const fileName = `${randomBytes(16).toString("hex")}.${ext}`;
      await writeFile(join(dir, fileName), bytes, { flag: "wx" });
      return fileName;
    },
    path: (fileName) => join(dir, fileName),
    async remove(fileNames) {
      await Promise.all(
        fileNames.map(async (name) => {
          try {
            await unlink(join(dir, name));
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
        }),
      );
    },
  };
}

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_INT4, type RecipeDto, type RecipeImageDto } from "@nosh/shared";
import { asc, count, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appWith, createRecipe, makeRecipeApp, signedInHeaders, type Headers } from "../../test/recipes.js";
import { recipeImages, recipes } from "../db/schema.js";
import { MAX_IMAGE_BYTES } from "../images/process.js";
import { createImageStore, type ImageStore } from "../images/store.js";

const { app, db, uploadsDir } = await makeRecipeApp();

// makeRecipeApp resets the database, not the uploads dir: start every test with no files.
beforeEach(() => rm(uploadsDir, { recursive: true, force: true }));

const fx = (name: string) =>
  readFile(fileURLToPath(new URL(`../../test/fixtures/images/${name}`, import.meta.url)));

const json = async <T>(res: Response) => (await res.json()) as T;

function upload(recipeId: number | string, headers: Headers, file?: File | string) {
  const form = new FormData();
  if (file !== undefined) form.append("file", file);
  return app.request(`/api/recipes/${recipeId}/images`, { method: "POST", headers, body: form });
}

const fileOf = (bytes: Uint8Array, type: string, name = "photo") =>
  new File([new Uint8Array(bytes)], name, { type });

const tinyPng = async () => fileOf(await fx("tiny.png"), "image/png", "tiny.png");

async function filesOnDisk(): Promise<string[]> {
  try {
    return (await readdir(uploadsDir)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function storedFileNames(): Promise<string[]> {
  const rows = await db.select().from(recipeImages);
  return rows.flatMap((r) => (r.cardFileName ? [r.fileName, r.cardFileName] : [r.fileName])).sort();
}

async function imageRowCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(recipeImages);
  return row?.n ?? 0;
}

async function newRecipe(headers: Headers, title = "Soup"): Promise<RecipeDto> {
  return json<RecipeDto>(await createRecipe(app, headers, { title }));
}

const readRecipe = async (id: number, headers: Headers) =>
  json<RecipeDto>(await app.request(`/api/recipes/${id}`, { headers }));

const isWebp = (b: Buffer) =>
  b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";

describe("upload", () => {
  it("REC-14 REC-15: uploading to a recipe with no cover answers 201 and becomes the cover", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const res = await upload(recipe.id, headers, await tinyPng());
    expect(res.status).toBe(201);
    const image = await json<RecipeImageDto>(res);
    expect(image).toEqual({
      id: image.id,
      position: 0,
      url: `/api/recipes/${recipe.id}/images/${image.id}`,
      cardUrl: `/api/recipes/${recipe.id}/images/${image.id}?size=card`,
    });
    const after = await readRecipe(recipe.id, headers);
    expect(after.coverImageId).toBe(image.id);
    expect(after.images.map((i) => i.id)).toEqual([image.id]);

    const [row] = await db.select().from(recipeImages);
    expect(row?.contentType).toBe("image/png");
    expect(row?.fileName).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(row?.cardFileName).toMatch(/^[0-9a-f]{32}\.webp$/);
    expect(await filesOnDisk()).toEqual(await storedFileNames());
  });

  it("REC-14: HEIC is stored as JPEG", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const res = await upload(recipe.id, headers, fileOf(await fx("photo.heic"), "image/heic", "IMG.HEIC"));
    expect(res.status).toBe(201);
    const image = await json<RecipeImageDto>(res);
    const served = await app.request(image.url, { headers });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    const bytes = Buffer.from(await served.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const [row] = await db.select().from(recipeImages);
    expect(row?.fileName).toMatch(/^[0-9a-f]{32}\.jpg$/);
  }, 60_000);

  it("REC-14 SEC-25: wrong type, mismatched bytes, missing file and over 5 MB are 400 with their messages; nothing is stored", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const png = await fx("tiny.png");
    const cases: [string, File | string | undefined, string][] = [
      ["wrong type", fileOf(png, "image/gif"), "Only JPEG, PNG, WEBP or HEIC images are allowed"],
      ["no type", fileOf(png, ""), "Only JPEG, PNG, WEBP or HEIC images are allowed"],
      ["html as png", fileOf(await fx("not-an-image.html"), "image/png"), "The file's contents don't match its type"],
      ["png as jpeg", fileOf(png, "image/jpeg"), "The file's contents don't match its type"],
      ["missing file", undefined, "No image file was sent"],
      ["a text field, not a file", "hello", "No image file was sent"],
      ["5 MB + 1 byte", fileOf(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/png"), "Image must be 5 MB or smaller"],
      ["6 MB body", fileOf(new Uint8Array(6 * 1024 * 1024), "image/png"), "Image must be 5 MB or smaller"],
    ];
    for (const [label, file, error] of cases) {
      const res = await upload(recipe.id, headers, file);
      expect(res.status, label).toBe(400);
      expect(await res.json(), label).toEqual({ error });
    }
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  });

  it("REC-14: a JSON body instead of multipart is 400 \"No image file was sent\"", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const res = await app.request(`/api/recipes/${recipe.id}/images`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No image file was sent" });
  });

  it("SEC-27: a malformed multipart body is 400 \"Invalid request\", not 500", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const res = await app.request(`/api/recipes/${recipe.id}/images`, {
      method: "POST",
      headers: { ...headers, "content-type": "multipart/form-data; boundary=xyz" },
      body: "this is not multipart",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request" });
    expect(await filesOnDisk()).toEqual([]);
  });

  it("REC-14: a corrupt image is 400 \"That image couldn't be read\"; nothing is stored", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const png = await fx("tiny.png");
    const res = await upload(recipe.id, headers, fileOf(png.subarray(0, 40), "image/png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That image couldn't be read" });
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  });

  it("REC-14: another user's, an unknown or a huge recipe id is 404 and a non-numeric id is 400; nothing is stored", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const recipe = await newRecipe(alice);
    for (const id of [recipe.id, 999, MAX_INT4 + 1]) {
      const res = await upload(id, bob, await tinyPng());
      expect(res.status, String(id)).toBe(404);
      expect(await res.json()).toEqual({ error: "Recipe not found" });
    }
    const bad = await upload("abc", alice, await tinyPng());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Invalid recipe id" });
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  });

  it("REC-15: a new photo replaces the cover; the old row and both its files are gone", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const first = await json<RecipeImageDto>(await upload(recipe.id, headers, await tinyPng()));
    const [old] = await db.select().from(recipeImages);
    if (!old?.cardFileName) throw new Error("first upload not stored");

    const res = await upload(recipe.id, headers, fileOf(await fx("tiny.jpg"), "image/jpeg"));
    expect(res.status).toBe(201);
    const second = await json<RecipeImageDto>(res);
    expect(second.id).not.toBe(first.id);

    const after = await readRecipe(recipe.id, headers);
    expect(after.coverImageId).toBe(second.id);
    expect(after.images.map((i) => i.id)).toEqual([second.id]);
    const disk = await filesOnDisk();
    expect(disk).not.toContain(old.fileName);
    expect(disk).not.toContain(old.cardFileName);
    expect(disk).toEqual(await storedFileNames());
    expect(disk).toHaveLength(2);
    expect((await app.request(first.url, { headers })).status).toBe(404);
  });

  it("REC-15: a refused photo leaves the old cover in place", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const first = await json<RecipeImageDto>(await upload(recipe.id, headers, await tinyPng()));
    const before = await filesOnDisk();

    const res = await upload(recipe.id, headers, fileOf(await fx("not-an-image.html"), "image/png"));
    expect(res.status).toBe(400);

    expect((await readRecipe(recipe.id, headers)).coverImageId).toBe(first.id);
    expect(await filesOnDisk()).toEqual(before);
    expect((await app.request(first.url, { headers })).status).toBe(200);
  });

  it("REC-15: hidden v1 photos never become the cover", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const [cover, hidden1, hidden2] = await db
      .insert(recipeImages)
      .values([
        { recipeId: recipe.id, fileName: "c.jpg", contentType: "image/jpeg", position: 0, isCover: true },
        { recipeId: recipe.id, fileName: "h1.jpg", contentType: "image/jpeg", position: 1 },
        { recipeId: recipe.id, fileName: "h2.jpg", contentType: "image/jpeg", position: 2 },
      ])
      .returning();
    if (!cover || !hidden1 || !hidden2) throw new Error("seed failed");

    const res = await app.request(`/api/recipes/${recipe.id}/images/${cover.id}`, {
      method: "DELETE",
      headers,
    });
    expect(res.status).toBe(204);
    const after = await readRecipe(recipe.id, headers);
    expect(after.coverImageId).toBeNull();
    expect(after.images.map((i) => [i.id, i.position])).toEqual([
      [hidden1.id, 1],
      [hidden2.id, 2],
    ]);

    // A new cover goes after the highest position; the hidden rows stay hidden and untouched.
    const added = await json<RecipeImageDto>(await upload(recipe.id, headers, await tinyPng()));
    expect(added.position).toBe(3);
    const rows = await db.select().from(recipeImages).orderBy(asc(recipeImages.position));
    expect(rows.map((r) => [r.id, r.position, r.isCover, r.fileName])).toEqual([
      [hidden1.id, 1, false, "h1.jpg"],
      [hidden2.id, 2, false, "h2.jpg"],
      [added.id, 3, true, rows[2]?.fileName],
    ]);

    // Replacing that cover again deletes only the cover.
    const replaced = await json<RecipeImageDto>(await upload(recipe.id, headers, await tinyPng()));
    const final = await readRecipe(recipe.id, headers);
    expect(final.coverImageId).toBe(replaced.id);
    expect(final.images.map((i) => i.id)).toEqual([hidden1.id, hidden2.id, replaced.id]);
  });
});

describe("upload cleanup", () => {
  /** The real store, with a hook that runs before each save. */
  function storeWith(beforeSave: (ext: string) => Promise<void>): ImageStore {
    const real = createImageStore(uploadsDir);
    return {
      ...real,
      async save(bytes, ext) {
        await beforeSave(ext);
        return real.save(bytes, ext);
      },
    };
  }

  const uploadVia = async (store: ImageStore, recipeId: number, headers: Headers) => {
    const form = new FormData();
    form.append("file", await tinyPng());
    return appWith(db, store).request(`/api/recipes/${recipeId}/images`, {
      method: "POST",
      headers,
      body: form,
    });
  };

  it("REC-14 design §6.2: when the card copy cannot be saved the upload fails and the original is removed", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await uploadVia(
      storeWith(async (ext) => {
        if (ext === "webp") throw new Error("disk full");
      }),
      recipe.id,
      headers,
    );
    quiet.mockRestore();
    expect(res.status).toBe(500);
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  });

  it("REC-14: a recipe deleted while its photo was processed is 404 and both saved files are removed", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const res = await uploadVia(
      storeWith(async (ext) => {
        if (ext === "webp") await db.delete(recipes).where(eq(recipes.id, recipe.id));
      }),
      recipe.id,
      headers,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Recipe not found" });
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  });
});

describe("serving", () => {
  it("REC-16 SEC-24: the owner gets the file with Cache-Control \"private, max-age=31536000, immutable\"; ?size=card serves the WebP card copy; no session 401; another user, unknown recipe, unknown image or an image of another recipe 404; non-numeric id 400", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const recipe = await newRecipe(alice);
    const other = await newRecipe(alice, "Other");
    const png = await fx("tiny.png");
    const image = await json<RecipeImageDto>(await upload(recipe.id, alice, fileOf(png, "image/png")));
    const otherImage = await json<RecipeImageDto>(await upload(other.id, alice, fileOf(png, "image/png")));

    const res = await app.request(image.url, { headers: alice });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);

    const card = await app.request(image.cardUrl, { headers: alice });
    expect(card.status).toBe(200);
    expect(card.headers.get("content-type")).toBe("image/webp");
    expect(card.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(isWebp(Buffer.from(await card.arrayBuffer()))).toBe(true);

    const noSession = await app.request(image.url);
    expect(noSession.status).toBe(401);
    expect(await noSession.json()).toEqual({ error: "Not authenticated" });

    const cases: [string, Headers, number, string][] = [
      [image.url, bob, 404, "Recipe not found"],
      [image.cardUrl, bob, 404, "Recipe not found"],
      [`/api/recipes/999/images/${image.id}`, alice, 404, "Recipe not found"],
      [`/api/recipes/${MAX_INT4 + 1}/images/${image.id}`, alice, 404, "Recipe not found"],
      [`/api/recipes/${recipe.id}/images/999`, alice, 404, "Image not found"],
      [`/api/recipes/${recipe.id}/images/${otherImage.id}`, alice, 404, "Image not found"],
      [`/api/recipes/${recipe.id}/images/${MAX_INT4 + 1}`, alice, 404, "Image not found"],
      [`/api/recipes/${recipe.id}/images/99999999999999999999999`, alice, 404, "Image not found"],
      [`/api/recipes/abc/images/${image.id}`, alice, 400, "Invalid recipe id"],
      [`/api/recipes/${recipe.id}/images/abc`, alice, 400, "Invalid image id"],
      [`/api/recipes/${recipe.id}/images/0`, alice, 400, "Invalid image id"],
      [`/api/recipes/${recipe.id}/images/-1`, alice, 400, "Invalid image id"],
      [`/api/recipes/${recipe.id}/images/1.5`, alice, 400, "Invalid image id"],
      [`/api/recipes/${recipe.id}/images/01`, alice, 400, "Invalid image id"],
    ];
    for (const [path, headers, status, error] of cases) {
      const r = await app.request(path, { headers });
      expect(r.status, path).toBe(status);
      expect(await r.json(), path).toEqual({ error });
    }
  });

  it("design §6.1: ?size=card falls back to the original when card_file_name is null", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const jpg = await fx("tiny.jpg");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, "v1.jpg"), jpg);
    const [row] = await db
      .insert(recipeImages)
      .values({ recipeId: recipe.id, fileName: "v1.jpg", contentType: "image/jpeg", position: 0, isCover: true })
      .returning({ id: recipeImages.id });
    const res = await app.request(`/api/recipes/${recipe.id}/images/${row?.id}?size=card`, { headers });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).equals(jpg)).toBe(true);
  });

  it("REC-16: a stored row whose file is missing on disk is 404 \"Image not found\", not 500", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const [row] = await db
      .insert(recipeImages)
      .values({ recipeId: recipe.id, fileName: "gone.jpg", contentType: "image/jpeg", position: 0, isCover: true })
      .returning({ id: recipeImages.id });
    for (const suffix of ["", "?size=card"]) {
      const res = await app.request(`/api/recipes/${recipe.id}/images/${row?.id}${suffix}`, { headers });
      expect(res.status, suffix).toBe(404);
      expect(await res.json()).toEqual({ error: "Image not found" });
    }
  });
});

describe("removal", () => {
  it("REC-17: removing the cover answers 204 and deletes its row and files; an image not on that recipe is 404", async () => {
    const alice = await signedInHeaders(db, "alice");
    const bob = await signedInHeaders(db, "bobby");
    const recipe = await newRecipe(alice);
    const other = await newRecipe(alice, "Other");
    const image = await json<RecipeImageDto>(await upload(recipe.id, alice, await tinyPng()));
    const otherImage = await json<RecipeImageDto>(await upload(other.id, alice, await tinyPng()));
    const del = (recipeId: number | string, imageId: number | string, headers: Headers) =>
      app.request(`/api/recipes/${recipeId}/images/${imageId}`, { method: "DELETE", headers });

    const notOnRecipe = await del(recipe.id, otherImage.id, alice);
    expect(notOnRecipe.status).toBe(404);
    expect(await notOnRecipe.json()).toEqual({ error: "Image not found" });
    const bobs = await del(recipe.id, image.id, bob);
    expect(bobs.status).toBe(404);
    expect(await bobs.json()).toEqual({ error: "Recipe not found" });
    expect((await del(recipe.id, "abc", alice)).status).toBe(400);
    expect((await del(recipe.id, MAX_INT4 + 1, alice)).status).toBe(404);
    expect(await imageRowCount()).toBe(2);
    expect(await filesOnDisk()).toHaveLength(4);

    const res = await del(recipe.id, image.id, alice);
    expect(res.status).toBe(204);
    const after = await readRecipe(recipe.id, alice);
    expect(after.coverImageId).toBeNull();
    expect(after.images).toEqual([]);
    expect(await db.select().from(recipeImages).where(eq(recipeImages.id, image.id))).toEqual([]);
    expect(await filesOnDisk()).toEqual(await storedFileNames());
    expect(await filesOnDisk()).toHaveLength(2);
    expect((await del(recipe.id, image.id, alice)).status).toBe(404);
  });
});

describe("review focus", () => {
  it("Review Focus 2: a 9000 × 9000 PNG is 400 \"That image is too large to process\"", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const res = await upload(recipe.id, headers, fileOf(bomb, "image/png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That image is too large to process" });
    expect(await imageRowCount()).toBe(0);
    expect(await filesOnDisk()).toEqual([]);
  }, 60_000);

  it("Review Focus 5: two uploads at once leave exactly one cover and no orphan files", async () => {
    const headers = await signedInHeaders(db);
    const recipe = await newRecipe(headers);
    // Four, not two: two uploads do not always overlap; four reliably fail without the row lock.
    const results = await Promise.all(
      Array.from({ length: 4 }, async () => upload(recipe.id, headers, await tinyPng())),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const rows = await db.select().from(recipeImages);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isCover).toBe(true);
    expect(await filesOnDisk()).toEqual(await storedFileNames());
    expect(await filesOnDisk()).toHaveLength(2);
  });
});

describe("body limit", () => {
  it("SEC-27: other /api bodies over 100 KiB still get 413", async () => {
    const big = JSON.stringify({ title: "x".repeat(101 * 1024) });
    const calls: [string, string][] = [
      ["POST", "/api/recipes"],
      ["PUT", "/api/recipes/1"],
      ["PUT", "/api/recipes/1/images"],
      ["POST", "/api/recipes/1/images/from-url"],
      ["POST", "/api/recipes/1/images/"],
      ["POST", "/api/recipes/1/images/1"],
    ];
    for (const [method, path] of calls) {
      const res = await app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: big,
      });
      expect(res.status, `${method} ${path}`).toBe(413);
      expect(await res.json()).toEqual({ error: "Request body too large" });
    }
  });
});

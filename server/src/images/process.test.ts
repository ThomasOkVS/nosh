import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage, type Processed } from "./process.js";

const fx = (name: string) =>
  readFile(fileURLToPath(new URL(`../../test/fixtures/images/${name}`, import.meta.url)));

function expectOk(r: Awaited<ReturnType<typeof processImage>>): Processed {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
}

const isWebp = (b: Buffer) =>
  b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";

describe("processImage", () => {
  it.each([
    ["tiny.jpg", "image/jpeg"],
    ["tiny.png", "image/png"],
    ["tiny.webp", "image/webp"],
  ])("REC-14 SEC-25: accepts %s declared as %s", async (file, type) => {
    const r = expectOk(await processImage(await fx(file), type, { allowHeic: false }));
    expect(r.contentType).toBe(type);
    expect(isWebp(r.card)).toBe(true);
    const meta = await sharp(r.card).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(800);
  });

  it("REC-14: converts HEIC to JPEG", async () => {
    const r = expectOk(await processImage(await fx("photo.heic"), "image/heic", { allowHeic: true }));
    expect(r.contentType).toBe("image/jpeg");
    expect(r.ext).toBe("jpg");
    expect([...r.original.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  }, 60_000);

  it("REC-14: HEIC is refused when not allowed", async () => {
    const r = await processImage(await fx("photo.heic"), "image/heic", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "type" });
  });

  it("SEC-25: refuses HTML declared as image/png", async () => {
    const r = await processImage(await fx("not-an-image.html"), "image/png", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("SEC-25: refuses a PNG declared as image/jpeg", async () => {
    const r = await processImage(await fx("tiny.png"), "image/jpeg", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("REC-14: refuses a declared type outside the list", async () => {
    const r = await processImage(await fx("tiny.png"), "image/gif", { allowHeic: true });
    expect(r).toEqual({ ok: false, reason: "type" });
  });

  it("design §6.2: never enlarges the card copy", async () => {
    const src = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer();
    const r = expectOk(await processImage(src, "image/png", { allowHeic: false }));
    const meta = await sharp(r.card).metadata();
    expect([meta.width, meta.height]).toEqual([100, 80]);
  });

  it("Review Focus 2: refuses a 9000 x 9000 PNG without decoding it", async () => {
    const src = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const r = await processImage(src, "image/png", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "too-many-pixels" });
  }, 60_000);

  it("design §6.2: applies EXIF orientation to the card", async () => {
    const src = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#c80" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = expectOk(await processImage(src, "image/jpeg", { allowHeic: false }));
    const meta = await sharp(r.card).metadata();
    expect(meta.width).toBeLessThan(meta.height ?? 0);
  });
});

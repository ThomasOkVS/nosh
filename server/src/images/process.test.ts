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
    const meta = await sharp(r.card).metadata();
    expect(meta.height).toBeGreaterThan(meta.width ?? 0); // iPhone portrait: irot applied
  }, 60_000);

  it("Review Focus 2: refuses a HEIC declaring more than MAX_INPUT_PIXELS without decoding it", async () => {
    const bytes = Buffer.from(await fx("photo.heic"));
    let patched = 0;
    for (let i = bytes.indexOf("ispe"); i !== -1; i = bytes.indexOf("ispe", i + 4)) {
      // ispe: 4 bytes type, 4 bytes version/flags, then 32-bit width and height.
      bytes.writeUInt32BE(20_000, i + 8);
      bytes.writeUInt32BE(20_000, i + 12);
      patched++;
    }
    expect(patched).toBeGreaterThan(0);
    const started = Date.now();
    const r = await processImage(bytes, "image/heic", { allowHeic: true });
    expect(r).toEqual({ ok: false, reason: "too-many-pixels" });
    // The real photo takes seconds to decode; a header-only refusal is fast.
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 30_000);

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

  it("design §6.2: shrinks a 1600 x 900 source to an 800 x 450 card", async () => {
    const src = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer();
    const r = expectOk(await processImage(src, "image/png", { allowHeic: false }));
    const meta = await sharp(r.card).metadata();
    expect([meta.width, meta.height]).toEqual([800, 450]);
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

  it("Review Focus 2: refuses a 9000 x 9000 PNG over the pixel limit", async () => {
    const src = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const r = await processImage(src, "image/png", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "too-many-pixels" });
  }, 60_000);

  const gpsExif = { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 0/1 0/1" } };
  const withGps = async (format: "jpeg" | "png" | "webp") => {
    const base = sharp({ create: { width: 64, height: 48, channels: 3, background: "#c80" } });
    const src = await base[format]().withExif(gpsExif).toBuffer();
    expect((await sharp(src).metadata()).exif).toBeDefined();
    return src;
  };

  it.each([
    ["JPEG", "jpeg", "image/jpeg"],
    ["PNG", "png", "image/png"],
    ["WebP", "webp", "image/webp"],
  ] as const)(
    "SEC-24 design §6.2: a %s's GPS and EXIF are not kept in the stored original",
    async (_name, format, type) => {
      const src = await withGps(format);
      const r = expectOk(await processImage(src, type, { allowHeic: false }));
      const meta = await sharp(r.original).metadata();
      expect(meta.format).toBe(format);
      expect(meta.exif).toBeUndefined();
      expect([meta.width, meta.height]).toEqual([64, 48]);
    },
  );

  it("SEC-24 design §6.2: the stored original has the orientation baked in and no tag", async () => {
    const src = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#c80" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(src).metadata()).orientation).toBe(6);
    const r = expectOk(await processImage(src, "image/jpeg", { allowHeic: false }));
    const meta = await sharp(r.original).metadata();
    expect(meta.width).toBeLessThan(meta.height ?? 0);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  it("SEC-24 design §6.2: the stored original keeps its ICC colour profile but no EXIF", async () => {
    const src = await sharp({
      create: { width: 64, height: 48, channels: 3, background: "#c80" },
    })
      .jpeg()
      .withIccProfile("p3")
      .withExif(gpsExif)
      .toBuffer();
    const inMeta = await sharp(src).metadata();
    expect(inMeta.icc).toBeDefined();
    expect(inMeta.exif).toBeDefined();
    const r = expectOk(await processImage(src, "image/jpeg", { allowHeic: false }));
    const meta = await sharp(r.original).metadata();
    expect(meta.icc).toBeDefined();
    expect(meta.exif).toBeUndefined();
  });

  it("SEC-24 design §6.2: the HEIC original has no EXIF", async () => {
    const r = expectOk(await processImage(await fx("photo.heic"), "image/heic", { allowHeic: true }));
    const meta = await sharp(r.original).metadata();
    expect(meta.exif).toBeUndefined();
  }, 60_000);

  it("SEC-24: a corrupt JPEG body is refused as unreadable", async () => {
    const src = Buffer.from(await fx("tiny.jpg"));
    const broken = Buffer.concat([src.subarray(0, 20), Buffer.alloc(40, 0)]);
    const r = await processImage(broken, "image/jpeg", { allowHeic: false });
    expect(r).toEqual({ ok: false, reason: "unreadable" });
  });

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

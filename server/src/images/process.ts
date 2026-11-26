import { fileTypeFromBuffer } from "file-type";
import decodeHeic from "heic-decode";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 60_000_000;

export type StoredType = "image/jpeg" | "image/png" | "image/webp";
export type Processed = {
  ok: true;
  contentType: StoredType;
  ext: "jpg" | "png" | "webp";
  original: Buffer;
  card: Buffer;
};
export type Refused = {
  ok: false;
  reason: "type" | "mismatch" | "too-many-pixels" | "unreadable";
};

const STORED: Record<StoredType, Processed["ext"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

const isStored = (t: string): t is StoredType => t in STORED;

// sharp's error for limitInputPixels reads "Input image exceeds pixel limit".
// The 9000 x 9000 PNG test pins it; if sharp rewords it, that test fails.
const isPixelLimit = (err: unknown) => /pixel limit/i.test(String(err));

/**
 * Checks the bytes against the declared type (REC-14, SEC-25), converts HEIC
 * to JPEG, and makes the 800px WebP card copy. Size is checked by the caller.
 */
export async function processImage(
  bytes: Buffer,
  declaredType: string,
  opts: { allowHeic: boolean },
): Promise<Processed | Refused> {
  const declared = declaredType.toLowerCase();
  const heic = HEIC_TYPES.has(declared);
  if (!isStored(declared) && !(heic && opts.allowHeic)) return { ok: false, reason: "type" };

  // file-type rethrows every error but end-of-stream: bytes it chokes on are not that type.
  let sniffed: string | undefined;
  try {
    sniffed = (await fileTypeFromBuffer(bytes))?.mime;
  } catch {
    return { ok: false, reason: "mismatch" };
  }
  const matches = heic ? sniffed !== undefined && HEIC_TYPES.has(sniffed) : sniffed === declared;
  if (!matches) return { ok: false, reason: "mismatch" };

  let original = bytes;
  const contentType: StoredType = isStored(declared) ? declared : "image/jpeg";
  try {
    if (heic) {
      const converted = await heicToJpeg(bytes);
      if (!converted.ok) return converted;
      original = converted.jpeg;
    }
    const input = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS });
    await input.metadata();
    // A fresh encode drops EXIF, GPS and every other tag (SEC-24). rotate()
    // first bakes the orientation into the pixels. HEIC is already fresh.
    if (!heic) original = await reencode(original, contentType);
    const card = await input
      .rotate()
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, contentType, ext: STORED[contentType], original, card };
  } catch (err) {
    return { ok: false, reason: isPixelLimit(err) ? "too-many-pixels" : "unreadable" };
  }
}

function reencode(bytes: Buffer, type: StoredType): Promise<Buffer> {
  const pipeline = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().keepIccProfile();
  switch (type) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 90 }).toBuffer();
    case "image/webp":
      return pipeline.webp({ quality: 90 }).toBuffer();
    case "image/png":
      return pipeline.png().toBuffer();
  }
}

// One HEIC decode at a time: a decode holds the full RGBA in WASM memory.
let heicQueue: Promise<unknown> = Promise.resolve();

function heicToJpeg(bytes: Buffer): Promise<{ ok: true; jpeg: Buffer } | Refused> {
  const run = heicQueue.then(() => decodeToJpeg(bytes));
  heicQueue = run.catch(() => undefined);
  return run;
}

async function decodeToJpeg(bytes: Buffer): Promise<{ ok: true; jpeg: Buffer } | Refused> {
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const primary = images[0];
    if (!primary) return { ok: false, reason: "unreadable" };
    // Dimensions come from the container headers, before any pixel decode.
    if (primary.width * primary.height > MAX_INPUT_PIXELS) {
      return { ok: false, reason: "too-many-pixels" };
    }
    const { data, width, height } = await primary.decode();
    const jpeg = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { ok: true, jpeg };
  } finally {
    images.dispose();
  }
}

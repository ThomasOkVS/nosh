import { fileTypeFromBuffer } from "file-type";
import convert from "heic-convert";
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

  const sniffed = (await fileTypeFromBuffer(bytes))?.mime;
  const matches = heic ? sniffed !== undefined && HEIC_TYPES.has(sniffed) : sniffed === declared;
  if (!matches) return { ok: false, reason: "mismatch" };

  let original = bytes;
  const contentType: StoredType = isStored(declared) ? declared : "image/jpeg";
  try {
    if (heic) {
      const out = await convert({ buffer: bytes, format: "JPEG", quality: 0.9 });
      original = Buffer.from(out);
    }
    const input = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS });
    await input.metadata();
    const card = await input
      .rotate()
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, contentType, ext: STORED[contentType], original, card };
  } catch (err) {
    return { ok: false, reason: /pixel limit/i.test(String(err)) ? "too-many-pixels" : "unreadable" };
  }
}

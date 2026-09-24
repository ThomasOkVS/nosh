/**
 * Identifies an image by its first bytes ("magic numbers") rather than by
 * the MIME type the client or remote server *claims*. Both of those are just
 * strings the sender chose — without this, "image/png" on an HTML file would
 * store that HTML under a .png name.
 *
 * Returns one of the MIME types in IMAGE_MIME_EXTENSIONS, or null.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0): boolean =>
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "RIFF" <4-byte size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** How many leading bytes `sniffImageMime` needs. */
export const SNIFF_BYTES = 12;

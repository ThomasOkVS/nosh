/**
 * crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
 * The homelab deploy is served over plain HTTP, where it's undefined, so we
 * fall back to building a v4 UUID from crypto.getRandomValues(), which has
 * no such restriction.
 */
export function generateId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fixed 16-byte array, so every index below is always in range —
  // noUncheckedIndexedAccess just can't infer that from a literal length.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

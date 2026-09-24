/** Minimal byte sequences that pass services/imageSniff.ts's magic-number
 * check — just the signature plus a few filler bytes, not decodable images. */
export const FAKE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("fake-jpeg"),
]);
export const FAKE_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("fake-png"),
]);
export const FAKE_WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBPfake"),
]);

import { validateUrl } from "./recipeExtraction";

/** The URL itself is malformed, points at a blocked host, or a redirect
 * hop leads somewhere disallowed — mirrors `InvalidUrlError` in
 * `recipeExtraction.ts` but kept separate since callers here don't need to
 * distinguish it from the other failure modes below. */
export class ImageFetchError extends Error {}
export class ImageTooLargeError extends Error {}
export class UnsupportedImageTypeError extends Error {}

const FETCH_TIMEOUT_MS = 10_000;
// Matches the manual-upload limit enforced by multer in routes/recipes.ts —
// an auto-imported photo shouldn't be held to a looser standard than one the
// user picks themselves.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** Single source of truth for which image types the app stores, shared with
 * the manual-upload route in routes/recipes.ts so the two paths can't drift. */
export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export interface FetchedImage {
  buffer: Buffer;
  extension: string;
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readCappedBuffer(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    await discard(response);
    throw new ImageTooLargeError("That image is too large to import");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMAGE_BYTES) {
        throw new ImageTooLargeError("That image is too large to import");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches an image URL discovered during recipe import (schema.org `image`,
 * an og:image/twitter:image meta tag, or a yt-dlp thumbnail) so it can be
 * attached to a recipe right after that recipe is saved.
 *
 * This URL travels back from the browser in a request body — it originated
 * from our own page scrape, but nothing about this request proves that, so
 * it gets the same SSRF guard and manual redirect re-validation as the
 * original page fetch in recipeExtraction.ts (reusing `validateUrl` from
 * there rather than re-implementing the blocked-host check).
 */
export async function fetchImageFromUrl(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<FetchedImage> {
  let url = validateUrl(rawUrl);
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(url, { redirect: "manual", signal: combinedSignal });
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        throw new ImageFetchError("Timed out fetching that image");
      }
      throw new ImageFetchError(
        `Failed to fetch the image: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await discard(response);
      if (!location) {
        throw new ImageFetchError(`The image URL returned ${response.status}`);
      }
      // Re-validated on every hop, so the guard can't be sidestepped by a
      // URL that redirects into the local network.
      url = validateUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      await discard(response);
      throw new ImageFetchError(`The image URL returned ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    const extension = IMAGE_MIME_EXTENSIONS[contentType];
    if (!extension) {
      await discard(response);
      throw new UnsupportedImageTypeError("That URL is not a supported image type");
    }

    const buffer = await readCappedBuffer(response);
    return { buffer, extension };
  }

  throw new ImageFetchError("The image URL redirected too many times");
}

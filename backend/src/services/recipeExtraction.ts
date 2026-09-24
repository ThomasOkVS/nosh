import { isIP } from "node:net";
import { BlockedAddressError, isBlockedAddress, safeFetch } from "./safeFetch";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "../llm/geminiClient";
import { GeminiExtractionError, GeminiUnavailableError } from "../llm/geminiClient";
import { recipeSchema, type RecipeInput } from "../validation/recipes";
import { stripHtmlToText } from "./htmlText";
import { normalizeIngredients } from "./ingredientLine";
import { extractJsonLdRecipe, extractMetaImageUrl, isCompleteEnough } from "./jsonLd";
import { filterToVocabulary } from "./recipeTags";
import {
  detectSocialPlatform,
  downloadSocialVideo as downloadSocialVideoDefault,
  type SocialVideoDownloadFn,
} from "./socialVideo";

export class InvalidUrlError extends Error {}
export class FetchError extends Error {}
export class ExtractionError extends Error {}
/** The page had no usable schema.org data and no LLM is configured to fall
 * back to, so this particular page can't be imported — distinct from
 * "extraction was attempted and failed". */
export class NotConfiguredError extends Error {}
/** The model is reachable but can't serve us right now (quota, outage). Worth
 * distinguishing so the user is told to retry rather than that their page has
 * no recipe on it. */
export class ExtractionUnavailableError extends ExtractionError {}

export {
  DownloaderUnavailableError,
  VideoTooLargeError,
  VideoUnavailableError,
} from "./socialVideo";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_GEMINI_TEXT_LENGTH = 15_000;
const MAX_REDIRECTS = 5;

/**
 * Rejects URLs that point back into the machine or the local network, by
 * their literal host. Hostnames get the same check again at connect time,
 * against the addresses DNS actually returned — see services/safeFetch.ts,
 * which is where DNS rebinding is closed off. Node never runs a DNS lookup
 * for an IP literal, so this is the only check those get.
 */
function isBlockedHost(rawHostname: string): boolean {
  // WHATWG URL keeps IPv6 hosts bracketed ("[::1]") and permits a trailing
  // root dot ("localhost."), both of which defeat naive string comparison.
  // It has already normalized IPv4 shorthand ("2130706433", "0x7f.1") to
  // dotted-quad by this point.
  const hostname = rawHostname.toLowerCase().replace(/^\[|]$/g, "").replace(/\.$/, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  return isIP(hostname) !== 0 && isBlockedAddress(hostname);
}

/** Exported so `imageFromUrl.ts` can apply the same SSRF guard to an image
 * URL that travels back from the browser in a request body — that URL
 * originated from our own page scrape, but the request that carries it back
 * doesn't prove that, so it needs the same validation as the original fetch. */
export function validateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError("Only http/https URLs are supported");
  }
  if (isBlockedHost(url.hostname)) {
    throw new InvalidUrlError("This URL cannot be imported");
  }
  return url;
}

/** Discards an unread body so undici can release the socket instead of
 * holding it until GC. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Reads at most `MAX_HTML_BYTES`, streaming rather than buffering the whole
 * body first — `response.text()` would pull an arbitrarily large page fully
 * into memory before any size limit could be applied.
 */
async function readCappedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
    await discard(response);
    throw new FetchError("That page is too large to import");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytes >= MAX_HTML_BYTES) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

async function fetchOnce(
  url: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      // Redirects are followed manually so each hop can be re-validated;
      // "follow" would let any public page bounce us into the local network.
      redirect: "manual",
      // Many recipe sites reject requests with Node's default (absent)
      // User-Agent outright, so identify as a normal browser-ish client.
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; NoshRecipeImporter/1.0; +https://github.com/ThomasOkVS/nosh)",
      },
      signal,
    });
  } catch (err) {
    if (err instanceof BlockedAddressError) {
      // A hostname that resolved to a private address — same answer as a
      // private IP literal gets from validateUrl.
      throw new InvalidUrlError("This URL cannot be imported");
    }
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new FetchError("Timed out fetching the page");
    }
    // The raw error ("connect ECONNREFUSED 1.2.3.4:81") is logged, not
    // returned: echoing it would let a user map which hosts and ports answer.
    console.warn("Import page fetch failed:", err instanceof Error ? err.message : err);
    throw new FetchError("Couldn't reach that page");
  }
}

async function fetchHtml(
  startUrl: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string> {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchOnce(url, fetchImpl, signal);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await discard(response);
      if (!location) {
        throw new FetchError(`The page returned ${response.status}`);
      }
      // Re-validated on every hop, so the guard can't be sidestepped by a
      // page that redirects into the local network.
      url = validateUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      await discard(response);
      throw new FetchError(`The page returned ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html")) {
      await discard(response);
      throw new FetchError("The URL did not return an HTML page");
    }
    return readCappedText(response);
  }

  throw new FetchError("That page redirected too many times");
}

/** schema.org and og:image both allow a relative URL, which is meaningless
 * once carried outside the page it came from — resolved against the page's
 * own URL here, the one place both callers already have it. */
function resolveImageUrl(raw: string | null | undefined, pageUrl: URL): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

type RawRecord = Record<string, unknown>;

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

function cleanNonNegativeInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 0 ? rounded : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Coerces raw extraction output into the shape `recipeSchema` accepts.
 *
 * This has to run BEFORE validation, not after: both sources routinely emit
 * near-miss values — the model returns `""` where the schema wants `null`
 * despite being told the field is nullable, and a page saying "Serves 0"
 * yields `servings: 0` against a `.positive()` check. Validating first would
 * throw away an otherwise perfectly good recipe over one stray field, and
 * would also mean the tag and ingredient normalizers below never got to run
 * on the very input they exist to clean up.
 */
function sanitizeCandidate(candidate: unknown): RawRecord {
  const raw: RawRecord = typeof candidate === "object" && candidate !== null ? { ...candidate } : {};

  const ingredients = asArray(raw.ingredients)
    .map((entry) => {
      const item: RawRecord = typeof entry === "object" && entry !== null ? { ...entry } : {};
      const name = cleanString(item.name);
      return name === null
        ? null
        : { quantity: cleanString(item.quantity), unit: cleanString(item.unit), name };
    })
    .filter((item) => item !== null);

  const steps = asArray(raw.steps)
    .map((entry) => {
      const item: RawRecord = typeof entry === "object" && entry !== null ? { ...entry } : {};
      const instruction = cleanString(item.instruction);
      return instruction === null ? null : { instruction };
    })
    .filter((item) => item !== null);

  return {
    title: cleanString(raw.title) ?? "",
    description: cleanString(raw.description),
    servings: cleanPositiveInt(raw.servings),
    prepTimeMinutes: cleanNonNegativeInt(raw.prepTimeMinutes),
    cookTimeMinutes: cleanNonNegativeInt(raw.cookTimeMinutes),
    ingredients: normalizeIngredients(ingredients),
    steps,
    tags: filterToVocabulary(asArray(raw.tags).filter((tag) => typeof tag === "string")),
  };
}

/**
 * Which part of the import is currently running. Reported to the caller so
 * the UI can say what it's waiting on — these phases differ enormously in
 * how long they take (structured data is near-instant; the LLM is seconds;
 * video is tens of seconds), so "loading" alone doesn't tell the user
 * whether to expect a wait.
 */
export type ImportStage = "fetching" | "structured-data" | "downloading-video" | "analyzing-video" | "ai";

export interface ExtractDeps {
  /** Optional: the schema.org path works without it, most recipe sites
   * publish that data, and the app must still boot with no API key. */
  geminiExtract?: GeminiExtractFn;
  /** Optional for the same reason: a Reels/TikTok import has no fast path at
   * all, so this being unset just means that platform can't be imported. */
  geminiVideoExtract?: GeminiVideoExtractFn;
  /** Real implementation is always available (yt-dlp ships in the image) —
   * overridable only so tests never shell out. */
  downloadSocialVideo?: SocialVideoDownloadFn;
  fetchImpl?: typeof fetch;
  onProgress?: (stage: ImportStage) => void;
  /** Aborts the outbound work when the user cancels the import, so it
   * doesn't keep burning API quota. */
  signal?: AbortSignal;
  /** The user's Settings-page model choice, applied to whichever AI path
   * runs. Unset means "automatic" — each extractor's configured default. */
  model?: string;
}

interface ExtractionCandidate {
  candidate: unknown;
  imageUrl: string | null;
}

async function extractFromSocialVideo(
  url: URL,
  deps: ExtractDeps,
  report: (stage: ImportStage) => void,
): Promise<ExtractionCandidate> {
  if (!deps.geminiVideoExtract) {
    throw new NotConfiguredError(
      "Importing from Instagram/TikTok needs AI-assisted import, which is not configured",
    );
  }
  const downloadVideo = deps.downloadSocialVideo ?? downloadSocialVideoDefault;

  report("downloading-video");
  const { videoBuffer, mimeType, caption, thumbnailUrl } = await downloadVideo(url, deps.signal);

  report("analyzing-video");
  try {
    const candidate = await deps.geminiVideoExtract(
      { buffer: videoBuffer, mimeType },
      caption,
      url.toString(),
      { model: deps.model, signal: deps.signal },
    );
    return { candidate, imageUrl: thumbnailUrl };
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      throw new ExtractionUnavailableError(err.message);
    }
    if (err instanceof GeminiExtractionError) {
      throw new ExtractionError(err.message);
    }
    throw err;
  }
}

/**
 * The plain-URL path: schema.org JSON-LD first (near-instant, no LLM call),
 * falling back to Gemini reading the page as text. Pulled out of
 * `extractRecipeFromUrl` into its own function, mirroring
 * `extractFromSocialVideo`, so the top-level dispatcher stays a flat
 * two-way branch instead of one function carrying both paths' nesting.
 */
async function extractFromWebPage(
  url: URL,
  deps: ExtractDeps,
  report: (stage: ImportStage) => void,
): Promise<ExtractionCandidate> {
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  // One budget for the whole page fetch including the body read, combined
  // with the caller's cancellation so either can end it.
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;

  report("fetching");
  const html = await fetchHtml(url, fetchImpl, signal);

  report("structured-data");
  const jsonLdResult = extractJsonLdRecipe(html);
  // Preferred over the model even on the Gemini-fallback path below: cheaper
  // and more reliable than asking the LLM to locate an image in page text.
  const imageUrl = resolveImageUrl(jsonLdResult?.imageUrl ?? extractMetaImageUrl(html), url);

  if (isCompleteEnough(jsonLdResult)) {
    return { candidate: jsonLdResult, imageUrl };
  }

  if (!deps.geminiExtract) {
    throw new NotConfiguredError(
      "That page has no structured recipe data, and AI-assisted import is not configured",
    );
  }
  report("ai");
  const pageText = stripHtmlToText(html).slice(0, MAX_GEMINI_TEXT_LENGTH);
  try {
    const candidate = await deps.geminiExtract(pageText, url.toString(), {
      model: deps.model,
      signal: deps.signal,
    });
    return { candidate, imageUrl };
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      throw new ExtractionUnavailableError(err.message);
    }
    if (err instanceof GeminiExtractionError) {
      throw new ExtractionError(err.message);
    }
    throw err;
  }
}

export interface RecipeExtractionResult {
  recipe: RecipeInput;
  /** The recipe's photo, found on a best-effort basis (schema.org `image`,
   * an og:image/twitter:image meta tag, or a yt-dlp thumbnail). Not part of
   * `recipe` — attaching it happens as a separate step after the recipe is
   * saved, since recipe images are keyed off an id that doesn't exist yet. */
  imageUrl: string | null;
}

export async function extractRecipeFromUrl(
  rawUrl: string,
  deps: ExtractDeps,
): Promise<RecipeExtractionResult> {
  const url = validateUrl(rawUrl);
  const report = deps.onProgress ?? (() => undefined);

  // No schema.org/text fast path exists for a video post — it's the only
  // extraction route those platforms have.
  const platform = detectSocialPlatform(url);
  const { candidate, imageUrl } = platform
    ? await extractFromSocialVideo(url, deps, report)
    : await extractFromWebPage(url, deps, report);

  const parsed = recipeSchema.safeParse({ ...sanitizeCandidate(candidate), sourceUrl: url.toString() });
  if (!parsed.success) {
    // Without this the failure is indistinguishable from "the page has no
    // recipe", which is what the user is about to be told.
    console.warn("Import produced data that failed validation:", parsed.error.issues);
    throw new ExtractionError("No recipe could be found on that page");
  }
  return { recipe: parsed.data, imageUrl };
}

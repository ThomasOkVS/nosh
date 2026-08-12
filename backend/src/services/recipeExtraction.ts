import { isIP } from "node:net";
import type { GeminiExtractFn } from "../llm/geminiClient";
import { GeminiExtractionError, GeminiUnavailableError } from "../llm/geminiClient";
import { recipeSchema, type RecipeInput } from "../validation/recipes";
import { stripHtmlToText } from "./htmlText";
import { normalizeIngredients } from "./ingredientLine";
import { extractJsonLdRecipe, isCompleteEnough } from "./jsonLd";
import { filterToVocabulary } from "./recipeTags";

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

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_GEMINI_TEXT_LENGTH = 15_000;
const MAX_REDIRECTS = 5;

/**
 * Rejects URLs that point back into the machine or the local network. This is
 * the app's only code path that fetches a URL supplied at runtime, so without
 * it the backend can be used to reach services that aren't otherwise exposed.
 *
 * Checks the literal host only — it deliberately does NOT resolve DNS, so a
 * hostname that resolves to a private address still gets through. That's an
 * accepted gap for a single-user, Tailscale-only app (see docs/decisions.md);
 * closing it needs a resolve-then-pin-the-IP fetch, which is a bigger change.
 */
function isBlockedHost(rawHostname: string): boolean {
  // WHATWG URL keeps IPv6 hosts bracketed ("[::1]") and permits a trailing
  // root dot ("localhost."), both of which defeat naive string comparison.
  const hostname = rawHostname.toLowerCase().replace(/^\[|]$/g, "").replace(/\.$/, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;

  const version = isIP(hostname);
  if (version === 4) {
    const [a = 0, b = 0] = hostname.split(".").map(Number);
    return (
      a === 0 || // 0.0.0.0/8 "this host"
      a === 127 || // loopback
      a === 10 || // private
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254) // link-local, incl. cloud metadata
    );
  }
  if (version === 6) {
    const ip = hostname;
    if (ip === "::1" || ip === "::") return true;
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true;
    // IPv4-mapped (::ffff:127.0.0.1) — re-check the embedded address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped?.[1]) return isBlockedHost(mapped[1]);
  }
  return false;
}

function validateUrl(rawUrl: string): URL {
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
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new FetchError("Timed out fetching the page");
    }
    throw new FetchError(
      `Failed to fetch the page: ${err instanceof Error ? err.message : String(err)}`,
    );
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
 * the UI can say what it's waiting on — the two paths differ enormously in
 * how long they take (structured data is near-instant; the LLM is seconds),
 * so "loading" alone doesn't tell the user whether to expect a wait.
 */
export type ImportStage = "fetching" | "structured-data" | "ai";

interface ExtractDeps {
  /** Optional: the schema.org path works without it, most recipe sites
   * publish that data, and the app must still boot with no API key. */
  geminiExtract?: GeminiExtractFn;
  fetchImpl?: typeof fetch;
  onProgress?: (stage: ImportStage) => void;
  /** Aborts the outbound work when the client goes away, so a navigation
   * mid-import doesn't keep burning API quota. */
  signal?: AbortSignal;
}

export async function extractRecipeFromUrl(rawUrl: string, deps: ExtractDeps): Promise<RecipeInput> {
  const url = validateUrl(rawUrl);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const report = deps.onProgress ?? (() => undefined);

  // One budget for the whole page fetch including the body read, combined
  // with the caller's cancellation so either can end it.
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;

  report("fetching");
  const html = await fetchHtml(url, fetchImpl, signal);

  report("structured-data");
  const jsonLdResult = extractJsonLdRecipe(html);
  let candidate: unknown;
  if (isCompleteEnough(jsonLdResult)) {
    candidate = jsonLdResult;
  } else {
    if (!deps.geminiExtract) {
      throw new NotConfiguredError(
        "That page has no structured recipe data, and AI-assisted import is not configured",
      );
    }
    report("ai");
    const pageText = stripHtmlToText(html).slice(0, MAX_GEMINI_TEXT_LENGTH);
    try {
      candidate = await deps.geminiExtract(pageText, url.toString(), deps.signal);
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

  const parsed = recipeSchema.safeParse({ ...sanitizeCandidate(candidate), sourceUrl: url.toString() });
  if (!parsed.success) {
    // Without this the failure is indistinguishable from "the page has no
    // recipe", which is what the user is about to be told.
    console.warn("Import produced data that failed validation:", parsed.error.issues);
    throw new ExtractionError("No recipe could be found on that page");
  }
  return parsed.data;
}

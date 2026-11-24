// Control characters (the URL parser drops tab and newline) and backslashes
// (browsers read "\" as "/") can turn "/x/host" into "//host".
const UNSAFE_CHARS = /[\x00-\x1f\x7f\\]/;
// Any fixed origin works: only "is it still this origin?" matters.
const BASE = "https://nosh.invalid";

/** One leading "/", not "//", and none of the characters above. */
function isPlainPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !UNSAFE_CHARS.test(value);
}

/**
 * AUTH-16: where to go after logging in. Only an address inside this app is
 * kept, returned as path, query and hash; anything else falls back to home.
 * The value is checked as given and once more decoded, since a router may
 * decode it again, and it must still resolve to this origin with a path that
 * does not start with "//".
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (!isPlainPath(value) || !isPlainPath(decoded)) return "/";
  const url = new URL(value, BASE);
  if (url.origin !== BASE || url.pathname.startsWith("//")) return "/";
  return url.pathname + url.search + url.hash;
}

/** Search params of the login and sign-up screens. */
export interface AuthSearch {
  /** Where to go after logging in (AUTH-16); checked by safeRedirect. */
  redirect?: string;
}

/** Never throws: a non-string redirect (`?redirect=42` parses as a number) is dropped. */
export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  return typeof search.redirect === "string" ? { redirect: search.redirect } : {};
}

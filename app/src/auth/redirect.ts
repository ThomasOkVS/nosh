/**
 * AUTH-16: where to go after logging in. Only an address inside this app is
 * kept: a path starting with one "/". "//host" and "/\host" are treated by
 * browsers as another site, so they and anything else fall back to home.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
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

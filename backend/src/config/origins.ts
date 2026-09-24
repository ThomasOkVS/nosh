/**
 * Parses `FRONTEND_ORIGINS` (comma-separated) into the exact strings a
 * browser will send in its `Origin` header.
 *
 * Each entry is checked against `new URL(entry).origin` rather than silently
 * normalized, because normalizing would hide the mistake instead of fixing
 * it: a browser sends `https://host` — never `https://host:443`, never a
 * path — so a configured value in any other shape would simply never match,
 * and every request would fail with an unhelpful 403. Failing at startup
 * says exactly which value is wrong. A trailing slash is the one thing
 * stripped, since it's the most common copy-paste slip and unambiguous.
 */
export function parseOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry !== "");

  for (const origin of origins) {
    let canonical: string;
    try {
      canonical = new URL(origin).origin;
    } catch {
      throw new Error(`FRONTEND_ORIGINS: "${origin}" is not a URL`);
    }
    if (canonical !== origin) {
      throw new Error(
        `FRONTEND_ORIGINS: "${origin}" doesn't match what a browser sends — use "${canonical}"`,
      );
    }
  }
  if (origins.length === 0) {
    throw new Error("FRONTEND_ORIGINS must list at least one origin");
  }
  return origins;
}

/** `TRUSTED_PROXIES` (comma-separated IPs) → the list Express's `trust proxy`
 * takes. Empty means trust no proxy: `X-Forwarded-*` headers are ignored. */
export function parseTrustedProxies(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

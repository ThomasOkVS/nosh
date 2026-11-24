export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

function parseOrigin(entry: string): string {
  const raw = entry.replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(
      `Invalid origin "${entry}": not a URL. Use the form https://host or http://host:port.`,
    );
  }
  if (!(url.protocol in DEFAULT_PORTS)) {
    throw new ConfigError(`Invalid origin "${entry}": only http and https are allowed.`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new ConfigError(
      `Invalid origin "${entry}": an origin has no path, query or credentials; use ${url.origin}.`,
    );
  }
  // URL drops a default port, so look at the raw text: browsers never send one.
  if (raw.endsWith(`:${DEFAULT_PORTS[url.protocol]}`)) {
    throw new ConfigError(
      `Invalid origin "${entry}": browsers never send the default port; use ${url.origin}.`,
    );
  }
  return url.origin;
}

/** SEC-51: a comma-separated list of exact browser origins. */
export function parseOrigins(raw: string): string[] {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) {
    throw new ConfigError("The allowed origins list is empty.");
  }
  return entries.map(parseOrigin);
}

export interface ClientInfo {
  ip: string;
  isHttps: boolean;
}

/** `::ffff:172.20.0.2` → `172.20.0.2`, so mapped and plain IPv4 compare equal. */
function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapped?.[1] ?? ip;
}

/**
 * SEC-13, SEC-14: forwarded headers are believed only from a trusted proxy
 * (Caddy). It appends the address it saw, so the rightmost entry is the one
 * it vouches for; anything to its left came from the client.
 */
export function resolveClient(input: {
  peer: string;
  headers: Headers;
  trustedProxies: string[];
  socketIsTls: boolean;
}): ClientInfo {
  const peer = normalizeIp(input.peer);
  const trusted = input.trustedProxies.some((proxy) => normalizeIp(proxy) === peer);
  if (!trusted) {
    return { ip: peer, isHttps: input.socketIsTls };
  }
  const forwarded = (input.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .at(-1);
  return {
    ip: forwarded === undefined ? peer : normalizeIp(forwarded),
    isHttps: input.headers.get("x-forwarded-proto") === "https",
  };
}

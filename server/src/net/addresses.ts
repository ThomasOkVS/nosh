import { BlockList, isIP } from "node:net";

// SEC-31: the complete blocklist. Embedded-IPv4 prefixes (mapped, NAT64,
// 6to4) are not blocked wholesale; they are unwrapped (SEC-33) and the
// embedded IPv4 address is judged by these ranges.
const v4Ranges: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const v6Ranges: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback and deprecated IPv4-compatible
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

const blockList = new BlockList();
for (const [net, prefix] of v4Ranges) blockList.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of v6Ranges) blockList.addSubnet(net, prefix, "ipv6");

/** Parses a valid IPv6 literal into eight 16-bit groups. */
function parseV6(ip: string): number[] {
  let text = ip;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = tail.split(".").map(Number);
    text =
      text.slice(0, lastColon + 1) +
      (((o[0] ?? 0) << 8) | (o[1] ?? 0)).toString(16) +
      ":" +
      (((o[2] ?? 0) << 8) | (o[3] ?? 0)).toString(16);
  }
  const [head = "", rest] = text.split("::");
  const h = head === "" ? [] : head.split(":");
  const t = rest === undefined || rest === "" ? [] : rest.split(":");
  const fill = rest === undefined ? 0 : 8 - h.length - t.length;
  return [...h, ...Array<string>(fill).fill("0"), ...t].map((g) => parseInt(g, 16));
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** SEC-31 to SEC-33. Fails closed: anything that is not an IP literal is blocked. */
export function isBlockedAddress(ip: string): boolean {
  if (ip.includes("%")) return true; // zone id: link-local, and not a plain literal
  const family = isIP(ip);
  if (family === 0) return true;
  if (family === 4) return blockList.check(ip, "ipv4");

  const g = parseV6(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return true;
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = g as [
    number, number, number, number, number, number, number?, number?,
  ];
  // IPv4-mapped ::ffff:a.b.c.d (dotted or hex)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return blockList.check(v4FromGroups(g6, g7), "ipv4");
  }
  // NAT64 64:ff9b::/96
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return blockList.check(v4FromGroups(g6, g7), "ipv4");
  }
  // 6to4 2002::/16 embeds the IPv4 address in the next 32 bits
  if (g0 === 0x2002) {
    return blockList.check(v4FromGroups(g1, g2), "ipv4");
  }
  return blockList.check(ip, "ipv6");
}

export type UrlCheck =
  | { ok: true; url: URL }
  | {
      ok: false;
      error:
        | "Not a valid URL"
        | "Only http/https URLs are supported"
        | "This URL cannot be imported";
    };

/** SEC-34. A hostname that is not an IP literal passes, except localhost. */
export function checkUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http/https URLs are supported" };
  }
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, error: "This URL cannot be imported" };
  }
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    return { ok: false, error: "This URL cannot be imported" };
  }
  return { ok: true, url };
}

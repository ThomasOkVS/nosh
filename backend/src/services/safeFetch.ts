import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

/**
 * Outbound-fetch guard for every URL a user can make the backend request
 * (recipe import, attaching a photo from a URL), and the address check
 * shared with the yt-dlp egress proxy and the Web Push sender.
 *
 * Why this exists: the backend's Docker networks can reach things that must
 * never be reachable from the internet — the host's own published ports
 * (dockge on :5001 has docker.sock), other containers' admin UIs, the tailnet.
 * Once Nosh is public, "import this URL" is a way for anyone with an account
 * to make requests from *inside* that network (SSRF).
 *
 * Two layers, because each covers a hole in the other:
 *  - `validateUrl` (recipeExtraction.ts) rejects a URL whose host is a
 *    blocked IP *literal*, before any request. Node skips DNS entirely for a
 *    literal, so this is the only place those get checked.
 *  - `safeFetch` checks every address a *hostname* resolves to, inside the
 *    socket's own DNS lookup. The address that gets checked is the address
 *    that gets connected to — there's no second resolution an attacker's DNS
 *    server could answer differently (DNS rebinding).
 */

/** A request was refused because its destination is on the blocklist. */
export class BlockedAddressError extends Error {
  constructor() {
    super("That address is not allowed");
  }
}

// Everything that isn't the public internet. Node's BlockList also matches an
// IPv4-mapped IPv6 address (::ffff:10.0.0.1) against the IPv4 rules, but the
// explicit embedded-address handling in isBlockedAddress doesn't rely on that.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT — includes the Tailscale tailnet
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata endpoints
  ["172.16.0.0", 12], // RFC1918 — includes every Docker bridge network
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255 broadcast
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // deprecated IPv4-compatible
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique-local (ULA)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Pulls the IPv4 address out of the IPv6 forms that embed one, since each is
 * a way to spell a private IPv4 address that a plain IPv6 check would miss. */
function embeddedIPv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) and NAT64 (64:ff9b::/96).
  const match = /^(?:::ffff:|64:ff9b::)(.+)$/.exec(lower);
  if (!match?.[1]) {
    // 6to4 (2002:AABB:CCDD::/16) carries the IPv4 in the next 32 bits.
    const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(lower);
    return sixToFour?.[1] && sixToFour[2] ? hexPairToIPv4(sixToFour[1], sixToFour[2]) : null;
  }
  const tail = match[1];
  if (isIP(tail) === 4) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  return hex?.[1] && hex[2] ? hexPairToIPv4(hex[1], hex[2]) : null;
}

function hexPairToIPv4(high: string, low: string): string {
  const h = parseInt(high, 16);
  const l = parseInt(low, 16);
  return [h >> 8, h & 0xff, l >> 8, l & 0xff].join(".");
}

/** True for any IP address the backend must never connect to. Anything that
 * isn't a valid IP at all is treated as blocked — fail closed. */
export function isBlockedAddress(rawAddress: string): boolean {
  const address = rawAddress.replace(/^\[|]$/g, "");
  const version = isIP(address);
  if (version === 4) return blocked.check(address, "ipv4");
  if (version === 6) {
    const v4 = embeddedIPv4(address);
    if (v4 !== null && blocked.check(v4, "ipv4")) return true;
    return blocked.check(address, "ipv6");
  }
  return true;
}

export type ResolveAllFn = (hostname: string) => Promise<dns.LookupAddress[]>;

const resolveWithSystemDns: ResolveAllFn = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

export interface AddressGuardOptions {
  /** Overridable so tests can make a hostname resolve to anything. */
  resolve?: ResolveAllFn;
  /** Overridable so tests can reach a local test server on 127.0.0.1. */
  isBlocked?: (address: string) => boolean;
}

function notFound(hostname: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`No addresses for ${hostname}`);
  err.code = "ENOTFOUND";
  return err;
}

/**
 * The one guard every outbound connection to an untrusted destination goes
 * through: `safeFetch`'s socket lookup, the yt-dlp egress proxy
 * (egressProxy.ts) and the Web Push sender (pushNotifier.ts) all call this,
 * so the blocklist can't drift between them.
 *
 * Resolves `host` and returns its addresses, or rejects with
 * `BlockedAddressError` if *any* of them is blocked — otherwise a name with
 * one public and one private A record would connect to the private one
 * whenever the socket happens to try it. An IP literal is checked as-is
 * (`dns.lookup` hands a literal straight back), which matters because
 * `net.connect` never calls a custom `lookup` for a literal. Callers must
 * connect to an address this returned, never re-resolve the name.
 */
export async function resolveCheckedAddresses(
  host: string,
  options: AddressGuardOptions & { family?: number | "IPv4" | "IPv6" } = {},
): Promise<dns.LookupAddress[]> {
  const { resolve = resolveWithSystemDns, isBlocked = isBlockedAddress } = options;
  const hostname = host.replace(/^\[|]$/g, "");
  const family =
    options.family === 4 || options.family === "IPv4"
      ? 4
      : options.family === 6 || options.family === "IPv6"
        ? 6
        : 0;
  const version = isIP(hostname);
  const addresses = version !== 0 ? [{ address: hostname, family: version }] : await resolve(hostname);
  const usable = addresses.filter((entry) => family === 0 || entry.family === family);
  if (usable.length === 0) throw notFound(hostname);
  if (usable.some((entry) => isBlocked(entry.address))) throw new BlockedAddressError();
  return usable;
}

/**
 * A `lookup` for `net.connect` that refuses to hand back a blocked address
 * (see `resolveCheckedAddresses`).
 *
 * Node calls `lookup` two ways: with `{ all: true }` (happy-eyeballs, the
 * default since Node 20) wanting an array back, and without it wanting a
 * single address and family. Both are handled.
 */
export function createGuardedLookup(
  resolve: ResolveAllFn = resolveWithSystemDns,
  isBlocked: (address: string) => boolean = isBlockedAddress,
): LookupFunction {
  return (hostname, options, callback) => {
    resolveCheckedAddresses(hostname, { resolve, isBlocked, family: options.family })
      .then((usable) => {
        if (options.all) {
          // The callback's declared type is the single-address overload; the
          // array form is what Node expects when `all` is set.
          (callback as unknown as (err: null, addresses: dns.LookupAddress[]) => void)(
            null,
            usable,
          );
          return;
        }
        const [first] = usable;
        callback(null, first?.address ?? "", first?.family ?? 4);
      })
      .catch((err: unknown) => callback(err as NodeJS.ErrnoException, "", 0));
  };
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function decode(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return res.pipe(zlib.createGunzip());
    case "deflate":
      return res.pipe(zlib.createInflate());
    case "br":
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

function toHeaders(res: http.IncomingMessage, decoded: boolean): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    // The body below is already decompressed, so its length and encoding no
    // longer match what the server declared.
    if (decoded && (name === "content-encoding" || name === "content-length")) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
}

export type SafeFetchOptions = AddressGuardOptions;

/**
 * A drop-in for the subset of `fetch` the import code uses (GET, custom
 * headers, an abort signal, `redirect: "manual"`), built on node:http so the
 * DNS lookup can be guarded — Node's built-in fetch has no hook for that
 * without pulling in the `undici` package.
 *
 * Never follows redirects itself: callers already follow them by hand and
 * re-run `validateUrl` on each hop, and every hop's connection goes back
 * through the guarded lookup here.
 */
export function createSafeFetch(options: SafeFetchOptions = {}): typeof fetch {
  const lookup = createGuardedLookup(options.resolve, options.isBlocked);

  const safeFetch = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const transport = url.protocol === "https:" ? https : url.protocol === "http:" ? http : null;
    if (!transport) return Promise.reject(new TypeError("Only http/https URLs are supported"));

    return new Promise<Response>((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method: "GET",
          headers: {
            "Accept-Encoding": "gzip, deflate, br",
            ...(init.headers as Record<string, string>),
          },
          lookup,
          // A fresh connection per request: the shared global agent's
          // keep-alive pool would reuse a socket without running the lookup.
          agent: false,
          signal: init.signal ?? undefined,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          // `Response` only accepts 200-599; anything else isn't a response
          // the import code could do anything useful with anyway.
          if (status < 200 || status > 599) {
            res.resume();
            reject(new Error(`Unexpected HTTP status ${status}`));
            return;
          }
          if (NULL_BODY_STATUSES.has(status)) {
            res.resume();
            resolve(new Response(null, { status, headers: toHeaders(res, false) }));
            return;
          }
          const body = decode(res);
          resolve(
            new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, {
              status,
              statusText: res.statusMessage,
              headers: toHeaders(res, body !== res),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  };

  return safeFetch as typeof fetch;
}

/** The default fetch for all user-supplied URLs. */
export const safeFetch = createSafeFetch();

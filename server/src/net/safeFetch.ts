import { promises as dns, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent, buildConnector, fetch, type Response } from "undici";
import { checkUrl, isBlockedAddress } from "./addresses.js";

/** Resolves every address of a hostname. Injectable for tests. */
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Kept for the caller's interface; callers map `kind` to their own copy. */
  tooManyRedirectsMessage: string;
  lookup?: LookupFn;
  /** Test-only: overrides the address predicate. Production uses `isBlockedAddress`. */
  isBlocked?: (ip: string) => boolean;
}

export type SafeFetchFailureKind =
  | "blocked"
  | "too-many-redirects"
  | "no-location"
  | "timeout"
  | "too-large"
  | "network"
  | "http";

export type SafeFetchResult =
  | { ok: true; status: number; headers: Headers; body: Buffer }
  | { ok: false; kind: SafeFetchFailureKind; status?: number };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const defaultLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true });

type NetLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

class BlockedAddressError extends Error {
  constructor() {
    super("destination address is blocked");
  }
}

/**
 * One agent per hop, so no connection is ever reused without a fresh check
 * (SEC-38). Its connector checks IP-literal hosts, which `net.connect` never
 * passes to `lookup`; its lookup resolves all addresses, refuses the name if
 * any is blocked (SEC-36, SEC-37), and hands back exactly the one it uses.
 */
function guardedAgent(lookupAll: LookupFn, isBlocked: (ip: string) => boolean, onBlocked: () => void): Agent {
  const lookup = (hostname: string, options: LookupOptions, callback: NetLookupCallback): void => {
    lookupAll(hostname).then(
      (addresses) => {
        const chosen = addresses[0];
        if (chosen === undefined || addresses.some((a) => isBlocked(a.address))) {
          onBlocked();
          callback(new BlockedAddressError(), "", 0);
          return;
        }
        if (options.all === true) callback(null, [chosen]);
        else callback(null, chosen.address, chosen.family);
      },
      (err: NodeJS.ErrnoException) => callback(err, "", 0),
    );
  };
  const base = buildConnector({ lookup, autoSelectFamily: false });
  return new Agent({
    connect: (options, callback) => {
      let host = options.hostname;
      if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
      if (isIP(host) !== 0 && isBlocked(host)) {
        onBlocked();
        callback(new BlockedAddressError(), null);
        return;
      }
      base(options, callback);
    },
  });
}

/** Reads the decoded body, refusing once it passes maxBytes (SEC-41, SEC-42). */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer | "too-large"> {
  if (res.body === null) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return "too-large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * The SSRF-guarded fetch (SEC-36 to SEC-42). GET only. Failures carry only a
 * `kind` (and `status` for "http"); the raw error goes to the server log (SEC-40).
 */
export async function safeFetch(url: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const lookupAll = opts.lookup ?? defaultLookup;
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const agents: Agent[] = [];
  let blocked = false;
  const onBlocked = () => {
    blocked = true;
  };

  try {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      const checked = checkUrl(current);
      if (!checked.ok) return { ok: false, kind: "blocked" };

      const agent = guardedAgent(lookupAll, isBlocked, onBlocked);
      agents.push(agent);
      const res = await fetch(checked.url, { dispatcher: agent, redirect: "manual", signal });

      if (REDIRECTS.has(res.status)) {
        await res.body?.cancel().catch(() => {});
        const location = res.headers.get("location");
        if (location === null) return { ok: false, kind: "no-location" };
        if (redirects >= opts.maxRedirects) return { ok: false, kind: "too-many-redirects" };
        try {
          current = new URL(location, checked.url).href;
        } catch {
          return { ok: false, kind: "blocked" };
        }
        continue;
      }

      if (res.status < 200 || res.status > 299) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, kind: "http", status: res.status };
      }

      const declared = Number(res.headers.get("content-length") ?? NaN);
      if (Number.isFinite(declared) && declared > opts.maxBytes) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, kind: "too-large" };
      }

      const body = await readCapped(res, opts.maxBytes);
      if (body === "too-large") return { ok: false, kind: "too-large" };
      return { ok: true, status: res.status, headers: new Headers([...res.headers]), body };
    }
  } catch (err) {
    console.error("safeFetch failed", err);
    if (signal.aborted) return { ok: false, kind: "timeout" };
    if (blocked) return { ok: false, kind: "blocked" };
    return { ok: false, kind: "network" };
  } finally {
    await Promise.all(agents.map((a) => a.destroy().catch(() => {})));
  }
}

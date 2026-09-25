import http from "node:http";
import net, { type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { BlockedAddressError, resolveCheckedAddresses, type AddressGuardOptions } from "./safeFetch";

/**
 * A tiny forward proxy that yt-dlp is made to send *all* of its traffic
 * through, so its connections get the same SSRF guard as the backend's own
 * fetches (services/safeFetch.ts).
 *
 * Why a proxy: yt-dlp is a separate Python process with its own HTTP stack —
 * it follows redirects and fetches whatever API/CDN URLs the extractor finds,
 * and none of that passes through Node. `--proxy` is the one hook it offers
 * that covers every request it makes, so the guard sits there.
 *
 * It speaks the two ways a client uses an HTTP proxy:
 *  - `CONNECT host:443` — the client asks for a raw TCP tunnel, then runs TLS
 *    through it end to end. That's how every https:// request travels; the
 *    proxy never sees the URL or the content, only host and port, which is
 *    all the guard needs.
 *  - `GET http://host/path` (absolute-form request line) — plain http://,
 *    which the proxy forwards request by request.
 *
 * For both, the target host is resolved once, every resolved address is
 * checked, and the proxy connects to that checked IP — never the name — so a
 * DNS rebind between check and connect has nothing to answer.
 *
 * Bound to 127.0.0.1 only. Anything else in the container could use it too,
 * but it only ever reaches addresses the backend could already reach
 * directly, so that grants nothing.
 */

const DEFAULT_ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);
const IDLE_TIMEOUT_MS = 60_000;

// Per-connection or proxy-only headers: meaningful between yt-dlp and this
// proxy, not to be passed on to the destination.
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-authenticate",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface EgressProxyOptions extends AddressGuardOptions {
  /** Destination ports allowed through; 80 and 443 unless overridden (tests
   * need an ephemeral port for their local target server). */
  allowedPorts?: ReadonlySet<number>;
  /** Where refusals are reported; overridable so tests can assert on it. */
  log?: (message: string) => void;
}

export interface EgressProxy {
  /** e.g. `http://127.0.0.1:41234` — what yt-dlp's `--proxy` gets. */
  url: string;
  close: () => Promise<void>;
}

interface Target {
  host: string;
  port: number;
}

class RefusedError extends Error {}

/** Parses the `host:port` of a CONNECT line. The port is mandatory there;
 * IPv6 literals arrive bracketed (`[2606:4700::1]:443`). */
export function parseAuthority(authority: string): Target | null {
  const match = /^(\[[0-9a-fA-F:.]+\]|[^:[\]/\s]+):(\d{1,5})$/.exec(authority);
  if (!match?.[1] || !match[2]) return null;
  return { host: match[1].replace(/^\[|]$/g, ""), port: Number(match[2]) };
}

function writeStatus(socket: Duplex, status: number, reason: string): void {
  if (!socket.writable) return;
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export async function startEgressProxy(options: EgressProxyOptions = {}): Promise<EgressProxy> {
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  const log = options.log ?? ((message: string) => console.warn(message));

  /** Resolves to the one checked IP to connect to, or throws RefusedError
   * after logging. Logs the host only, never a path or query string — those
   * can carry tokens. */
  async function checkedAddress(target: Target): Promise<string> {
    if (!allowedPorts.has(target.port)) {
      log(`Egress proxy refused ${target.host}:${target.port}: port not allowed`);
      throw new RefusedError();
    }
    try {
      const [first] = await resolveCheckedAddresses(target.host, options);
      if (!first) throw new RefusedError();
      return first.address;
    } catch (err) {
      const reason = err instanceof BlockedAddressError ? "blocked address" : "could not resolve";
      log(`Egress proxy refused ${target.host}:${target.port}: ${reason}`);
      throw new RefusedError();
    }
  }

  async function handleConnect(req: http.IncomingMessage, client: Duplex, head: Buffer): Promise<void> {
    client.on("error", () => client.destroy());
    const target = parseAuthority(req.url ?? "");
    if (!target) {
      writeStatus(client, 400, "Bad Request");
      return;
    }
    let address: string;
    try {
      address = await checkedAddress(target);
    } catch {
      writeStatus(client, 403, "Forbidden");
      return;
    }

    const upstream = net.connect({ host: address, port: target.port });
    upstream.setTimeout(IDLE_TIMEOUT_MS, () => upstream.destroy());
    let tunnelled = false;
    upstream.once("connect", () => {
      tunnelled = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => {
      if (tunnelled) client.destroy();
      else writeStatus(client, 502, "Bad Gateway");
    });
    client.on("close", () => upstream.destroy());
  }

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    // A proxy request line is absolute-form (`GET http://host/path`); a
    // relative one means something is talking to the proxy as if it were a
    // web server.
    if (url.protocol !== "http:") {
      res.writeHead(400).end();
      return;
    }
    const target = { host: url.hostname, port: url.port === "" ? 80 : Number(url.port) };
    let address: string;
    try {
      address = await checkedAddress(target);
    } catch {
      res.writeHead(403).end();
      return;
    }

    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name)) headers[name] = value;
    }
    headers.host = url.host;

    const upstream = http.request(
      {
        host: address,
        port: target.port,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers,
        // One fresh upstream connection per request: each request gets its
        // own check, and no pooled socket can be reused for another host.
        agent: false,
        setHost: false,
      },
      (upstreamRes) => {
        const responseHeaders: http.OutgoingHttpHeaders = {};
        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name)) responseHeaders[name] = value;
        }
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
      },
    );
    upstream.setTimeout(IDLE_TIMEOUT_MS, () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    req.pipe(upstream);
  }

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.on("connect", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    void handleConnect(req, socket, head);
  });
  // A malformed request from the client: drop it rather than let the socket
  // error go unhandled (which would crash the backend).
  server.on("clientError", (_err, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Explicit host: the default would listen on every interface.
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

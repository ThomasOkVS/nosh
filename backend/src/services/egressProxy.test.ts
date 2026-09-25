import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseAuthority, startEgressProxy, type EgressProxy } from "./egressProxy";
import type { ResolveAllFn } from "./safeFetch";

/** Hostnames the fake resolver knows. Real DNS is never used: each name
 * stands in for what an attacker-controlled DNS server could answer. */
const DNS: Record<string, string[]> = {
  "loopback.attacker.test": ["127.0.0.1"],
  "docker-host.attacker.test": ["172.28.0.1"],
  "lan-box.attacker.test": ["10.101.0.10"],
  "cgnat.attacker.test": ["100.64.12.34"],
  "mixed.attacker.test": ["93.184.215.14", "172.28.0.1"],
  "cdn.public.test": ["93.184.215.14"],
};

const fakeResolve: ResolveAllFn = (hostname) => {
  const addresses = DNS[hostname];
  if (!addresses) return Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  return Promise.resolve(addresses.map((address) => ({ address, family: net.isIP(address) })));
};

/** Sends a raw CONNECT and resolves with the proxy's status line. */
function connectStatus(proxy: EgressProxy, authority: string): Promise<string> {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    socket.once("data", (chunk) => {
      resolve(chunk.toString("latin1").split("\r\n")[0] ?? "");
      socket.destroy();
    });
    socket.on("error", reject);
  });
}

/** Sends a plain-HTTP proxy request (absolute-form URL) through the proxy. */
function proxiedGet(proxy: EgressProxy, url: string): Promise<{ status: number; body: string }> {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: Number(port), path: url, headers: { host: new URL(url).host } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("parseAuthority", () => {
  it.each([
    ["example.com:443", { host: "example.com", port: 443 }],
    ["93.184.215.14:80", { host: "93.184.215.14", port: 80 }],
    ["[2606:4700::1111]:443", { host: "2606:4700::1111", port: 443 }],
  ])("parses %s", (authority, expected) => {
    expect(parseAuthority(authority)).toEqual(expected);
  });

  it.each(["example.com", "http://example.com:443", "example.com:443/path", ""])(
    "rejects %s",
    (authority) => {
      expect(parseAuthority(authority)).toBeNull();
    },
  );
});

describe("egress proxy — refusals (real blocklist)", () => {
  let proxy: EgressProxy;
  const log = vi.fn<(message: string) => void>();

  beforeAll(async () => {
    proxy = await startEgressProxy({ resolve: fakeResolve, log });
  });
  afterAll(() => proxy.close());
  afterEach(() => log.mockClear());

  it("listens on loopback only", () => {
    expect(new URL(proxy.url).hostname).toBe("127.0.0.1");
  });

  it.each([
    ["loopback.attacker.test", "127.0.0.1"],
    ["docker-host.attacker.test", "172.28.0.1 (the Docker host, where dockge listens)"],
    ["lan-box.attacker.test", "10.101.0.10"],
    ["cgnat.attacker.test", "100.64.x (CGNAT)"],
    ["mixed.attacker.test", "one public and one private record"],
  ])("refuses a CONNECT to %s, which resolves to %s", async (hostname) => {
    expect(await connectStatus(proxy, `${hostname}:443`)).toBe("HTTP/1.1 403 Forbidden");
    expect(log).toHaveBeenCalledWith(`Egress proxy refused ${hostname}:443: blocked address`);
  });

  it.each(["172.28.0.1:443", "127.0.0.1:443", "[::1]:443", "[::ffff:172.28.0.1]:443"])(
    "refuses a CONNECT to the IP literal %s",
    async (authority) => {
      expect(await connectStatus(proxy, authority)).toBe("HTTP/1.1 403 Forbidden");
    },
  );

  it("refuses a CONNECT to a non-web port, even on a public IP", async () => {
    expect(await connectStatus(proxy, "93.184.215.14:5001")).toBe("HTTP/1.1 403 Forbidden");
    expect(log).toHaveBeenCalledWith("Egress proxy refused 93.184.215.14:5001: port not allowed");
  });

  it("refuses a name that doesn't resolve", async () => {
    expect(await connectStatus(proxy, "nowhere.test:443")).toBe("HTTP/1.1 403 Forbidden");
  });

  it("refuses plain-HTTP requests to blocked hosts and ports, and logs only the host", async () => {
    expect((await proxiedGet(proxy, "http://docker-host.attacker.test/secret?token=abc")).status).toBe(403);
    expect((await proxiedGet(proxy, "http://172.28.0.1:5001/")).status).toBe(403);
    const messages = log.mock.calls.map(([message]) => message).join("\n");
    expect(messages).not.toContain("secret");
    expect(messages).not.toContain("token");
  });

  it("refuses a request that isn't in proxy (absolute) form", async () => {
    const { port } = new URL(proxy.url);
    const status = await new Promise<number>((resolve, reject) => {
      http.get({ host: "127.0.0.1", port: Number(port), path: "/" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on("error", reject);
    });
    expect(status).toBe(400);
  });
});

describe("egress proxy — allowed traffic", () => {
  // A local server standing in for a public CDN. The proxy is told its name
  // resolves to 127.0.0.1 and that the address is fine: real DNS can't
  // resolve "cdn.public.test", so a successful request proves the proxy
  // connected to the checked IP rather than looking the name up again.
  let target: http.Server;
  let targetPort: number;
  let proxy: EgressProxy;
  const seen: { host?: string; url?: string }[] = [];

  beforeAll(async () => {
    target = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url });
      res.end("hello from the public internet");
    });
    await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
    targetPort = (target.address() as AddressInfo).port;
    proxy = await startEgressProxy({
      resolve: (hostname) =>
        hostname === "cdn.public.test"
          ? Promise.resolve([{ address: "127.0.0.1", family: 4 }])
          : fakeResolve(hostname),
      isBlocked: () => false,
      allowedPorts: new Set([targetPort]),
      log: () => undefined,
    });
  });
  afterAll(async () => {
    await proxy.close();
    await new Promise<void>((resolve) => target.close(() => resolve()));
  });

  it("tunnels a CONNECT to a public host", async () => {
    const { port } = new URL(proxy.url);
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(Number(port), "127.0.0.1", () => {
        socket.write(`CONNECT cdn.public.test:${targetPort} HTTP/1.1\r\n\r\n`);
      });
      let received = "";
      let tunnelled = false;
      socket.on("data", (chunk) => {
        received += chunk.toString("latin1");
        if (!tunnelled && received.includes("\r\n\r\n")) {
          tunnelled = true;
          expect(received.startsWith("HTTP/1.1 200")).toBe(true);
          received = "";
          socket.write(`GET /video.mp4 HTTP/1.1\r\nHost: cdn.public.test\r\nConnection: close\r\n\r\n`);
        }
      });
      socket.on("end", () => resolve(received));
      socket.on("error", reject);
    });
    expect(response).toContain("hello from the public internet");
  });

  it("forwards a plain-HTTP request with the original Host header", async () => {
    const res = await proxiedGet(proxy, `http://cdn.public.test:${targetPort}/thumb.jpg?x=1`);
    expect(res).toEqual({ status: 200, body: "hello from the public internet" });
    expect(seen.at(-1)).toEqual({ host: `cdn.public.test:${targetPort}`, url: "/thumb.jpg?x=1" });
  });
});

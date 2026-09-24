import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRecipeFromUrl, InvalidUrlError, validateUrl } from "./recipeExtraction";
import {
  BlockedAddressError,
  createGuardedLookup,
  createSafeFetch,
  isBlockedAddress,
} from "./safeFetch";

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918 10/8"],
    ["172.16.0.1", "RFC1918 172.16/12, low end"],
    ["172.28.0.1", "the homelab's Docker host gateway (dockge on :5001)"],
    ["172.31.255.255", "RFC1918 172.16/12, high end"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["100.64.0.1", "CGNAT (tailnet), low end"],
    ["100.127.255.254", "CGNAT (tailnet), high end"],
    ["0.0.0.0", "this-network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fd12:3456::1", "IPv6 ULA"],
    ["fe80::1", "IPv6 link-local"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:172.28.0.1", "IPv4-mapped, dotted"],
    ["::ffff:ac1c:1", "IPv4-mapped, hex (172.28.0.1)"],
    ["64:ff9b::a00:1", "NAT64 of 10.0.0.1"],
    ["2002:c0a8:101::1", "6to4 of 192.168.1.1"],
    ["[::1]", "bracketed IPv6"],
    ["not-an-ip", "garbage — fails closed"],
  ])("blocks %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([["93.184.215.14"], ["8.8.8.8"], ["172.32.0.1"], ["100.128.0.1"], ["2606:4700::1111"]])(
    "allows public address %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("validateUrl (literal hosts)", () => {
  it.each([
    ["http://172.28.0.1:5001/"],
    ["http://2887516161/"], // 172.28.0.1 as a single decimal number
    ["http://0x7f.1/"], // 127.0.0.1, hex shorthand
    ["http://[::ffff:172.28.0.1]:5001/"],
    ["http://100.64.0.1/"],
    ["http://[fd00::1]/"],
    ["http://localhost./"],
  ])("rejects %s", (url) => {
    expect(() => validateUrl(url)).toThrow(InvalidUrlError);
  });

  it.each([["ftp://example.com/x"], ["file:///etc/passwd"], ["gopher://example.com/"]])(
    "rejects non-http(s) scheme %s",
    (url) => {
      expect(() => validateUrl(url)).toThrow(InvalidUrlError);
    },
  );

  it("lets a hostname through — its addresses are checked at connect time instead", () => {
    expect(validateUrl("https://example.com/recipe").hostname).toBe("example.com");
  });
});

describe("createGuardedLookup", () => {
  const lookupOnce = (
    resolved: { address: string; family: number }[],
    options: { all?: boolean; family?: number },
  ) =>
    new Promise<{ err: Error | null; result: unknown }>((resolve) => {
      const lookup = createGuardedLookup(async () => resolved);
      lookup("host.test", options, (err, address, family) =>
        resolve({ err, result: options.all ? address : { address, family } }),
      );
    });

  it("returns the array form when Node asks for all addresses", async () => {
    const { err, result } = await lookupOnce([{ address: "93.184.215.14", family: 4 }], {
      all: true,
    });
    expect(err).toBeNull();
    expect(result).toEqual([{ address: "93.184.215.14", family: 4 }]);
  });

  it("returns a single address otherwise", async () => {
    const { err, result } = await lookupOnce([{ address: "93.184.215.14", family: 4 }], {});
    expect(err).toBeNull();
    expect(result).toEqual({ address: "93.184.215.14", family: 4 });
  });

  it("refuses the whole name if any one of its addresses is blocked", async () => {
    const { err } = await lookupOnce(
      [
        { address: "93.184.215.14", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
      { all: true },
    );
    expect(err).toBeInstanceOf(BlockedAddressError);
  });
});

/**
 * Real sockets against a local server. A test resolver maps made-up
 * hostnames to addresses; since the server can only listen on 127.0.0.1,
 * tests that need a "public" host treat 127.0.0.1 as allowed and keep every
 * other default rule — so a redirect to 172.28.0.1 is still refused exactly
 * as in production.
 */
describe("safeFetch against a real server", () => {
  const requestsSeen: string[] = [];
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestsSeen.push(`${req.headers.host}${req.url}`);
      if (req.url === "/redirect-to-internal-name") {
        res.writeHead(302, { location: `http://internal.test:${port}/secret` });
        res.end();
      } else if (req.url === "/redirect-to-internal-ip") {
        res.writeHead(302, { location: "http://172.28.0.1:5001/" });
        res.end();
      } else if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(zlib.gzipSync("<html>compressed</html>"));
      } else if (req.url === "/empty") {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>hello</html>");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requestsSeen.length = 0;
  });

  const loopbackCountsAsPublic = (address: string): boolean =>
    address !== "127.0.0.1" && isBlockedAddress(address);

  it("refuses to connect when a hostname resolves to a private address", async () => {
    // "attacker.test" passes validateUrl — it's a name, not an IP literal —
    // and only its DNS answer gives it away.
    const safeFetch = createSafeFetch({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    const url = `http://attacker.test:${port}/`;
    expect(() => validateUrl(url)).not.toThrow();

    await expect(safeFetch(url)).rejects.toBeInstanceOf(BlockedAddressError);
    expect(requestsSeen).toEqual([]);
  });

  it("connects when the resolved address is allowed (control for the test above)", async () => {
    const safeFetch = createSafeFetch({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlocked: loopbackCountsAsPublic,
    });

    const res = await safeFetch(`http://public.test:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>hello</html>");
  });

  it("checks the exact answer it connects with, so DNS rebinding has no second lookup to win", async () => {
    // A rebinding DNS server answers "public" to the first query and
    // "private" to the next, hoping the check and the connect each make one.
    const answers = ["127.0.0.1", "172.28.0.1"];
    const resolve = vi.fn(async () => [{ address: answers.shift() ?? "172.28.0.1", family: 4 }]);
    const safeFetch = createSafeFetch({ resolve, isBlocked: loopbackCountsAsPublic });

    const first = await safeFetch(`http://rebind.test:${port}/`);
    expect(first.status).toBe(200);
    // One lookup per request: the address checked is the address used.
    expect(resolve).toHaveBeenCalledTimes(1);

    // The next connection resolves afresh (no pooled socket skips the check).
    await expect(safeFetch(`http://rebind.test:${port}/`)).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(requestsSeen).toHaveLength(1);
  });

  it("decodes a gzip-encoded body", async () => {
    const safeFetch = createSafeFetch({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlocked: loopbackCountsAsPublic,
    });
    const res = await safeFetch(`http://public.test:${port}/gzip`);
    expect(await res.text()).toBe("<html>compressed</html>");
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("returns a null-body response for 204", async () => {
    const safeFetch = createSafeFetch({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlocked: loopbackCountsAsPublic,
    });
    const res = await safeFetch(`http://public.test:${port}/empty`);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  describe("through the import pipeline", () => {
    const resolveTestNames = async (hostname: string) => [
      { address: hostname === "internal.test" ? "172.28.0.1" : "127.0.0.1", family: 4 },
    ];

    it("rejects a redirect to a hostname that resolves privately", async () => {
      const fetchImpl = createSafeFetch({
        resolve: resolveTestNames,
        isBlocked: loopbackCountsAsPublic,
      });

      await expect(
        extractRecipeFromUrl(`http://public.test:${port}/redirect-to-internal-name`, { fetchImpl }),
      ).rejects.toThrow(new InvalidUrlError("This URL cannot be imported"));
      // Only the first hop reached a server; the internal one never did.
      expect(requestsSeen).toEqual([`public.test:${port}/redirect-to-internal-name`]);
    });

    it("rejects a redirect to a private IP literal", async () => {
      const fetchImpl = createSafeFetch({
        resolve: resolveTestNames,
        isBlocked: loopbackCountsAsPublic,
      });

      await expect(
        extractRecipeFromUrl(`http://public.test:${port}/redirect-to-internal-ip`, { fetchImpl }),
      ).rejects.toThrow(new InvalidUrlError("This URL cannot be imported"));
      expect(requestsSeen).toEqual([`public.test:${port}/redirect-to-internal-ip`]);
    });
  });
});

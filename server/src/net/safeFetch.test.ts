import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch, type LookupFn, type SafeFetchOptions } from "./safeFetch.js";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
interface Target {
  port: number;
  hits: string[];
  remotes: string[];
}

const servers: http.Server[] = [];

async function serve(handler: Handler, host = "127.0.0.1"): Promise<Target> {
  const hits: string[] = [];
  const remotes: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    remotes.push(req.socket.localAddress ?? "");
    handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  return { port: (server.address() as AddressInfo).port, hits, remotes };
}

/** Maps test hostnames to fixed answers; records every lookup. */
function stubLookup(table: Record<string, string[] | (() => string[])>) {
  const calls: string[] = [];
  const lookup: LookupFn = async (hostname) => {
    calls.push(hostname);
    const entry = table[hostname];
    if (entry === undefined) throw Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
    const list = typeof entry === "function" ? entry() : entry;
    return list.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { lookup, calls };
}

const allowAll = () => false;

function opts(extra: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return {
    timeoutMs: 5_000,
    maxBytes: 1_000_000,
    maxRedirects: 5,
    tooManyRedirectsMessage: "The image URL redirected too many times",
    isBlocked: allowAll,
    ...extra,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});

describe("safeFetch", () => {
  it("SEC-36: refuses to connect when a hostname resolves to a private address", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await serve((_req, res) => res.end("secret"));
    const { lookup } = stubLookup({ "internal.test": ["127.0.0.1"] });
    // The real predicate: no isBlocked override.
    const result = await safeFetch(`http://internal.test:${t.port}/`, opts({ lookup, isBlocked: undefined }));
    expect(result).toEqual({ ok: false, kind: "blocked" });
    expect(t.hits).toHaveLength(0);
  });

  it("SEC-36: connects when the resolved address is allowed", async () => {
    const t = await serve((_req, res) => {
      res.setHeader("content-type", "text/plain");
      res.end("hello");
    });
    const { lookup } = stubLookup({ "public.test": ["127.0.0.1"] });
    const result = await safeFetch(`http://public.test:${t.port}/page`, opts({ lookup }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("text/plain");
    expect(result.body.toString()).toBe("hello");
    expect(t.hits).toEqual(["/page"]);
  });

  it("SEC-37: refuses the whole name if any one address is blocked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await serve((_req, res) => res.end("ok"));
    const isBlocked = (ip: string) => ip === "127.0.0.2";
    for (const answer of [
      ["127.0.0.1", "127.0.0.2"],
      ["127.0.0.2", "127.0.0.1"],
    ]) {
      const { lookup } = stubLookup({ "mixed.test": answer });
      const result = await safeFetch(`http://mixed.test:${t.port}/`, opts({ lookup, isBlocked }));
      expect(result).toEqual({ ok: false, kind: "blocked" });
    }
    expect(t.hits).toHaveLength(0);
  });

  it("SEC-38: checks the exact answer it connects with", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await serve((_req, res) => res.end("first"), "127.0.0.1");
    // A second listener on the same port number is not guaranteed, so the
    // second answer is a different loopback address with its own server.
    const second = await serve((_req, res) => res.end("second"), "127.0.0.2");
    const isBlocked = (ip: string) => ip !== "127.0.0.1" && ip !== "127.0.0.2";

    // Several allowed answers: the connection goes to the first one only.
    const multi = stubLookup({ "multi.test": ["127.0.0.1", "127.0.0.2"] });
    const a = await safeFetch(`http://multi.test:${first.port}/`, opts({ lookup: multi.lookup, isBlocked }));
    expect(a.ok && a.body.toString()).toBe("first");
    expect(multi.calls).toEqual(["multi.test"]);
    expect(first.remotes).toEqual(["127.0.0.1"]);
    expect(second.hits).toHaveLength(0);

    // DNS rebinding: public the first time, private the second.
    let n = 0;
    const rebind = stubLookup({ "rebind.test": () => (n++ === 0 ? ["127.0.0.1"] : ["10.0.0.1"]) });
    const onlyLoopback1 = (ip: string) => ip !== "127.0.0.1";
    const r1 = await safeFetch(`http://rebind.test:${first.port}/`, opts({ lookup: rebind.lookup, isBlocked: onlyLoopback1 }));
    expect(r1.ok).toBe(true);
    expect(rebind.calls).toHaveLength(1);
    const r2 = await safeFetch(`http://rebind.test:${first.port}/`, opts({ lookup: rebind.lookup, isBlocked: onlyLoopback1 }));
    expect(r2).toEqual({ ok: false, kind: "blocked" });
    expect(rebind.calls).toHaveLength(2);
    expect(first.hits).toHaveLength(2); // one from the multi case, one from r1
  });

  it("SEC-36 SEC-38: an IP-literal host is checked at connect time too, with no lookup", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { lookup, calls } = stubLookup({});
    // 8.8.8.8 passes checkUrl; the injected predicate blocks it, so only the
    // connect-time check can refuse it. Nothing is sent.
    const result = await safeFetch("http://8.8.8.8:8080/", opts({ lookup, isBlocked: () => true, timeoutMs: 2_000 }));
    expect(result).toEqual({ ok: false, kind: "blocked" });
    expect(calls).toHaveLength(0);

    // A blocked literal is refused by checkUrl before any request.
    const t = await serve((_req, res) => res.end("ok"));
    expect(await safeFetch(`http://127.0.0.1:${t.port}/`, opts({ lookup }))).toEqual({ ok: false, kind: "blocked" });
    expect(t.hits).toHaveLength(0);
  });

  it("SEC-39: rejects a redirect to a private literal or a privately resolving name; the internal target is never contacted; 6 hops fail with the given message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = await serve((_req, res) => res.end("secret"), "127.0.0.2");
    const isBlocked = (ip: string) => ip === "127.0.0.2";

    // To a private IP literal: checkUrl refuses it even though the injected
    // connect-time predicate here allows everything.
    const toLiteral = await serve((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.2:${internal.port}/` });
      res.end();
    });
    const l1 = stubLookup({ "public.test": ["127.0.0.1"] });
    expect(await safeFetch(`http://public.test:${toLiteral.port}/`, opts({ lookup: l1.lookup, isBlocked: allowAll }))).toEqual({
      ok: false,
      kind: "blocked",
    });
    expect(toLiteral.hits).toHaveLength(1);

    // To a hostname resolving privately.
    const toName = await serve((_req, res) => {
      res.writeHead(301, { location: `http://internal.test:${internal.port}/` });
      res.end();
    });
    const l2 = stubLookup({ "public.test": ["127.0.0.1"], "internal.test": ["127.0.0.2"] });
    expect(await safeFetch(`http://public.test:${toName.port}/`, opts({ lookup: l2.lookup, isBlocked }))).toEqual({
      ok: false,
      kind: "blocked",
    });
    expect(toName.hits).toHaveLength(1);
    expect(internal.hits).toHaveLength(0);

    // Hops are followed (relative Location too) up to maxRedirects; one more fails.
    const chain = await serve((req, res) => {
      const n = Number((req.url ?? "/0").slice(1));
      if (n === 99) return void res.end("done");
      res.writeHead(307, { location: n === 4 ? "/99" : `/${n + 1}` });
      res.end();
    });
    const l3 = stubLookup({ "public.test": ["127.0.0.1"] });
    const five = await safeFetch(`http://public.test:${chain.port}/0`, opts({ lookup: l3.lookup }));
    expect(five.ok && five.body.toString()).toBe("done");
    // Every hop is a fresh connection with its own lookup and check (SEC-38).
    expect(l3.calls).toHaveLength(6);

    const loop = await serve((_req, res) => {
      res.writeHead(308, { location: "/again" });
      res.end();
    });
    const six = await safeFetch(`http://public.test:${loop.port}/`, opts({ lookup: l3.lookup }));
    expect(six).toEqual({ ok: false, kind: "too-many-redirects" });
    expect(loop.hits).toHaveLength(6);

    // A redirect without a Location.
    const noLoc = await serve((_req, res) => {
      res.writeHead(302);
      res.end();
    });
    expect(await safeFetch(`http://public.test:${noLoc.port}/`, opts({ lookup: l3.lookup }))).toEqual({
      ok: false,
      kind: "no-location",
    });
  });

  it("SEC-41: stops after timeoutMs; refuses a declared Content-Length over maxBytes; stops reading past maxBytes without a length", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { lookup } = stubLookup({ "public.test": ["127.0.0.1"] });

    // No headers ever.
    const silent = await serve(() => {});
    const started = Date.now();
    expect(await safeFetch(`http://public.test:${silent.port}/`, opts({ lookup, timeoutMs: 200 }))).toEqual({
      ok: false,
      kind: "timeout",
    });
    expect(Date.now() - started).toBeLessThan(2_000);

    // Headers, then a stalled body.
    const stall = await serve((_req, res) => {
      res.writeHead(200);
      res.write("partial");
    });
    expect(await safeFetch(`http://public.test:${stall.port}/`, opts({ lookup, timeoutMs: 200 }))).toEqual({
      ok: false,
      kind: "timeout",
    });

    // Declared too large: refused from the header.
    const declared = await serve((_req, res) => {
      res.writeHead(200, { "content-length": "1000" });
      res.end(Buffer.alloc(1000));
    });
    expect(await safeFetch(`http://public.test:${declared.port}/`, opts({ lookup, maxBytes: 100 }))).toEqual({
      ok: false,
      kind: "too-large",
    });

    // No length: streamed until the count passes maxBytes, then cancelled.
    let wrote = 0;
    const endless = await serve((_req, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(16_384);
      const pump = () => {
        while (wrote < 50_000_000 && res.write(chunk)) wrote += chunk.length;
        if (wrote < 50_000_000) res.once("drain", pump);
        else res.end();
      };
      pump();
    });
    expect(await safeFetch(`http://public.test:${endless.port}/`, opts({ lookup, maxBytes: 100_000 }))).toEqual({
      ok: false,
      kind: "too-large",
    });
    expect(wrote).toBeLessThan(50_000_000);

    // Exactly maxBytes is fine.
    const exact = await serve((_req, res) => res.end(Buffer.alloc(100)));
    const ok = await safeFetch(`http://public.test:${exact.port}/`, opts({ lookup, maxBytes: 100 }));
    expect(ok.ok && ok.body.length).toBe(100);

    // A small compressed body that inflates past maxBytes.
    const bomb = zlib.gzipSync(Buffer.alloc(1_000_000));
    const bomber = await serve((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip", "content-length": String(bomb.length) });
      res.end(bomb);
    });
    expect(bomb.length).toBeLessThan(100_000);
    expect(await safeFetch(`http://public.test:${bomber.port}/`, opts({ lookup, maxBytes: 100_000 }))).toEqual({
      ok: false,
      kind: "too-large",
    });
  });

  it("SEC-42: decodes gzip, deflate and br bodies", async () => {
    const text = "Pannenkoeken met stroop ".repeat(50);
    const encoders: Record<string, (b: Buffer) => Buffer> = {
      gzip: (b) => zlib.gzipSync(b),
      deflate: (b) => zlib.deflateSync(b),
      br: (b) => zlib.brotliCompressSync(b),
    };
    const { lookup } = stubLookup({ "public.test": ["127.0.0.1"] });
    for (const [encoding, encode] of Object.entries(encoders)) {
      const t = await serve((_req, res) => {
        res.writeHead(200, { "content-encoding": encoding });
        res.end(encode(Buffer.from(text)));
      });
      const result = await safeFetch(`http://public.test:${t.port}/`, opts({ lookup }));
      expect(result.ok && result.body.toString()).toBe(text);
    }
  });

  it("SEC-40: failure results carry no address, port or socket text", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // A port with nothing listening.
    const t = await serve((_req, res) => res.end());
    const closedPort = t.port;
    await new Promise<void>((resolve) => servers.pop()?.close(() => resolve()));

    const { lookup } = stubLookup({ "public.test": ["127.0.0.1"] });
    const refused = await safeFetch(`http://public.test:${closedPort}/`, opts({ lookup }));
    expect(refused).toEqual({ ok: false, kind: "network" });
    const text = JSON.stringify(refused);
    expect(text).not.toContain("127.");
    expect(text).not.toContain(String(closedPort));
    expect(text).not.toMatch(/ECONN|socket/i);
    expect(logged).toHaveBeenCalled();

    const unknown = await safeFetch(`http://nowhere.test/`, opts({ lookup }));
    expect(unknown).toEqual({ ok: false, kind: "network" });

    const notFound = await serve((_req, res) => {
      res.statusCode = 404;
      res.end("nope");
    });
    expect(await safeFetch(`http://public.test:${notFound.port}/`, opts({ lookup }))).toEqual({
      ok: false,
      kind: "http",
      status: 404,
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolveClient } from "./clientInfo.js";

const CADDY = "172.20.0.2";

function resolve(peer: string, headers: Record<string, string>, trustedProxies = [CADDY], socketIsTls = false) {
  return resolveClient({ peer, headers: new Headers(headers), trustedProxies, socketIsTls });
}

describe("resolveClient", () => {
  it("SEC-13: takes the client IP from X-Forwarded-For when the peer is the trusted proxy", () => {
    expect(resolve(CADDY, { "x-forwarded-for": "203.0.113.9" }).ip).toBe("203.0.113.9");
  });

  it("SEC-13: takes the rightmost entry, the one the trusted proxy appended", () => {
    expect(resolve(CADDY, { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }).ip).toBe("203.0.113.9");
    expect(resolve(CADDY, { "x-forwarded-for": "6.6.6.6, 203.0.113.9, " }).ip).toBe("203.0.113.9");
  });

  it("SEC-13: uses the trusted peer itself when it sends no X-Forwarded-For", () => {
    expect(resolve(CADDY, {}).ip).toBe(CADDY);
  });

  it("SEC-13: ignores X-Forwarded-For from an untrusted peer", () => {
    expect(resolve("10.0.0.5", { "x-forwarded-for": "203.0.113.9" }).ip).toBe("10.0.0.5");
  });

  it("SEC-13: believes no forwarded header when no trusted proxy is configured", () => {
    expect(resolve(CADDY, { "x-forwarded-for": "203.0.113.9" }, []).ip).toBe(CADDY);
  });

  it("SEC-13: an IPv4-mapped peer matches its IPv4 trusted entry", () => {
    expect(resolve(`::ffff:${CADDY}`, { "x-forwarded-for": "203.0.113.9" }).ip).toBe("203.0.113.9");
  });

  it("SEC-13: reports an IPv4-mapped untrusted peer in its IPv4 form", () => {
    expect(resolve("::ffff:10.0.0.5", {}).ip).toBe("10.0.0.5");
  });

  it("SEC-14: believes X-Forwarded-Proto only from the trusted proxy", () => {
    expect(resolve(CADDY, { "x-forwarded-proto": "https" }).isHttps).toBe(true);
    expect(resolve(CADDY, { "x-forwarded-proto": "http" }).isHttps).toBe(false);
    expect(resolve(CADDY, {}, [CADDY], true).isHttps).toBe(false);
    expect(resolve("10.0.0.5", { "x-forwarded-proto": "https" }).isHttps).toBe(false);
    expect(resolve("10.0.0.5", { "x-forwarded-proto": "http" }, [CADDY], true).isHttps).toBe(true);
  });
});

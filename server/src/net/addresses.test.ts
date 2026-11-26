import { describe, expect, it } from "vitest";
import { checkUrl, isBlockedAddress } from "./addresses";

const blockedRanges: string[] = [
  // IPv4: first, a middle address, last of each range
  "0.0.0.0", "0.1.2.3", "0.255.255.255",
  "10.0.0.0", "10.1.2.3", "10.255.255.255",
  "100.64.0.0", "100.64.0.1", "100.127.255.255",
  "127.0.0.0", "127.0.0.1", "127.255.255.255",
  "169.254.0.0", "169.254.169.254", "169.254.255.255",
  "172.16.0.0", "172.28.0.1", "172.31.255.255",
  "192.0.0.0", "192.0.0.8", "192.0.0.255",
  "192.0.2.0", "192.0.2.1", "192.0.2.255",
  "192.168.0.0", "192.168.1.1", "192.168.255.255",
  "198.18.0.0", "198.19.0.1", "198.19.255.255",
  "198.51.100.0", "198.51.100.7", "198.51.100.255",
  "203.0.113.0", "203.0.113.7", "203.0.113.255",
  "224.0.0.0", "230.1.1.1", "239.255.255.255",
  "240.0.0.0", "250.1.1.1", "255.255.255.255",
  // IPv6
  "::", "::1", "::2", "::ffff:ffff", "0:0:0:0:0:0:ffff:ffff",
  "100::", "100::1", "100::ffff:ffff:ffff:ffff",
  "2001::", "2001::1", "2001:0:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:db8::", "2001:db8::1", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
  "fc00::", "fd00::1", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "fe80::", "fe80::1", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "ff00::", "ff02::1", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
];

describe("isBlockedAddress", () => {
  it.each(blockedRanges)("SEC-31: blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "93.184.215.14",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700::1111",
  ])("SEC-32: allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it.each([
    "::ffff:172.28.0.1",
    "::ffff:ac1c:1",
    "64:ff9b::a00:1",
    "2002:c0a8:101::1",
    "[::1]",
    "nonsense",
    "",
    "fe80::1%eth0",
    "999.1.1.1",
  ])("SEC-33: blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "::ffff:8.8.8.8",
    "::ffff:808:808",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("SEC-33: allows an embedded public IPv4 in %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("checkUrl", () => {
  it.each([
    "http://172.28.0.1:5001/",
    "http://2887516161/",
    "http://0x7f.1/",
    "http://[::ffff:172.28.0.1]:5001/",
    "http://100.64.0.1/",
    "http://[fd00::1]/",
    "http://localhost./",
    "http://localhost/",
    "http://foo.localhost/",
    "http://[::1]/",
  ])("SEC-34: rejects %s", (raw) => {
    expect(checkUrl(raw)).toEqual({ ok: false, error: "This URL cannot be imported" });
  });

  it.each(["ftp://example.com/x", "file:///etc/passwd", "gopher://example.com/"])(
    "SEC-34: rejects non-http(s) scheme %s",
    (raw) => {
      expect(checkUrl(raw)).toEqual({ ok: false, error: "Only http/https URLs are supported" });
    },
  );

  it.each(["not a url", "", "http://"])("SEC-34: rejects %s as not a URL", (raw) => {
    expect(checkUrl(raw)).toEqual({ ok: false, error: "Not a valid URL" });
  });

  it("SEC-34: lets a hostname through — its addresses are checked at connect time instead", () => {
    const r = checkUrl("https://example.com/a.jpg");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.hostname).toBe("example.com");
  });

  it("SEC-34: lets a public IP literal through", () => {
    expect(checkUrl("http://93.184.215.14/").ok).toBe(true);
  });
});

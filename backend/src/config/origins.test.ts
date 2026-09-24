import { describe, expect, it } from "vitest";
import { parseOrigins, parseTrustedProxies } from "./origins";

describe("parseOrigins", () => {
  it("splits a comma-separated list and trims whitespace", () => {
    expect(
      parseOrigins(" https://nosh.itsthomassito.com , http://homelab.tail43ff2b.ts.net:8080 "),
    ).toEqual(["https://nosh.itsthomassito.com", "http://homelab.tail43ff2b.ts.net:8080"]);
  });

  it("strips a trailing slash", () => {
    expect(parseOrigins("https://nosh.itsthomassito.com/")).toEqual([
      "https://nosh.itsthomassito.com",
    ]);
  });

  it("refuses an explicit default port, since browsers never send one", () => {
    expect(() => parseOrigins("https://nosh.itsthomassito.com:443")).toThrow(
      'use "https://nosh.itsthomassito.com"',
    );
  });

  it("refuses a value with a path", () => {
    expect(() => parseOrigins("https://nosh.itsthomassito.com/api")).toThrow(/doesn't match/);
  });

  it("refuses something that isn't a URL", () => {
    expect(() => parseOrigins("nosh.itsthomassito.com")).toThrow(/is not a URL/);
  });

  it("refuses an empty list", () => {
    expect(() => parseOrigins(" , ")).toThrow(/at least one/);
  });
});

describe("parseTrustedProxies", () => {
  it("parses a comma-separated list, and empty means trust none", () => {
    expect(parseTrustedProxies("10.101.0.10, 10.101.0.11")).toEqual(["10.101.0.10", "10.101.0.11"]);
    expect(parseTrustedProxies("")).toEqual([]);
  });
});

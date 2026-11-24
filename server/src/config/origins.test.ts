import { describe, expect, it } from "vitest";
import { ConfigError, parseOrigins } from "./origins.js";

describe("parseOrigins", () => {
  it("SEC-51: splits a comma-separated list, trims whitespace and strips a trailing slash", () => {
    expect(parseOrigins(" https://a.example , http://localhost:5173/ ")).toEqual([
      "https://a.example",
      "http://localhost:5173",
    ]);
  });

  it("SEC-51: refuses an explicit default port and names the correct spelling", () => {
    expect(() => parseOrigins("https://a.example:443")).toThrow(/https:\/\/a\.example\b/);
    expect(() => parseOrigins("https://a.example:443")).toThrow(ConfigError);
  });

  it("SEC-51: refuses a value with a path", () => {
    expect(() => parseOrigins("https://a.example/api")).toThrow(ConfigError);
  });

  it("SEC-51: refuses something that isn't a URL", () => {
    expect(() => parseOrigins("a.example")).toThrow(ConfigError);
  });

  it("SEC-51: refuses an empty list", () => {
    expect(() => parseOrigins("")).toThrow(ConfigError);
    expect(() => parseOrigins(" , ")).toThrow(ConfigError);
  });
});

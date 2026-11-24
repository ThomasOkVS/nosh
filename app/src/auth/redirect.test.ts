import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

// AUTH-16: return to the requested address, but only within this app.
describe("safeRedirect (AUTH-16)", () => {
  it("keeps a same-app path with its query and hash", () => {
    expect(safeRedirect("/recipes/new?importId=5#x")).toBe("/recipes/new?importId=5#x");
  });

  it.each([
    ["//evil.example"],
    ["/\\evil.example"],
    ["https://evil.example"],
    // The URL parser drops tab and newline, which turns these into //evil.example.
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/\r/evil.example"],
    ["/\x00/evil.example"],
    // Decoded once more (by a router, say) this is /\t/evil.example again.
    ["/%09/evil.example"],
    ["/%5C/evil.example"],
    ["/%2F/evil.example"],
    ["/%E0%A4%A"],
    [undefined],
    [42],
    [""],
  ])("falls back to / for %j", (value) => {
    expect(safeRedirect(value)).toBe("/");
  });

  it.each(["/\t/evil.example", "/%09/evil.example", "/%2F%2Fevil.example", "/a/../..//evil.example"])(
    "never leaves this origin for %j",
    (value) => {
      const target = new URL(safeRedirect(value), "https://nosh.example.com");
      expect(target.origin).toBe("https://nosh.example.com");
      expect(target.pathname.startsWith("//")).toBe(false);
    },
  );
});

import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

// AUTH-16: return to the requested address, but only within this app.
describe("safeRedirect (AUTH-16)", () => {
  it("keeps a same-app path with its query and hash", () => {
    expect(safeRedirect("/recipes/new?importId=5#x")).toBe("/recipes/new?importId=5#x");
  });

  it.each([["//evil.example"], ["/\\evil.example"], ["https://evil.example"], [undefined], [42], [""]])(
    "falls back to / for %j",
    (value) => {
      expect(safeRedirect(value)).toBe("/");
    },
  );
});

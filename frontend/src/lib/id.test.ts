import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId } from "./id";

describe("generateId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "native-uuid" });

    expect(generateId()).toBe("native-uuid");
  });

  it("falls back to crypto.getRandomValues in insecure contexts", () => {
    // crypto.randomUUID is undefined outside secure contexts (e.g. plain
    // HTTP), which is the bug this fallback fixes.
    vi.stubGlobal("crypto", {
      randomUUID: undefined,
      getRandomValues: (array: Uint8Array) => {
        array.fill(0xab);
        return array;
      },
    });

    expect(generateId()).toBe("abababab-abab-4bab-abab-abababababab");
  });
});

import { describe, expect, it } from "vitest";
import { easeOut, spring } from "./motion";

// Design §7 (Motion): spring pills stiffness 420 / damping 34, reveal ease
// [0.22, 1, 0.36, 1].
describe("motion constants (design §7)", () => {
  it("spring matches the locked pill spring", () => {
    expect(spring).toEqual({ type: "spring", stiffness: 420, damping: 34 });
  });
  it("easeOut matches the locked reveal curve", () => {
    expect(easeOut).toEqual([0.22, 1, 0.36, 1]);
  });
});

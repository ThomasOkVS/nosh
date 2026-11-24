import { describe, expect, it } from "vitest";
import { appVersion } from "./version";

describe("appVersion", () => {
  it("AUTH-21 shortens a full commit SHA to seven characters", () => {
    const sha = "0bf2e92a1c3d4e5f60718293a4b5c6d7e8f90123";
    expect(appVersion(sha)).toEqual({ short: "0bf2e92", full: sha });
  });

  it("AUTH-21 shows dev without a commit", () => {
    expect(appVersion(undefined)).toEqual({ short: "dev", full: "dev" });
    expect(appVersion("")).toEqual({ short: "dev", full: "dev" });
  });
});

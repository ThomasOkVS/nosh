import { describe, expect, it } from "vitest";
import { V1_ACCOUNT } from "../../test/fixtures/v1-account.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.js";

describe("password", () => {
  it("AUTH-08: a v1 argon2id hash verifies with the right password", async () => {
    expect(await verifyPassword(V1_ACCOUNT.passwordHash, "known-pass")).toBe(true);
  });

  it("AUTH-08: the wrong password is refused", async () => {
    expect(await verifyPassword(V1_ACCOUNT.passwordHash, "wrong-pass")).toBe(false);
  });

  it("a malformed hash is refused, not thrown", async () => {
    await expect(verifyPassword("nope", "x")).resolves.toBe(false);
  });

  it("hashPassword output verifies", async () => {
    const hash = await hashPassword("round-trip");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "round-trip")).toBe(true);
  });

  it("SEC-19: verifyAgainstDummy always refuses", async () => {
    expect(await verifyAgainstDummy("nosh-timing-equalizer")).toBe(false);
  });
});

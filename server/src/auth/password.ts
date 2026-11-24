import { randomBytes } from "node:crypto";
import argon2 from "argon2";

/** argon2id with the library defaults, as v1 hashed (AUTH-08). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/** True when the password matches; false for a wrong password or a malformed hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Computed once, from a random password nobody knows, so an unknown username
// costs the same argon2 verify as a wrong password (SEC-19).
const dummyHash = hashPassword(randomBytes(32).toString("base64url"));

export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(await dummyHash, password);
  return false;
}

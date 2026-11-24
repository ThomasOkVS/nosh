/**
 * An account as the v1 app stored it: `argon2.hash("known-pass")` with the
 * argon2@0.45 defaults (argon2id, m=65536, t=3, p=4). The hash is literal so
 * AUTH-08 proves that a hash made outside this codebase still verifies.
 */
export const V1_ACCOUNT = {
  username: "Owner_1",
  email: "owner@example.com",
  password: "known-pass",
  passwordHash:
    "$argon2id$v=19$m=65536,t=3,p=4$f2Hwi8xq5TrL2MWauAHxyA$11sUHB6Jpw9vu6+/nVtnYp+7oES8O5rIaqBwDT9PDqc",
} as const;

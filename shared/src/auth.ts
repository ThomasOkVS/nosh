import { z } from "zod";

const INVALID = "Invalid request";

/** AUTH-03, AUTH-05: sign-up asks only for a username and a password. */
export const signUpBody = z.object(
  {
    username: z
      .string({ error: "Username is required" })
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(32, "Username must be at most 32 characters")
      .regex(/^[A-Za-z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    password: z.string({ error: "Password is required" }).min(1, "Password is required"),
  },
  { error: INVALID },
);
export type SignUpBody = z.infer<typeof signUpBody>;

/** AUTH-10: login takes any stored username; the sign-up rules do not apply. */
export const logInBody = z.object(
  {
    username: z.string({ error: "Username is required" }).trim().min(1, "Username is required"),
    password: z.string({ error: "Password is required" }).min(1, "Password is required"),
  },
  { error: INVALID },
);
export type LogInBody = z.infer<typeof logInBody>;

/** AUTH-01, AUTH-07, AUTH-13: an account as the API shows it. */
export type AuthUserDto = { id: string; username: string };

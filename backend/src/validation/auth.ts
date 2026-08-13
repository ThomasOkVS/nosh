import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^\w+$/, "Username can only contain letters, numbers, and underscores");

export const signupSchema = z.object({
  email: z.email(),
  username: usernameSchema,
  password: z.string().min(1, "Password is required"),
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

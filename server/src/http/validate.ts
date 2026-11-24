import { validator } from "hono/validator";
import type { z } from "zod";

/**
 * Validates a JSON body against `schema`.
 * - Malformed JSON: Hono's validator throws HTTPException(400), which onError
 *   answers with a fixed "Invalid request" that never quotes the body (SEC-26).
 * - A schema failure: 400 with the first issue's message (AUTH-03, AUTH-10).
 * A body without a JSON content type is validated as `{}`.
 */
export function jsonBody<T extends z.ZodType>(schema: T) {
  return validator("json", (value, c) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
    }
    return result.data as z.output<T>;
  });
}

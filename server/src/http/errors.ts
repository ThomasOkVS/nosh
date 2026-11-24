import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { rawPath } from "./requestLog.js";

/** SEC-27: the body-limit middleware answers with this. */
export function bodyTooLarge(c: Context): Response {
  return c.json({ error: "Request body too large" }, 413);
}

/**
 * SEC-26, SEC-27, SEC-29: every error answers with a fixed message. Never
 * echo `err.message`: a JSON.parse error quotes the body it failed on.
 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException && err.status === 413) return bodyTooLarge(c);
  if (err instanceof HTTPException && err.status >= 400 && err.status < 500) {
    return c.json({ error: "Invalid request" }, err.status);
  }
  // c.req.json() throws a bare SyntaxError on a malformed body.
  if (err instanceof SyntaxError) return c.json({ error: "Invalid request" }, 400);

  // One JSON line: the error text may quote request data, and JSON escapes
  // any CR/LF in it, so nobody can forge log lines through an error.
  console.error(
    JSON.stringify({
      level: "error",
      method: c.req.method,
      path: rawPath(c),
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    }),
  );
  return c.json({ error: "Internal server error" }, 500);
};

/** SEC-28 */
export const notFound: NotFoundHandler = (c) => c.json({ error: "Not found" }, 404);

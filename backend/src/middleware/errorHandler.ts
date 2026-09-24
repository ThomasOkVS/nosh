import type { NextFunction, Request, Response } from "express";

/** Express's default 404 is an HTML page naming the framework; this keeps
 * unknown routes on the same JSON shape as every other error. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

function clientErrorStatus(err: unknown): number | null {
  // body-parser (behind express.json()) marks its own errors — malformed
  // JSON, a body over the size limit — with a 4xx `status`. Those are the
  // client's fault and deserve a 4xx, not a 500.
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = clientErrorStatus(err);
  if (status !== null) {
    // A fixed message, not err.message: parser messages quote the body back.
    res.status(status).json({ error: status === 413 ? "Request body too large" : "Invalid request" });
    return;
  }
  // Details go to the log only — never a stack trace or file path in a response.
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

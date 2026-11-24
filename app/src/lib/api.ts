import type { AppType } from "@nosh/server";
import { hc } from "hono/client";

/** Typed client for the same-origin API (the server's routes are the types). */
export const api = hc<AppType>("/");

export const GENERIC_ERROR = "Something went wrong";

/** A non-2xx answer, carrying the server's own message when it sent one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Builds the ApiError for a failed response. The body may not be JSON (a proxy page, say). */
export async function toApiError(res: { status: number; json(): Promise<unknown> }) {
  let message = GENERIC_ERROR;
  try {
    const body = await res.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body;
      if (typeof error === "string" && error !== "") message = error;
    }
  } catch {
    // keep the generic message
  }
  return new ApiError(message, res.status);
}

/** The message to show the owner for any failure: the server's, or the generic one. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

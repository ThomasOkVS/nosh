import { ApiError, apiUrl } from "./client";
import type { RecipeInput } from "./types";

/** Mirrors `ImportStage` in the backend's recipeExtraction service. */
export type ImportStage = "fetching" | "structured-data" | "ai";

interface ImportMessage {
  type?: unknown;
  stage?: unknown;
  recipe?: unknown;
  status?: unknown;
  error?: unknown;
}

/**
 * Returns extracted-but-unsaved recipe data for the create form to pre-fill;
 * nothing is persisted until the user submits that form.
 *
 * Unlike the other API calls this one doesn't go through `apiFetch`: the
 * endpoint streams newline-delimited JSON so it can report progress while it
 * works (see backend/src/routes/import.ts). `onStage` fires as each phase
 * starts, which is what lets the UI distinguish "reading the page's own
 * recipe data" from "waiting on the AI".
 */
export async function importRecipeFromUrl(
  url: string,
  onStage?: (stage: ImportStage) => void,
  signal?: AbortSignal,
): Promise<RecipeInput> {
  const response = await fetch(apiUrl("/import"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });

  // Rejected before streaming began (bad body, no session) — still a plain
  // JSON error response with a real status.
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => undefined);
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }
  if (!response.body) {
    throw new ApiError(response.status, "The server returned an empty response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RecipeInput | null = null;

  const handle = (line: string): void => {
    if (!line.trim()) return;
    let message: ImportMessage;
    try {
      message = JSON.parse(line) as ImportMessage;
    } catch {
      // A malformed line shouldn't abort an otherwise healthy import.
      return;
    }
    switch (message.type) {
      case "progress":
        if (typeof message.stage === "string") onStage?.(message.stage as ImportStage);
        break;
      case "result":
        result = message.recipe as RecipeInput;
        break;
      case "error":
        throw new ApiError(
          typeof message.status === "number" ? message.status : 500,
          typeof message.error === "string" && message.error ? message.error : "Import failed",
        );
      default:
        // Unknown message types are ignored on purpose, so adding something
        // like a keepalive line server-side can't break older clients.
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` keeps a multi-byte character that straddles two
      // chunks intact across calls.
      buffer += decoder.decode(value, { stream: true });
      // A chunk can also split mid-line, so only whole lines are parsed;
      // whatever follows the last newline stays buffered for the next chunk.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    buffer += decoder.decode();
    handle(buffer);
  } finally {
    // `cancel()` alone doesn't synchronously release the lock on the body —
    // `releaseLock()` is what callers (and `response.body.locked`) actually
    // observe. Runs whether the stream finished normally, an in-band error
    // threw out of `handle`, or the caller aborted; without it the body stays
    // locked and the connection held.
    reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (result === null) {
    throw new ApiError(500, "Import ended without returning a recipe");
  }
  return result;
}

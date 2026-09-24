import { Router } from "express";
import type { Pool } from "pg";
import { resolveImportModel, type MagicImportConfig } from "../config/llmModels";
import type { GeminiExtractFn, GeminiVideoExtractFn } from "../llm/geminiClient";
import { createRateLimiter, limitPerUser } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";
import { findImportModel } from "../repositories/users";
import {
  DownloaderUnavailableError,
  ExtractionError,
  ExtractionUnavailableError,
  extractRecipeFromUrl,
  FetchError,
  InvalidUrlError,
  NotConfiguredError,
  VideoTooLargeError,
  VideoUnavailableError,
  validateUrl,
} from "../services/recipeExtraction";
import type { SocialVideoDownloadFn } from "../services/socialVideo";
import { importRequestSchema } from "../validation/import";

function statusForError(err: unknown): number {
  if (err instanceof InvalidUrlError) return 400;
  if (err instanceof FetchError) return 502;
  if (err instanceof VideoUnavailableError) return 502;
  if (err instanceof VideoTooLargeError) return 422;
  // Checked before ExtractionError, which it extends.
  if (err instanceof ExtractionUnavailableError) return 503;
  if (err instanceof ExtractionError) return 422;
  if (err instanceof NotConfiguredError) return 503;
  if (err instanceof DownloaderUnavailableError) return 503;
  return 500;
}

export interface ImportRouterDeps {
  pool: Pool;
  magicImport: MagicImportConfig;
  geminiExtract?: GeminiExtractFn;
  geminiVideoExtract?: GeminiVideoExtractFn;
  downloadSocialVideo?: SocialVideoDownloadFn;
  fetchImpl?: typeof fetch;
}

/**
 * The only DB work here is reading the user's model preference — the import
 * itself just extracts and returns a `RecipeInput` for the frontend to
 * pre-fill; persisting it happens through the normal recipe create/update
 * routes. (Usage counting happens inside the Gemini client's `onUsage`
 * hook, wired up in index.ts.)
 */
export function createImportRouter(deps: ImportRouterDeps): Router {
  const { pool, magicImport, geminiExtract, geminiVideoExtract, downloadSocialVideo, fetchImpl } = deps;
  const router = Router();
  router.use(requireAuth);
  // Every import can spend a paid (or quota-limited) Gemini call and makes
  // the server fetch a URL, so it's capped per user, not just gated on login.
  router.use(limitPerUser(createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30 })));

  /**
   * Responds with newline-delimited JSON rather than a single object: import
   * can take anywhere from under a second (the page publishes structured
   * recipe data) to a minute or so (a Reels/TikTok video has to be
   * downloaded and read by the model), and the client can only tell the user
   * which is happening if the server says so as it goes.
   *
   * Message shapes, one JSON object per line:
   *   {"type":"progress","stage":"fetching"|"structured-data"|"downloading-video"|"analyzing-video"|"ai"}
   *   {"type":"result","recipe":{…},"imageUrl":"…"|null}
   *   {"type":"error","status":502,"error":"…"}
   *
   * Failures after the first byte is sent are reported in-band with the
   * status they *would* have had, since the HTTP status is already committed
   * by then. A malformed request body is rejected before streaming starts and
   * so is still a real 400.
   */
  router.post("/", async (req, res) => {
    const parsed = importRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    // Also checked inside extractRecipeFromUrl, but by then the 200 is
    // already sent — a URL that's refused outright gets a real 400 instead.
    try {
      validateUrl(parsed.data.url);
    } catch (err) {
      res.status(400).json({ error: err instanceof InvalidUrlError ? err.message : "Not a valid URL" });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-store");
    // Without this, Express buffers the headers until the first flush, so the
    // client wouldn't see early progress lines until the whole request ends.
    res.flushHeaders();

    // Backpressure is ignored deliberately: these are a handful of sub-1KB
    // lines, so the socket buffer will never fill. The writableEnded guard is
    // what matters — writing to a response the client already dropped throws.
    const send = (message: unknown): void => {
      if (!res.writableEnded) res.write(`${JSON.stringify(message)}\n`);
    };

    // Lets a client that navigates away stop the work rather than leaving it
    // to finish into a dead socket — the LLM call in particular costs quota.
    const clientGone = new AbortController();
    req.on("close", () => clientGone.abort());

    try {
      const model = resolveImportModel(magicImport, await findImportModel(pool, req.session.userId ?? 0));
      const { recipe, imageUrl } = await extractRecipeFromUrl(parsed.data.url, {
        model,
        geminiExtract,
        geminiVideoExtract,
        downloadSocialVideo,
        fetchImpl,
        signal: clientGone.signal,
        onProgress: (stage) => send({ type: "progress", stage }),
      });
      send({ type: "result", recipe, imageUrl });
    } catch (err) {
      if (clientGone.signal.aborted) return;
      const status = statusForError(err);
      if (status === 500) {
        // Past the point where the shared errorHandler can take over.
        console.error("Unexpected import failure:", err);
      }
      send({
        type: "error",
        status,
        error:
          status === 500 || !(err instanceof Error) ? "Something went wrong" : err.message,
      });
    } finally {
      res.end();
    }
  });

  return router;
}

import type { Pool } from "pg";
import {
  appendImportJobStage,
  cancelImportJob,
  completeImportJob,
  createImportJob,
  failImportJob,
  type ImportJob,
} from "../repositories/importJobs";
import type { ImportFinishedNotifier } from "./pushNotifier";
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
  type ExtractDeps,
} from "./recipeExtraction";

/** The HTTP status each failure would map to — kept on the job so the
 * frontend can word errors by kind (bad URL vs. site blocked vs. no AI). */
export function statusForError(err: unknown): number {
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

export type ImportJobRunnerDeps = Pick<
  ExtractDeps,
  "geminiExtract" | "geminiVideoExtract" | "downloadSocialVideo" | "fetchImpl"
> & {
  /** Unset when push isn't configured (no VAPID keys) — the job still
   * finishes and is saved; the user just isn't pinged about it. */
  notify?: ImportFinishedNotifier;
};

export interface ImportJobRunner {
  /** Saves a new `running` job and returns it immediately; the extraction
   * carries on in the background, independent of any HTTP request. */
  start(userId: number, url: string): Promise<ImportJob>;
  cancel(userId: number, id: number): Promise<boolean>;
  /** Resolves once every in-flight job has settled. Only tests need this —
   * the app itself never waits on a job. */
  idle(): Promise<void>;
}

/**
 * Runs imports in-process, fire-and-forget: `start` kicks off the async
 * extraction without awaiting it, and the job's row is the only thing the
 * rest of the app ever reads. The Java equivalent is an `@Async` method or
 * `executor.submit(...)` writing its result to a table — deliberately not a
 * separate queue (Redis/BullMQ): one user importing a recipe now and then
 * doesn't justify another service to run. The price is that a restart kills
 * in-flight jobs, which `recoverImportJobs` cleans up at boot.
 */
export function createImportJobRunner(pool: Pool, deps: ImportJobRunnerDeps): ImportJobRunner {
  const { notify, ...extractDeps } = deps;
  // Held in memory, not the DB: an AbortController can't be persisted, and
  // it only needs to live as long as this process runs the job anyway.
  const inFlight = new Map<number, { controller: AbortController; done: Promise<void> }>();

  async function run(job: ImportJob, controller: AbortController): Promise<void> {
    let finished: ImportJob | null;
    // `onProgress` is synchronous, so stage writes are chained rather than
    // awaited — and the chain is drained before the final write, otherwise
    // a stage UPDATE on another pooled connection could land after the job
    // is already `done` (and be dropped by its `status = 'running'` guard).
    let stageWrites = Promise.resolve();
    try {
      const { recipe, imageUrl } = await extractRecipeFromUrl(job.url, {
        ...extractDeps,
        signal: controller.signal,
        onProgress: (stage) => {
          stageWrites = stageWrites
            .then(() => appendImportJobStage(pool, job.id, stage))
            .catch((err: unknown) => console.warn("Couldn't record import stage:", err));
        },
      });
      await stageWrites;
      finished = await completeImportJob(pool, job.id, recipe, imageUrl);
    } catch (err) {
      await stageWrites;
      if (controller.signal.aborted) return;
      const status = statusForError(err);
      if (status === 500) console.error("Unexpected import failure:", err);
      const message = status === 500 || !(err instanceof Error) ? "Something went wrong" : err.message;
      finished = await failImportJob(pool, job.id, status, message);
    }
    // Null when the job was cancelled in the meantime — nothing to announce.
    if (finished && notify) await notify(finished);
  }

  return {
    async start(userId, url) {
      const job = await createImportJob(pool, userId, url);
      const controller = new AbortController();
      const done = run(job, controller)
        .catch((err: unknown) => console.error("Import job crashed:", err))
        .finally(() => inFlight.delete(job.id));
      inFlight.set(job.id, { controller, done });
      return job;
    },

    async cancel(userId, id) {
      const cancelled = await cancelImportJob(pool, userId, id);
      if (cancelled) inFlight.get(id)?.controller.abort();
      return cancelled;
    },

    async idle() {
      await Promise.all([...inFlight.values()].map((entry) => entry.done));
    },
  };
}

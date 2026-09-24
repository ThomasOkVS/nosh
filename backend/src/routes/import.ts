import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { resolveImportModel, type MagicImportConfig } from "../config/llmModels";
import { requireAuth } from "../middleware/requireAuth";
import { findCollectionOwnerId } from "../repositories/collections";
import { findImportJob, listPendingImportJobs, markImportJobReviewed } from "../repositories/importJobs";
import { findImportModel } from "../repositories/users";
import type { ImportJobRunner } from "../services/importJobs";
import { importRequestSchema } from "../validation/import";

const idParamSchema = z.coerce.number().int().positive();

export interface ImportRouterDeps {
  pool: Pool;
  magicImport: MagicImportConfig;
  runner: ImportJobRunner;
}

/**
 * Imports are server-side jobs, not a request/response pair: `POST /` saves
 * a job and answers 202 straight away, the extraction runs in the
 * background (see services/importJobs.ts), and the client polls `GET /:id`
 * for progress. That's what lets the user close the app mid-import — the
 * work no longer depends on the connection staying open. See
 * docs/decisions.md for why this replaced the earlier NDJSON stream.
 */
export function createImportRouter(deps: ImportRouterDeps): Router {
  const { pool, magicImport, runner } = deps;
  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req, res, next) => {
    const userId = req.session.userId!;
    const parsed = importRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    try {
      const { url, collectionId } = parsed.data;
      // Same ownership check as creating a recipe in a folder — checked
      // up front so the job never records someone else's folder.
      if (collectionId !== null && (await findCollectionOwnerId(pool, collectionId)) !== userId) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      // Resolved now, at request time, so the job uses whatever model the
      // user had picked when they started it.
      const model = resolveImportModel(magicImport, await findImportModel(pool, userId));
      const job = await runner.start(userId, url, { model, collectionId });
      res.status(202).json(job);
    } catch (err) {
      next(err);
    }
  });

  /** Running jobs and finished-but-unreviewed ones — what the app restores
   * on launch so a result that finished while it was closed isn't lost. */
  router.get("/", async (req, res, next) => {
    try {
      res.json(await listPendingImportJobs(pool, req.session.userId!));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Import not found" });
      return;
    }
    try {
      const job = await findImportJob(pool, req.session.userId!, id.data);
      if (!job) {
        res.status(404).json({ error: "Import not found" });
        return;
      }
      // Polled while running — never let an intermediary serve a stale one.
      res.setHeader("Cache-Control", "no-store");
      res.json(job);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/cancel", async (req, res, next) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Import not found" });
      return;
    }
    try {
      // Cancelling a job that already finished is a no-op, not an error:
      // the race between "user taps cancel" and "job completes" is normal.
      await runner.cancel(req.session.userId!, id.data);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  /** The user saved (or dismissed) the result — stop offering it on launch. */
  router.post("/:id/reviewed", async (req, res, next) => {
    const id = idParamSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Import not found" });
      return;
    }
    try {
      const found = await markImportJobReviewed(pool, req.session.userId!, id.data);
      res.status(found ? 204 : 404).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

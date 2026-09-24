import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { resolveImportModel, type MagicImportConfig } from "../config/llmModels";
import { requireAuth } from "../middleware/requireAuth";
import { listTodaysLlmUsage } from "../repositories/llmUsage";
import { findImportModel, setImportModel } from "../repositories/users";

const updateMagicImportSchema = z.object({
  // null = automatic (each import path uses its own default model).
  model: z.string().nullable(),
});

export interface SettingsRouterDeps {
  pool: Pool;
  magicImport: MagicImportConfig;
  /** False with no GEMINI_API_KEY — the page says so instead of offering a
   * choice that can't take effect. */
  aiConfigured: boolean;
}

export function createSettingsRouter(deps: SettingsRouterDeps): Router {
  const { pool, magicImport, aiConfigured } = deps;
  const router = Router();
  router.use(requireAuth);

  async function magicImportResponse(userId: number) {
    const [saved, usage] = await Promise.all([
      findImportModel(pool, userId),
      listTodaysLlmUsage(pool),
    ]);
    const usageByModel = new Map(usage.map((row) => [row.model, row]));
    return {
      aiConfigured,
      selectedModel: resolveImportModel(magicImport, saved) ?? null,
      defaultTextModel: magicImport.defaultTextModel,
      defaultVideoModel: magicImport.defaultVideoModel,
      models: magicImport.models.map((model) => {
        const today = usageByModel.get(model.id);
        return {
          id: model.id,
          dailyRequestLimit: model.dailyRequestLimit,
          requestsToday: today?.requests ?? 0,
          promptTokensToday: today?.promptTokens ?? 0,
          outputTokensToday: today?.outputTokens ?? 0,
        };
      }),
    };
  }

  router.get("/magic-import", async (req, res, next) => {
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    try {
      res.json(await magicImportResponse(userId));
    } catch (err) {
      next(err);
    }
  });

  router.put("/magic-import", async (req, res, next) => {
    const parsed = updateMagicImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const userId = req.session.userId;
    if (userId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const { model } = parsed.data;
    // Checked against the allowlist here, at write time, as well as when an
    // import reads it back — the id ends up in Gemini's request URL.
    if (model !== null && !magicImport.models.some((option) => option.id === model)) {
      res.status(400).json({ error: "That model isn't available" });
      return;
    }
    try {
      await setImportModel(pool, userId, model);
      res.json(await magicImportResponse(userId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

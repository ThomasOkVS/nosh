import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import { createApp, type AppDeps } from "../app";
import type { MagicImportConfig } from "../config/llmModels";
import { getTestPool } from "./db";

export const TEST_MAGIC_IMPORT: MagicImportConfig = {
  models: [
    { id: "text-model", dailyRequestLimit: 20 },
    { id: "video-model", dailyRequestLimit: 500 },
    { id: "other-model", dailyRequestLimit: null },
  ],
  defaultTextModel: "text-model",
  defaultVideoModel: "video-model",
};

export function createTestApp(
  overrides: Partial<
    Pick<
      AppDeps,
      | "geminiExtract"
      | "geminiVideoExtract"
      | "downloadSocialVideo"
      | "fetchImpl"
      | "magicImport"
      | "vapidPublicKey"
      | "sendPush"
    >
  > = {},
): Express {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nosh-uploads-"));
  return createApp({
    pool: getTestPool(),
    sessionSecret: "test-secret",
    uploadsDir,
    magicImport: TEST_MAGIC_IMPORT,
    ...overrides,
  });
}

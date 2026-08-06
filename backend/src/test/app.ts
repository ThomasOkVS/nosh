import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import { createApp } from "../app";
import { getTestPool } from "./db";

export function createTestApp(): Express {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nosh-uploads-"));
  return createApp({
    pool: getTestPool(),
    sessionSecret: "test-secret",
    uploadsDir,
  });
}

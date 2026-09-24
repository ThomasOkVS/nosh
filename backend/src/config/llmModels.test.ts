import { describe, expect, it } from "vitest";
import { parseModelAllowlist, resolveImportModel, type MagicImportConfig } from "./llmModels";

describe("resolveImportModel", () => {
  const config: MagicImportConfig = {
    models: [{ id: "a-model", dailyRequestLimit: null }],
    defaultTextModel: "a-model",
    defaultVideoModel: "a-model",
  };

  it("returns a saved model that's still allowed", () => {
    expect(resolveImportModel(config, "a-model")).toBe("a-model");
  });

  it("falls back to automatic for no preference or one no longer allowed", () => {
    expect(resolveImportModel(config, null)).toBeUndefined();
    expect(resolveImportModel(config, "removed-model")).toBeUndefined();
  });
});

describe("parseModelAllowlist", () => {
  it("parses ids with and without a daily limit", () => {
    expect(parseModelAllowlist("a-model=20, b.model-lite=500 ,c-model", [])).toEqual([
      { id: "a-model", dailyRequestLimit: 20 },
      { id: "b.model-lite", dailyRequestLimit: 500 },
      { id: "c-model", dailyRequestLimit: null },
    ]);
  });

  it("always includes the per-path default models", () => {
    expect(parseModelAllowlist("a-model=20", ["a-model", "video-model"])).toEqual([
      { id: "a-model", dailyRequestLimit: 20 },
      { id: "video-model", dailyRequestLimit: null },
    ]);
  });

  it("ignores empty entries and duplicates", () => {
    expect(parseModelAllowlist(",a-model=5,,a-model=9,", [])).toEqual([
      { id: "a-model", dailyRequestLimit: 5 },
    ]);
  });

  it("rejects ids that could change the request path", () => {
    expect(() => parseModelAllowlist("../evil", [])).toThrow(/invalid model id/);
    expect(() => parseModelAllowlist("model:generateContent?x", [])).toThrow(/invalid model id/);
  });

  it("rejects a non-positive or non-integer limit", () => {
    expect(() => parseModelAllowlist("a-model=0", [])).toThrow(/invalid daily limit/);
    expect(() => parseModelAllowlist("a-model=lots", [])).toThrow(/invalid daily limit/);
  });
});

import { describe, expect, it } from "vitest";
import type { Collection } from "../api/types";
import {
  collectionBreadcrumb,
  collectionPathLabel,
  collectionSubtreeIds,
  flattenCollectionTree,
  isLibraryPath,
  libraryPath,
} from "./collectionTree";

function c(id: number, name: string, parentId: number | null): Collection {
  return { id, name, parentId, createdAt: "2026-01-01T00:00:00Z", recipeCount: 0 };
}

// Baking > Cookies > Holiday, plus a separate top-level Soups.
const tree = [c(3, "Holiday", 2), c(1, "Baking", null), c(4, "Soups", null), c(2, "Cookies", 1)];

describe("collectionTree", () => {
  it("flattens depth-first with depths, regardless of input order", () => {
    expect(flattenCollectionTree(tree)).toEqual([
      { id: 1, name: "Baking", depth: 0 },
      { id: 2, name: "Cookies", depth: 1 },
      { id: 3, name: "Holiday", depth: 2 },
      { id: 4, name: "Soups", depth: 0 },
    ]);
  });

  it("collects a collection's whole subtree, including itself", () => {
    expect([...collectionSubtreeIds(tree, 1)].sort()).toEqual([1, 2, 3]);
    expect([...collectionSubtreeIds(tree, 4)]).toEqual([4]);
  });

  it("builds a root-first breadcrumb, empty for Home", () => {
    expect(collectionBreadcrumb(tree, 3).map((x) => x.name)).toEqual([
      "Baking",
      "Cookies",
      "Holiday",
    ]);
    expect(collectionBreadcrumb(tree, null)).toEqual([]);
  });

  it("labels a location as a plain-text path starting at Home", () => {
    expect(collectionPathLabel(tree, 3)).toBe("Home / Baking / Cookies / Holiday");
    expect(collectionPathLabel(tree, null)).toBe("Home");
  });

  it("maps folders to library URLs and recognizes them", () => {
    expect(libraryPath(null)).toBe("/");
    expect(libraryPath(2)).toBe("/collections/2");
    expect(isLibraryPath("/")).toBe(true);
    expect(isLibraryPath("/collections/2")).toBe(true);
    expect(isLibraryPath("/meal-plan")).toBe(false);
    expect(isLibraryPath("/recipes/5")).toBe(false);
  });
});

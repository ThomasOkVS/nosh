import type { Collection } from "../api/types";

export interface CollectionOption {
  id: number;
  name: string;
  depth: number;
}

function groupByParent(collections: Collection[]): Map<number | null, Collection[]> {
  const byParent = new Map<number | null, Collection[]>();
  for (const collection of collections) {
    const siblings = byParent.get(collection.parentId) ?? [];
    siblings.push(collection);
    byParent.set(collection.parentId, siblings);
  }
  return byParent;
}

/** Flattens the collections list (as returned by the API, unordered with
 * respect to hierarchy) into a depth-first, indentable order — used to
 * render the whole tree as a single `<select>`'s options. */
export function flattenCollectionTree(collections: Collection[]): CollectionOption[] {
  const byParent = groupByParent(collections);
  const result: CollectionOption[] = [];

  function visit(parentId: number | null, depth: number) {
    for (const child of byParent.get(parentId) ?? []) {
      result.push({ id: child.id, name: child.name, depth });
      visit(child.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

/** Every collection id in `id`'s subtree, including `id` itself — used to
 * keep a "move" picker from offering a destination that would move a
 * collection inside its own contents (the backend rejects this too; this is
 * just so the UI doesn't offer it in the first place). */
export function collectionSubtreeIds(collections: Collection[], id: number): Set<number> {
  const byParent = groupByParent(collections);
  const ids = new Set<number>([id]);

  function visit(parentId: number) {
    for (const child of byParent.get(parentId) ?? []) {
      ids.add(child.id);
      visit(child.id);
    }
  }
  visit(id);
  return ids;
}

/** Walks parentId links from `id` up to the root, root-first — used for
 * breadcrumbs ("Home / Baking / Cookies"). */
export function collectionBreadcrumb(collections: Collection[], id: number | null): Collection[] {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const trail: Collection[] = [];
  let current = id !== null ? byId.get(id) : undefined;
  while (current) {
    trail.unshift(current);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }
  return trail;
}

/** Is this pathname a library folder view (`/` or `/collections/:id`)? */
export function isLibraryPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/collections/");
}

/** The library URL for a folder — Home (`null`) is `/`, every collection is
 * `/collections/:id`. */
export function libraryPath(collectionId: number | null): string {
  return collectionId === null ? "/" : `/collections/${collectionId}`;
}

/** Plain-text trail ("Home / Baking / Cookies") — for places that can't
 * contain links, e.g. a caption inside a `RecipeCard`, which is itself one
 * big link. */
export function collectionPathLabel(collections: Collection[], collectionId: number | null): string {
  return ["Home", ...collectionBreadcrumb(collections, collectionId).map((c) => c.name)].join(" / ");
}

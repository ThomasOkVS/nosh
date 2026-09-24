import { Link } from "react-router-dom";
import type { Collection } from "../api/types";
import type { DropTargetProps, FolderTarget } from "../hooks/useRecipeDropTargets";
import { collectionBreadcrumb, libraryPath } from "../lib/collectionTree";

interface CollectionBreadcrumbProps {
  collections: Collection[];
  /** The folder the trail ends at — `null` for Home. */
  collectionId: number | null;
  /** When given, every crumb *except the last* becomes a recipe drop
   * target (dropping onto the folder you're already in is meaningless). */
  dropTargets?: {
    dropTargetProps: (target: FolderTarget) => DropTargetProps;
    isActive: (target: FolderTarget) => boolean;
  };
  className?: string;
}

/** "Home / Baking / Cookies" — every crumb links to that folder. */
export function CollectionBreadcrumb({
  collections,
  collectionId,
  dropTargets,
  className = "",
}: Readonly<CollectionBreadcrumbProps>) {
  const crumbs: { target: FolderTarget; name: string }[] = [
    { target: null, name: "Home" },
    ...collectionBreadcrumb(collections, collectionId).map((c) => ({ target: c.id, name: c.name })),
  ];

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center gap-1.5 text-sm ${className}`}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const dropProps = dropTargets && !isLast ? dropTargets.dropTargetProps(crumb.target) : {};
        const active = dropTargets && !isLast && dropTargets.isActive(crumb.target);
        return (
          <span key={crumb.target ?? "home"} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink-faint">
                /
              </span>
            )}
            <Link
              to={libraryPath(crumb.target)}
              aria-current={isLast ? "page" : undefined}
              {...dropProps}
              className={`-mx-1 rounded-sm px-1 transition-colors duration-standard ease-standard hover:text-sauce-600 ${
                active
                  ? "bg-sauce-50 text-sauce-600 ring-1 ring-sauce-500 dark:bg-sauce-500/10"
                  : ""
              }`}
            >
              {crumb.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

import type { Collection } from "../api/types";
import { flattenCollectionTree } from "../lib/collectionTree";
import { inputClass } from "../styles";

interface CollectionSelectProps {
  id: string;
  collections: Collection[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Ids to leave out of the option list — used by the "move to a different
   * collection" pickers so a collection (and everything nested inside it)
   * can never be offered as its own new home or parent. */
  excludeIds?: ReadonlySet<number>;
  /** Rendered as the first, unselected option; picking it calls
   * `onChange(null)` — in practice always "Home (top level)", since `null`
   * means Home everywhere a collection is chosen. */
  placeholderLabel?: string;
  className?: string;
}

/** A single `<select>` listing every collection as one flat, indented list —
 * built from the same flat API response the folder-browser view already
 * fetches, just walked depth-first instead of grouped by parent. Indentation
 * matters here specifically because two different branches can share a name
 * (e.g. two "Desserts" folders), so a flat alphabetical list would be
 * ambiguous about which one is which. */
export function CollectionSelect({
  id,
  collections,
  value,
  onChange,
  excludeIds,
  placeholderLabel,
  className,
}: Readonly<CollectionSelectProps>) {
  const options = flattenCollectionTree(collections).filter((option) => !excludeIds?.has(option.id));

  return (
    <select
      id={id}
      name={id}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      className={className ?? inputClass}
    >
      {placeholderLabel && <option value="">{placeholderLabel}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {"—".repeat(option.depth)} {option.name}
        </option>
      ))}
    </select>
  );
}

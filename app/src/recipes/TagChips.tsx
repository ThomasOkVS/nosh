import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

interface TagChipsProps {
  /** The owner's tags, already de-duplicated and in display order. */
  tags: string[];
  /** The chosen tag, normalised; undefined means "all". */
  active: string | undefined;
}

/**
 * REC-10, design §6.4: "all" first, then the owner's own tags. The active chip
 * is the ink pill, which springs from chip to chip.
 */
export function TagChips({ tags, active }: TagChipsProps) {
  const chips: { label: string; tag: string | undefined }[] = [
    { label: "all", tag: undefined },
    ...tags.map((tag) => ({ label: tag, tag })),
  ];
  return (
    <nav aria-label="Tags" className="-mb-2 overflow-x-auto pb-2 [scrollbar-width:none]">
      <ul className="flex w-max gap-2 px-5">
        {chips.map(({ label, tag }) => {
          const isActive = tag === active;
          return (
            <li key={label}>
              <Link
                to="/"
                search={tag === undefined ? {} : { tag }}
                // Exact search: by default "all" ({}) would count as part of any filter.
                activeOptions={{ exact: true, includeSearch: true }}
                className={`relative block rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring ${
                  isActive
                    ? "border-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="tag-chip-pill"
                    transition={spring}
                    className="absolute -inset-px rounded-full bg-primary"
                  />
                )}
                <span className="relative">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

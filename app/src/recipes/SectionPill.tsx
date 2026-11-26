import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";
import { spring } from "@/lib/motion";

export interface Section<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
}

interface SectionPillProps<Id extends string> {
  sections: Section<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  /** Prefix for the tab and panel ids; the page's panels use `${idBase}-panel-${id}`. */
  idBase: string;
}

export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const panelId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

const floatShadow = "shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]";

/**
 * Design §7 (style log rounds 3 and 7): the recipe page's floating bottom
 * switch in the app nav's style, icon + label, with the ink pill springing
 * between sections. It takes the app nav's slot, which the page hides.
 * ARIA tabs: arrow keys, Home and End move between sections.
 */
export function SectionPill<Id extends string>({
  sections,
  active,
  onChange,
  idBase,
}: SectionPillProps<Id>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = sections.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % sections.length
        : event.key === "ArrowLeft"
          ? (index - 1 + sections.length) % sections.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(sections[next]!.id);
    tabs.current[next]?.focus();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="tablist"
        aria-label="Recipe sections"
        className={`pointer-events-auto flex gap-1 rounded-full border bg-card/95 p-1.5 backdrop-blur ${floatShadow}`}
      >
        {sections.map(({ id, label, icon: Icon }, index) => {
          const selected = id === active;
          return (
            <button
              key={id}
              ref={(el) => {
                tabs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={tabId(idBase, id)}
              aria-selected={selected}
              // Only the active section's panel is rendered.
              aria-controls={selected ? panelId(idBase, id) : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`relative flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring ${
                selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {selected && (
                <motion.span
                  layoutId="recipe-section-pill"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-primary"
                />
              )}
              <Icon aria-hidden className="relative size-4" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

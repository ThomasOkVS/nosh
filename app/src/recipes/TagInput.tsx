import { normaliseTag, RECIPE_LIMITS, RECIPE_MESSAGES } from "@nosh/shared";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState, type KeyboardEvent } from "react";
import { spring } from "@/lib/motion";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** The field's accessible name; "Tags" by default. */
  label?: string;
  className?: string;
}

/**
 * REC-35: tags as removable chips. Enter, a comma or leaving the field adds
 * the typed tag trimmed and lower-cased; blanks and tags already there (in any
 * case) are ignored; Backspace in an empty field removes the last chip; at 30
 * tags nothing more is added.
 */
export function TagInput({ value, onChange, label = "Tags", className }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const hintId = useId();
  const full = value.length >= RECIPE_LIMITS.tags;

  /** Adds each entry it can to `tags`; returns the new list. */
  function add(tags: string[], entries: string[]): string[] {
    const next = [...tags];
    for (const entry of entries) {
      const tag = normaliseTag(entry);
      if (tag === "" || next.length >= RECIPE_LIMITS.tags) continue;
      if (next.some((existing) => normaliseTag(existing) === tag)) continue;
      next.push(tag);
    }
    return next;
  }

  function commit(entries: string[], rest = "") {
    // At the cap nothing is added and the typed text stays, so none of it is lost.
    if (full) return;
    const next = add(value, entries);
    if (next.length !== value.length) onChange(next);
    setDraft(rest);
  }

  function changed(text: string) {
    // A comma, typed or pasted, ends a tag; mobile keyboards may not send a
    // key event for it, so the text itself is checked.
    if (!text.includes(",")) {
      setDraft(text);
      return;
    }
    if (full) {
      setDraft(text.replaceAll(",", ""));
      return;
    }
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    commit(parts, rest);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      // Never submits the form.
      event.preventDefault();
      commit([draft]);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {value.length > 0 && (
          <ul aria-label={`${label} added`} className="contents">
            {value.map((tag) => (
              <motion.li
                key={tag}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={spring}
                className="flex items-center gap-0.5 rounded-full bg-secondary py-1 pr-1 pl-3 text-sm font-medium text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => onChange(value.filter((t) => t !== tag))}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </ul>
        )}
        <input
          type="text"
          aria-label={label}
          aria-describedby={hintId}
          enterKeyHint="done"
          autoCapitalize="none"
          autoComplete="off"
          value={draft}
          onChange={(event) => changed(event.target.value)}
          onKeyDown={keyDown}
          onBlur={() => commit([draft])}
          className="h-8 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
        Press Enter or comma to add a tag.
        {full && <span className="ml-1 font-medium text-destructive">{RECIPE_MESSAGES.tooManyTags}</span>}
      </p>
    </div>
  );
}

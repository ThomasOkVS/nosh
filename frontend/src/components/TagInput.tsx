import { XIcon } from "@phosphor-icons/react";
import { useCallback, useState, type KeyboardEvent } from "react";

interface TagInputProps {
  id?: string;
  name?: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ id, name, value, onChange }: Readonly<TagInputProps>) {
  const [draft, setDraft] = useState("");

  const commitDraft = useCallback(() => {
    const tag = draft.trim();
    setDraft("");
    if (tag === "" || value.includes(tag)) {
      return;
    }
    onChange([...value, tag]);
  }, [draft, value, onChange]);

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((existing) => existing !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitDraft();
        return;
      }
      if (event.key === "Backspace" && draft === "" && value.length > 0) {
        onChange(value.slice(0, -1));
      }
    },
    [commitDraft, draft, value, onChange],
  );

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface px-4 py-2.5 text-sm focus-within:ring-2 focus-within:ring-sauce-500 focus-within:ring-offset-2 focus-within:ring-offset-transparent">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-sage-50 px-2 py-0.5 capitalize text-sage-700 dark:bg-sage-500/15 dark:text-sage-300"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
            // text-sage-700 (not -600, which isn't a defined token — same
            // class of bug as buttonClass's old secondary text color, see
            // docs/decisions.md). Hover goes to danger-500, matching every
            // other remove/× control's convention app-wide (RecipeFormPage's
            // removeButtonClass, RecipeCollectionsEditor's chip remove
            // button), rather than a nonexistent darker sage shade.
            className="relative text-sage-700 hover:text-danger-500 before:absolute before:-inset-2.5 before:content-[''] dark:text-sage-300 dark:hover:text-danger-500"
          >
            <XIcon size={12} weight="bold" />
          </button>
        </span>
      ))}
      <input
        id={id}
        name={name}
        autoComplete="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? "Add a tag…" : ""}
        className="min-w-24 flex-1 border-none bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-faint focus:ring-0"
      />
    </div>
  );
}

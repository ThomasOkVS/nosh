import { XIcon } from "@phosphor-icons/react";
import { useCallback, useState, type KeyboardEvent } from "react";

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ id, value, onChange }: Readonly<TagInputProps>) {
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
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface px-4 py-2.5 text-sm focus-within:ring-2 focus-within:ring-citrus-500 focus-within:ring-offset-2 focus-within:ring-offset-transparent">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 capitalize text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
            className="relative text-teal-600 hover:text-teal-800 before:absolute before:-inset-2.5 before:content-[''] dark:text-teal-300 dark:hover:text-teal-100"
          >
            <XIcon size={12} weight="bold" />
          </button>
        </span>
      ))}
      <input
        id={id}
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

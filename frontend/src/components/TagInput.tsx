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
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-slate-400">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Remove ${tag}`}
            className="text-slate-400 hover:text-slate-600"
          >
            ×
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
        className="min-w-24 flex-1 border-none p-0 text-sm outline-none focus:ring-0"
      />
    </div>
  );
}

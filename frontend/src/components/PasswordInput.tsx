import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState, type ChangeEvent } from "react";

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}

export function PasswordInput({
  id,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
}: Readonly<PasswordInputProps>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className="w-full rounded-sm border border-border bg-surface px-4 py-2.5 pr-11 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-citrus-500 focus:ring-offset-2 focus:ring-offset-surface"
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-faint transition-colors duration-standard ease-standard hover:text-ink-muted"
      >
        {visible ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
      </button>
    </div>
  );
}

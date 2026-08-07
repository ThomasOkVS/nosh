import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useState } from "react";

const STORAGE_KEY = "nosh-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
    >
      {dark ? <SunIcon size={20} weight="fill" /> : <MoonIcon size={20} weight="fill" />}
    </button>
  );
}

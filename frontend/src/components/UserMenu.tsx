import { CaretDownIcon, MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

const THEME_STORAGE_KEY = "nosh-theme";

/** Baked in at build time from the commit SHA the running image was built
 * from (see frontend/Dockerfile, .github/workflows/ci.yml) — "dev" outside
 * that build (e.g. local `pnpm dev`), where there's no commit to pin to. */
const RAW_VERSION = import.meta.env.VITE_APP_VERSION;
const SHORT_VERSION = RAW_VERSION ? RAW_VERSION.slice(0, 7) : "dev";

const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm text-ink transition-colors duration-standard ease-standard hover:bg-surface-sunken";

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Closes on an outside click or Escape — only wired up while the menu is
  // actually open, so a stray click elsewhere never has a listener to catch.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  if (!user) return null;

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  };

  const handleLogout = () => {
    close();
    logout()
      .then(() => navigate("/login"))
      .catch(() => undefined);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 items-center gap-1.5 rounded-full px-2 text-sm text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink sm:px-3"
      >
        <span className="max-w-24 truncate sm:max-w-none">{user.username}</span>
        <CaretDownIcon
          size={14}
          weight="bold"
          className={`transition-transform duration-standard ease-standard ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User menu"
          className="glass-menu animate-dialog-in absolute right-0 z-20 mt-2 w-56 rounded-lg p-1"
        >
          <button type="button" role="menuitem" onClick={toggleTheme} className={menuItemClass}>
            {dark ? <SunIcon size={18} weight="fill" /> : <MoonIcon size={18} weight="fill" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <button type="button" role="menuitem" onClick={handleLogout} className={menuItemClass}>
            <SignOutIcon size={18} />
            Log out
          </button>
          <div
            className="mt-1 border-t border-border px-3 pt-2 pb-1.5 text-xs text-ink-faint"
            title={RAW_VERSION ? `Commit ${RAW_VERSION}` : "Not a production build"}
          >
            Version {SHORT_VERSION}
          </div>
        </div>
      )}
    </div>
  );
}

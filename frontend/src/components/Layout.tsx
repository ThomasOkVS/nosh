import { SignOutIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { ThemeToggle } from "./ThemeToggle";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout()
      .then(() => navigate("/login"))
      .catch(() => undefined);
  }, [logout, navigate]);

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="glass sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-xl font-extrabold text-citrus-500">
            Nosh
          </Link>
          {user && (
            <div className="flex items-center gap-1 text-sm text-ink-muted sm:gap-2">
              <span className="hidden sm:inline">{user.username}</span>
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
              >
                <SignOutIcon size={20} />
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

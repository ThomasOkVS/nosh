import { Link, Outlet } from "react-router-dom";
import { ImportDialog } from "../import/ImportDialog";
import { UserMenu } from "./UserMenu";

export function Layout() {
  return (
    <div className="min-h-screen bg-surface-page">
      <header className="glass sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-xl font-extrabold text-citrus-500">
            Nosh
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/collections"
              className="flex h-11 items-center rounded-full px-3 text-sm text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
            >
              Collections
            </Link>
            <UserMenu />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      {/* Mounted once here, not per-page, so a dismissed (backgrounded)
        * import's dialog can be reopened from any route and the completion
        * toast fires regardless of which page the user has since moved to. */}
      <ImportDialog />
    </div>
  );
}

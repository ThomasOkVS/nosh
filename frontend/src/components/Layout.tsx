import { Link, Outlet } from "react-router-dom";
import { ImportDialog } from "../import/ImportDialog";
import { LibrarySearch } from "./LibrarySearch";
import { UserMenu } from "./UserMenu";

export function Layout() {
  return (
    <div className="min-h-screen bg-surface-page">
      <header className="glass sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        {/* On phones the search box drops to its own full-width second row
          * (order-3 + w-full); from `sm` up it sits between logo and nav. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
          <Link to="/" className="font-display text-xl font-extrabold text-sauce-500">
            Nosh
          </Link>
          <LibrarySearch className="order-3 w-full sm:order-none sm:max-w-sm sm:flex-1" />
          <nav className="ml-auto flex items-center gap-1">
            <Link
              to="/meal-plan"
              className="flex h-11 items-center rounded-md px-3 text-sm text-ink-muted transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
            >
              Meal plan
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useId } from "react";
import { useLogOut } from "@/auth/session";
import { appVersion } from "@/lib/version";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  // From the guard's context, not the session query: logging out sets that
  // query to null before the page has left (AUTH-14).
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const logOut = useLogOut();
  const accountId = useId();
  // Read at render so tests can stub it.
  const version = appVersion(import.meta.env.VITE_COMMIT_SHA);

  return (
    <div className="flex flex-1 flex-col px-5 pt-4">
      <h1 className="text-[2.6rem] leading-none">Settings</h1>

      <section aria-labelledby={accountId} className="mt-8">
        <h2 id={accountId} className="text-xl">
          Account
        </h2>
        <div className="mt-3 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border">
          {/* AUTH-21: who is logged in; a long name is cut off, not wrapped. */}
          <div className="flex items-center gap-3 px-3 py-3">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-display text-lg uppercase"
            >
              {user.username.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Logged in as</p>
              <p className="truncate font-semibold">{user.username}</p>
            </div>
          </div>
          <div className="mx-3 h-px bg-border" />
          {/* AUTH-14: if logging out fails, the owner stays here and nothing is shown. */}
          <button
            type="button"
            disabled={logOut.isPending}
            onClick={() =>
              logOut.mutate(undefined, { onSuccess: () => void navigate({ to: "/login" }) })
            }
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
          >
            <span aria-hidden className="grid size-10 place-items-center">
              <LogOut className="size-5" />
            </span>
            Log out
          </button>
        </div>
      </section>

      {/* AUTH-21: which build is running; the full commit on hover. */}
      <p className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        Version{" "}
        <span title={version.full} className="tabular-nums">
          {version.short}
        </span>
      </p>
    </div>
  );
}

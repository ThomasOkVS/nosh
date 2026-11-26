import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";
import { sessionQuery } from "@/auth/session";
import { AppNav } from "@/components/AppNav";
import { SettingsLink } from "@/components/SettingsLink";

/**
 * Every screen except login and sign-up sits under this layout (AUTH-16).
 * The session check runs first (AUTH-17); without a session the visitor goes
 * to login, which returns them to the full address afterwards.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(sessionQuery);
    if (user === null) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  // AUTH-17: "Loading" from the very start of the check, never a blank page.
  // The router's pendingMinMs still keeps it from flashing.
  pendingMs: 0,
  component: AppFrame,
});

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * The screen owns the whole page (the recipe page, the form): the frame
     * hides its header and the app nav, and leaves the bottom to the screen.
     */
    fullBleed?: boolean;
  }
}

/**
 * Design §7 frame: wordmark and settings icon on top, floating nav below
 * (AUTH-24). A `fullBleed` route gets the bare page instead.
 */
function AppFrame() {
  const fullBleed = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullBleed === true),
  });
  if (fullBleed) {
    return (
      <main className="flex min-h-dvh flex-col">
        <Outlet />
      </main>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="font-display text-xl">nosh</span>
        <SettingsLink />
      </header>
      {/* Room at the bottom for the floating nav, so it never covers content. */}
      <main className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <AppNav />
    </div>
  );
}

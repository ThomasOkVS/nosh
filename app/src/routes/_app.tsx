import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQuery } from "@/auth/session";

/**
 * Every screen except login and sign-up sits under this layout (AUTH-16).
 * The session check runs first (AUTH-17); without a session the visitor goes
 * to login, which returns them to the full address afterwards. Task 8 adds
 * the app frame.
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
  component: Outlet,
});

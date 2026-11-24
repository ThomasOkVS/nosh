import { createFileRoute, redirect } from "@tanstack/react-router";

// AUTH-16: an unknown address sends a logged-in owner home. It sits under
// _app, so a logged-out visitor goes to login first with the address kept.
export const Route = createFileRoute("/_app/$")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});

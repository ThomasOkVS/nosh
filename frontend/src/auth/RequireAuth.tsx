import { CircleNotchIcon } from "@phosphor-icons/react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    // No route is known yet (still checking the session), so there's no
    // content shape to skeleton — a brief branded spinner is the right
    // weight for what's normally a near-instant check. See
    // docs/design-system.md#loading-states.
    return (
      <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center bg-surface-page">
        <CircleNotchIcon size={28} className="animate-spin text-citrus-500" aria-hidden="true" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

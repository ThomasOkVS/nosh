import { LoaderCircle } from "lucide-react";

/** AUTH-17: shown while the router waits, e.g. on the session check. */
export function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-dvh place-items-center">
      <LoaderCircle aria-hidden className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

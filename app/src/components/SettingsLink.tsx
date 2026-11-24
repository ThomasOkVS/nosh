import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";

/** Design §7: Settings is an icon top-right (AUTH-24). */
export function SettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className="-mr-2 grid size-11 place-items-center rounded-full text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring data-[status=active]:bg-secondary"
    >
      <Settings2 aria-hidden className="size-5" />
    </Link>
  );
}

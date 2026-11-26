import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** REC-40: a muted, gently pulsing block standing in for content that is loading. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div aria-hidden className={cn("motion-safe:animate-pulse rounded-md bg-muted", className)} {...props} />
  );
}

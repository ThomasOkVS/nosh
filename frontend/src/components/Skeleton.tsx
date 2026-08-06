export function Skeleton({ className = "" }: Readonly<{ className?: string }>) {
  return <div className={`animate-pulse bg-surface-sunken ${className}`} />;
}

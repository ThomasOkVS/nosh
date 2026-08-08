/**
 * Empty-state illustrations for the recipe list — see
 * docs/design-system.md#empty-states. Built from the app's own recipe-card
 * shape (photo block + title/meta bars, see Cards in design-system.md)
 * rather than generic clip-art, so "no recipes yet" reads as "here's the
 * shape of what's missing" instead of an unrelated stock graphic. Colors are
 * Tailwind utility classes (not raw hex) so both illustrations pick up
 * light/dark automatically, same as every other themed element.
 */

interface IllustrationProps {
  className?: string;
}

export function EmptyRecipesIllustration({ className }: Readonly<IllustrationProps>) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <g transform="rotate(-6 80 82)">
        <rect x="34" y="26" width="92" height="112" rx="16" className="fill-surface-sunken stroke-border" strokeWidth="2" />
        <rect x="46" y="38" width="68" height="46" rx="10" className="fill-citrus-50 dark:fill-citrus-500/15" />
        <rect x="46" y="94" width="48" height="8" rx="4" className="fill-border" />
        <rect x="46" y="108" width="34" height="8" rx="4" className="fill-border" />
      </g>
      <circle cx="120" cy="118" r="20" className="fill-citrus-500" />
      <path d="M120 109v18M111 118h18" className="stroke-white" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function EmptySearchIllustration({ className }: Readonly<IllustrationProps>) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <rect
        x="26"
        y="40"
        width="66"
        height="82"
        rx="14"
        className="fill-surface-sunken stroke-border"
        strokeWidth="2"
        transform="rotate(-10 59 81)"
      />
      <rect
        x="48"
        y="32"
        width="66"
        height="82"
        rx="14"
        className="fill-surface-sunken stroke-border"
        strokeWidth="2"
        transform="rotate(7 81 73)"
      />
      <circle cx="100" cy="64" r="26" className="fill-surface stroke-teal-500" strokeWidth="6" />
      <path d="M91 64h18M100 55v18" className="stroke-teal-500" strokeWidth="4" strokeLinecap="round" transform="rotate(45 100 64)" />
      <line x1="119" y1="83" x2="138" y2="102" className="stroke-teal-500" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

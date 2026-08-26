export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

/**
 * Shared button styling per docs/design-system.md#buttons. Returns a class
 * string so it works on both <button> and react-router's <Link> — no
 * polymorphic wrapper component needed for that.
 */
export function buttonClass(variant: ButtonVariant = "primary"): string {
  // rounded-md (not rounded-full) — Cookbook Editorial (2026-08-26) replaces
  // Citrus Pop's pill-shaped CTAs with the sharper, hairline-led shape
  // language; see docs/design-system.md#shape-language.
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2.5 text-sm font-medium transition-[transform,background-color,color,border-color] duration-standard ease-standard active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  switch (variant) {
    case "primary":
      return `${base} bg-sauce-500 text-white hover:bg-sauce-600`;
    case "secondary":
      // text-sage-500 (not -600, which isn't a defined token and would
      // silently fall back to Tailwind's stock teal) — matches the border
      // color and docs/design-system.md#buttons' spec.
      return `${base} border border-sage-500 text-sage-500 hover:bg-sage-50 dark:text-sage-300 dark:hover:bg-sage-500/10`;
    case "destructive":
      return `${base} bg-danger-500 text-white hover:bg-danger-700`;
    case "ghost":
      return `${base} text-ink-muted hover:bg-surface-sunken hover:text-ink`;
  }
}

/** Doesn't include a width — callers add `w-full` or a specific width (e.g. the
 * ingredient row's `w-20`/`flex-1`), since Tailwind resolves conflicting width
 * utilities by generated-CSS order, not by class-string order. */
/** ring-offset-transparent (not ring-offset-surface) — an opaque offset
 * color assumes the input always sits on --color-surface, which breaks on a
 * .glass panel (e.g. the login card): the offset paints a solid patch over
 * the translucent glass instead of blending with it. Transparent lets
 * whatever's actually behind the input show through, correct on both flat
 * and glass surfaces. See docs/design-system.md#open-items. */
export const inputClass =
  "rounded-sm border border-border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sauce-500 focus:ring-offset-2 focus:ring-offset-transparent";

export const errorBannerClass =
  "rounded-sm bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-500/15 dark:text-danger-500";

export const labelClass = "block text-sm font-medium text-ink-muted";

export const sectionHeadingClass = "flex items-center gap-2 font-display text-lg font-bold text-ink";

/** Groups a form section (Basics/Ingredients/Steps/Tags/Photos) into a
 * visually distinct chunk — see docs/design-system.md#forms. */
export const sectionCardClass = "rounded-lg bg-surface-sunken p-4 sm:p-6";

import { useEffect, useRef, type ReactNode, type SubmitEvent } from "react";
import { errorBannerClass } from "../styles";

interface AuthLayoutProps {
  title: string;
  error: string | null;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, error, onSubmit, children, footer }: Readonly<AuthLayoutProps>) {
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Per docs/design-system.md#forms: a freshly-set submit error moves focus
  // to the banner (tabIndex={-1} makes an otherwise non-interactive <p> a
  // valid focus target) instead of just appearing silently above the fields
  // a screen reader user is still on.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    // Cookbook Editorial (2026-08-26) has no hero-gradient moment — see
    // docs/design-system.md#color. The auth screen now sits on the same
    // paper page background as the rest of the app rather than the retired
    // Citrus Pop orange→pink gradient.
    <div className="flex min-h-dvh items-center justify-center bg-surface-page px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <form onSubmit={onSubmit} className="glass w-full max-w-sm animate-pop-in space-y-4 rounded-xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold italic text-ink">{title}</h1>
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className={errorBannerClass}>
            {error}
          </p>
        )}
        {children}
        {footer}
      </form>
    </div>
  );
}

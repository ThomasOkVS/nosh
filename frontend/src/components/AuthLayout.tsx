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
    <div
      className="flex min-h-dvh items-center justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ background: "linear-gradient(135deg, #FF7A1A 0%, #FF3D81 100%)" }}
    >
      <form onSubmit={onSubmit} className="glass w-full max-w-sm animate-pop-in space-y-4 rounded-xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold text-ink">{title}</h1>
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

import type { ReactNode, SubmitEvent } from "react";
import { errorBannerClass } from "../styles";

interface AuthLayoutProps {
  title: string;
  error: string | null;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, error, onSubmit, children, footer }: Readonly<AuthLayoutProps>) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))]"
      style={{ background: "linear-gradient(135deg, #FF7A1A 0%, #FF3D81 100%)" }}
    >
      <form onSubmit={onSubmit} className="glass w-full max-w-sm animate-pop-in space-y-4 rounded-xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold text-ink">{title}</h1>
        {error && <p className={errorBannerClass}>{error}</p>}
        {children}
        {footer}
      </form>
    </div>
  );
}

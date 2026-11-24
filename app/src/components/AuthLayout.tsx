import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { easeOut } from "@/lib/motion";

/** Shared input look for the auth forms: tall touch targets, mustard focus ring. */
export const authInputClass =
  "h-11 rounded-xl bg-card px-3.5 text-base md:text-base focus-visible:border-ring focus-visible:ring-ring";

interface AuthLayoutProps {
  title: string;
  /** Shown in an alert above the fields; focus moves to it (AUTH-18). */
  error: string | null;
  footer: ReactNode;
  children: ReactNode;
}

/** Login and sign-up frame (design §7): display title on chalk, white card. */
export function AuthLayout({ title, error, footer, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        <p className="text-xs font-semibold tracking-[0.2em] text-highlight uppercase">nosh</p>
        <h1 className="mt-1 text-4xl text-foreground">{title}</h1>
        <div className="mt-6 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          {error !== null && <FormAlert key={error} message={error} />}
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
      </motion.div>
    </main>
  );
}

function FormAlert({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mb-4 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      {message}
    </div>
  );
}

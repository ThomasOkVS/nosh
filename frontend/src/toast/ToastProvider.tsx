import { CheckCircleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastAction, type ToastOptions, type ToastVariant } from "./ToastContext";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

const TOAST_DURATION_MS = 6000;

/**
 * App-wide toasts — replaces window.alert() per docs/design-system.md#open-items.
 * Toasts are informational, not blocking (unlike ConfirmDialog), so they
 * auto-dismiss and never trap focus; a manual dismiss button covers the case
 * where the message is still relevant after the timeout. Started error-only;
 * `success` (with an optional action button) was added for background
 * import completion rather than building a second mechanism, per
 * docs/design-system.md#toasts.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Pending auto-dismiss timers would otherwise keep firing into a provider
  // that no longer exists.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev,
        { id, message, variant: options?.variant ?? "error", action: options?.action },
      ]);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, TOAST_DURATION_MS);
      timers.current.add(timer);
    },
    [dismiss],
  );

  // A fresh object literal here would be a new value on every render, making
  // every consumer of the context re-render whenever a toast appears or
  // expires — even though `showToast` itself never changes.
  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  // React 19 renders the context object itself as the provider;
  // `<ToastContext.Provider>` is the pre-19 form and is on its way out.
  return (
    <ToastContext value={contextValue}>
      {children}
      {/* pointer-events-none on the stack so it never blocks clicks on the
       * page beneath it; each toast re-enables events for itself. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className="glass animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg p-3"
          >
            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                toast.variant === "success"
                  ? "bg-success-500/15 text-success-500"
                  : "bg-danger-50 text-danger-500 dark:bg-danger-500/15"
              }`}
            >
              {toast.variant === "success" ? (
                <CheckCircleIcon size={18} weight="fill" />
              ) : (
                <WarningIcon size={18} weight="fill" />
              )}
            </div>
            <p className="flex-1 text-sm text-ink">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
                className="flex-shrink-0 text-sm font-medium text-citrus-600 hover:underline dark:text-citrus-400"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
            >
              <XIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

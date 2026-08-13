import { createContext, useContext } from "react";

export type ToastVariant = "error" | "success";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  variant?: ToastVariant;
  action?: ToastAction;
}

export interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Throws outside a ToastProvider rather than silently no-opping — a missing
 * provider is a wiring bug, not a state worth swallowing. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

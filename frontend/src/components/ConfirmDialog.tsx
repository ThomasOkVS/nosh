import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { buttonClass } from "../styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="animate-dialog-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
        className="glass animate-dialog-in w-full max-w-sm rounded-lg p-6"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-50 text-danger-500 dark:bg-danger-500/15">
          <WarningIcon size={22} weight="fill" />
        </div>
        <h2 id="confirm-dialog-title" className="mt-4 font-display text-lg font-bold text-ink">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-1 text-sm text-ink-muted">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={buttonClass("destructive")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // One effect, not two: `open` flipping false doesn't unmount this
  // component (the parent keeps rendering <ConfirmDialog open={...} />,
  // just with a different prop) — it only stops the JSX below from
  // rendering, so a fresh <dialog> node exists every time `open` becomes
  // true again. Splitting the "cancel" listener into its own effect keyed
  // only on `onCancel` would miss reattaching it to that fresh node
  // whenever `onCancel`'s reference happens to stay stable across a
  // close/reopen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    dialog.showModal();
    // The dialog's own default focus (first focusable element) would land
    // on Cancel anyway here, but stating it explicitly means it stays
    // correct if the markup order ever changes — and never defaults to
    // the destructive action.
    cancelRef.current?.focus();
    document.body.style.overflow = "hidden";

    // The browser's own Escape handling fires a cancelable "cancel" event
    // before closing the dialog — intercepted so Escape goes through the
    // same onCancel callback as every other dismissal, rather than closing
    // the native element out from under the `open` prop that controls
    // whether it's rendered at all.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancel();
    };
    dialog.addEventListener("cancel", handleCancel);

    return () => {
      document.body.style.overflow = "";
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      // Overrides the native <dialog>'s implicit "dialog" role — this one
      // specifically interrupts to demand a yes/no on a destructive action,
      // which is what "alertdialog" is for. aria-modal is left unset: it's
      // implied automatically for a native <dialog> opened via showModal().
      role="alertdialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      // Clicking the backdrop lands directly on the <dialog> element itself
      // (its content is all in descendants), so this check alone tells the
      // backdrop and the panel's own content apart — no separate backdrop
      // element needed.
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
      className="glass animate-dialog-in m-auto max-w-sm rounded-lg p-6"
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
    </dialog>
  );
}

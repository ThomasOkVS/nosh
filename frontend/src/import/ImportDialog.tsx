import {
  CheckIcon,
  CircleNotchIcon,
  LinkIcon,
  SparkleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import type { ImportStage } from "../api/import";
import { buttonClass, errorBannerClass, inputClass } from "../styles";
import { useImport } from "./ImportContext";

/** Short, present-tense labels for the stepper — distinct from a single
 * long status sentence, since a stepper row needs to read at a glance. */
const STEP_LABELS: Record<ImportStage, string> = {
  fetching: "Fetching the page",
  "structured-data": "Reading the page's recipe data",
  "downloading-video": "Downloading the video",
  "analyzing-video": "Watching the video and reading the caption",
  ai: "Asking the AI to read it",
};

const AI_STAGES: ReadonlySet<ImportStage> = new Set(["ai", "analyzing-video"]);
const VIDEO_STAGES: ReadonlySet<ImportStage> = new Set(["downloading-video", "analyzing-video"]);

function ElapsedTimer({ startedAt }: Readonly<{ startedAt: number }>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  return <span>{seconds}s elapsed</span>;
}

function Stepper({ seenStages }: Readonly<{ seenStages: ImportStage[] }>) {
  if (seenStages.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <CircleNotchIcon size={16} className="animate-spin" />
        Starting…
      </p>
    );
  }
  const isVideo = seenStages.some((stage) => VIDEO_STAGES.has(stage));
  return (
    <ol className="space-y-2">
      {seenStages.map((stage, index) => {
        const isCurrent = index === seenStages.length - 1;
        return (
          <li key={`${stage}-${index}`} className="flex items-center gap-2 text-sm">
            {isCurrent ? (
              <CircleNotchIcon size={16} className="flex-shrink-0 animate-spin text-citrus-500" />
            ) : (
              <CheckIcon size={16} weight="bold" className="flex-shrink-0 text-success-500" />
            )}
            <span className={isCurrent ? "text-ink" : "text-ink-muted"}>{STEP_LABELS[stage]}</span>
            {isCurrent && AI_STAGES.has(stage) && (
              <SparkleIcon size={14} weight="fill" className="flex-shrink-0 text-citrus-500" />
            )}
          </li>
        );
      })}
      {isVideo && (
        <li className="pt-1 text-xs text-ink-faint">This can take up to a minute for a video.</li>
      )}
    </ol>
  );
}

export function ImportDialog() {
  const { active, dialogOpen, closeDialog, startImport, cancelImport, resetToIdle } = useImport();
  const [url, setUrl] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const isRunning = active?.status === "running";
  const isError = active?.status === "error";

  // Only fires on the actual open transition — `dialogOpen` is the sole
  // dependency, deliberately not `isRunning`/`isError` too, since those flip
  // while this same <dialog> node stays open (idle -> running -> error) and
  // calling showModal() again on an already-open dialog throws. Mirrors
  // ConfirmDialog's version of this effect.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialogOpen || !dialog) return;

    dialog.showModal();
    document.body.style.overflow = "hidden";

    // The browser's own Escape handling fires a cancelable "cancel" event
    // before closing the dialog — intercepted so Escape goes through
    // closeDialog() (background it, don't cancel the import) rather than
    // closing the native element out from under `dialogOpen`.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      closeDialog();
    };
    dialog.addEventListener("cancel", handleCancel);

    return () => {
      document.body.style.overflow = "";
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [dialogOpen, closeDialog]);

  // Separate from the effect above: focus needs to move every time the view
  // changes (idle -> running -> error), not just on the initial open.
  useEffect(() => {
    if (!dialogOpen) return;
    (isRunning || isError ? closeRef : inputRef).current?.focus();
  }, [dialogOpen, isRunning, isError]);

  // Starting fresh each time the dialog reopens on an idle state, rather
  // than leaving a previous URL sitting in the box after a successful or
  // cancelled import.
  useEffect(() => {
    if (dialogOpen && !active) setUrl("");
  }, [dialogOpen, active]);

  if (!dialogOpen) return null;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) return;
    startImport(url.trim());
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="import-dialog-title"
      // Clicking the backdrop lands directly on the <dialog> element itself
      // (its content is all in descendants) — same as ConfirmDialog, and
      // same reasoning there for why a11y linters' "non-interactive element
      // with a click handler" complaint here is a false positive: Escape
      // (backgrounds the import, doesn't cancel it) is handled via the
      // native `cancel` event above, and the close button is always
      // reachable — backdrop-click is a supplementary mouse convenience, not
      // the only way to dismiss this dialog.
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog();
      }}
      className="glass animate-dialog-in m-auto w-full max-w-sm rounded-lg p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="import-dialog-title" className="font-display text-lg font-bold text-ink">
          Import a recipe
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={closeDialog}
          aria-label={isRunning ? "Close (keeps importing in the background)" : "Close"}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors duration-standard ease-standard hover:bg-surface-sunken hover:text-ink"
        >
          <XIcon size={18} />
        </button>
      </div>

      {!active && (
        <form onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="import-dialog-url" className="sr-only">
            Recipe URL
          </label>
          <input
            ref={inputRef}
            id="import-dialog-url"
            type="url"
            required
            placeholder="https://example.com/best-tomato-soup"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className={`w-full ${inputClass}`}
          />
          <p className="mt-2 text-sm text-ink-muted">
            Paste a link to a recipe page, Instagram Reel, or TikTok. We&rsquo;ll pull out the
            ingredients and steps so you can check them before saving.
          </p>
          <div className="mt-4 flex justify-end">
            <button type="submit" className={buttonClass("primary")}>
              <LinkIcon size={18} weight="bold" />
              Import recipe
            </button>
          </div>
        </form>
      )}

      {isRunning && (
        <div className="mt-4">
          {/* aria-live so stage changes are announced, not just seen —
           * the only feedback during a wait that can run to a minute. */}
          <div role="status" aria-live="polite">
            <Stepper seenStages={active.seenStages} />
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            <ElapsedTimer startedAt={active.startedAt} />
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={closeDialog} className={buttonClass("ghost")}>
              Keep this running in the background
            </button>
            <button type="button" onClick={cancelImport} className={buttonClass("destructive")}>
              Cancel import
            </button>
          </div>
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <p role="alert" className={errorBannerClass}>
            <WarningIcon size={16} weight="fill" className="mr-1 inline" />
            {active.errorMessage}
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={resetToIdle} className={buttonClass("primary")}>
              Try again
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  cancelImport as cancelImportJob,
  getImport,
  listPendingImports,
  markImportReviewed,
  startImport as startImportJob,
  type ImportJob,
} from "../api/import";
import { AuthContext } from "../auth/AuthContext";
import { useToast } from "../toast/ToastContext";
import type { ImportedRecipeState } from "./importedRecipe";
import { ImportContext, type ActiveImport, type OpenDialogOptions } from "./ImportContext";

const DEFAULT_POLL_INTERVAL_MS = 1000;

/** Best-effort, display-only label for the completion toast — not a
 * security boundary, just "which site did this come from" copy. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "that link";
  }
}

/** Folds a polled job into the in-memory view of it. Returns null for a
 * job that was cancelled (e.g. from another device) — nothing to show. */
function applyJob(prev: ActiveImport, job: ImportJob): ActiveImport | null {
  switch (job.status) {
    case "running":
      return { ...prev, seenStages: job.seenStages };
    case "done":
      return { ...prev, seenStages: job.seenStages, status: "done", recipe: job.recipe ?? undefined, imageUrl: job.imageUrl };
    case "error":
      return { ...prev, status: "error", errorMessage: job.errorMessage ?? "Failed to import that recipe" };
    case "cancelled":
      return null;
  }
}

function activeFromJob(job: ImportJob, watching: boolean): ActiveImport | null {
  const base: ActiveImport = {
    jobId: job.id,
    url: job.url,
    seenStages: [],
    startedAt: Date.parse(job.createdAt),
    collectionId: job.collectionId,
    // A job restored on launch was started in an earlier session, so
    // normally nobody is watching a dialog for it and it announces itself
    // by toast — unless the user already has the dialog open.
    dismissed: !watching,
    status: "running",
  };
  return applyJob(base, job);
}

/**
 * Owns import state independently of whatever component triggered it, so
 * closing the dialog doesn't cancel an in-progress import — it just stops
 * watching it.
 *
 * The import itself runs server-side as a job (see api/import.ts); this
 * provider starts it and then *polls* it, rather than holding a streaming
 * connection open. That's what makes closing the app safe: iOS suspends a
 * backgrounded web app and kills its connections, but a poll loop simply
 * picks up where it left off when the app comes back, and on a fresh launch
 * the provider asks the server what's still pending. See docs/decisions.md.
 *
 * `pollIntervalMs` is only overridden by tests.
 */
export function ImportProvider({
  children,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: Readonly<{ children: ReactNode; pollIntervalMs?: number }>) {
  const [active, setActive] = useState<ActiveImport | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Bumped whenever a new import starts or the current one is cancelled, so
  // a late response for a superseded import can tell it's stale.
  const generationRef = useRef(0);
  // Set by whichever page opened the dialog; captured into the import itself
  // when it starts, so reopening the dialog later (from anywhere) can't
  // change where an already-running import will be filed.
  const targetCollectionRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Read via useContext directly, not useAuth(): tests render this provider
  // without auth, and "no signed-in user" just means nothing to restore.
  const userId = useContext(AuthContext)?.user?.id;

  const startImport = useCallback((url: string) => {
    const generation = ++generationRef.current;
    const collectionId = targetCollectionRef.current;
    setActive({
      jobId: null,
      url,
      seenStages: [],
      startedAt: Date.now(),
      dismissed: false,
      status: "running",
      collectionId,
    });
    setDialogOpen(true);

    startImportJob(url, collectionId)
      .then((job) => {
        if (generation !== generationRef.current) {
          // Cancelled (or replaced) while the POST was still in flight —
          // the server-side job exists now, so cancel it there too.
          cancelImportJob(job.id).catch(() => undefined);
          return;
        }
        setActive((prev) => (prev ? { ...prev, jobId: job.id, startedAt: Date.parse(job.createdAt) } : prev));
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        setActive((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                errorMessage: err instanceof ApiError ? err.message : "Failed to import that recipe",
              }
            : prev,
        );
      });
  }, []);

  // Mirrors `active` for callbacks that need its current value without
  // being re-created on every poll (and without side effects inside a
  // state updater, which StrictMode runs twice).
  const activeRef = useRef(active);
  const dialogOpenRef = useRef(dialogOpen);
  useEffect(() => {
    activeRef.current = active;
    dialogOpenRef.current = dialogOpen;
  }, [active, dialogOpen]);

  const cancelImport = useCallback(() => {
    generationRef.current++;
    const jobId = activeRef.current?.jobId;
    if (jobId != null) cancelImportJob(jobId).catch(() => undefined);
    setActive(null);
    setDialogOpen(false);
  }, []);

  const openDialog = useCallback((options?: OpenDialogOptions) => {
    targetCollectionRef.current = options?.collectionId ?? null;
    setDialogOpen(true);
    // Re-attach "watching" status to an import that's running in the
    // background, so finishing now navigates instead of toasting.
    setActive((prev) => (prev?.dismissed ? { ...prev, dismissed: false } : prev));
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setActive((prev) => {
      if (!prev) return null;
      // Still running: keep it alive, just stop watching. Anything already
      // finished (done/error) is done being shown, so closing clears it.
      return prev.status === "running" ? { ...prev, dismissed: true } : null;
    });
  }, []);

  const resetToIdle = useCallback(() => setActive(null), []);

  // On sign-in (including app launch with an existing session): pick up an
  // import that's still running, or finished while the app was closed.
  useEffect(() => {
    if (userId === undefined) return;
    let cancelled = false;
    listPendingImports()
      .then((jobs) => {
        const latest = jobs[0];
        if (cancelled || !latest) return;
        // Never clobber an import the user started in the meantime.
        setActive((prev) => prev ?? activeFromJob(latest, dialogOpenRef.current));
      })
      .catch(() => undefined);
    // Signing out drops whatever was shown for the previous user. (A late
    // startImport response is harmless: its updates are no-ops on null.)
    return () => {
      cancelled = true;
      setActive(null);
    };
  }, [userId]);

  // Poll the running job. Paused while the page is hidden — there's no one
  // to show progress to, and a suspended iOS web app can't run timers
  // anyway — and polled immediately when it becomes visible again.
  const pollingJobId = active?.status === "running" ? active.jobId : null;
  useEffect(() => {
    if (pollingJobId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      try {
        const job = await getImport(pollingJobId);
        if (stopped) return;
        setActive((prev) => (prev?.jobId === pollingJobId ? applyJob(prev, job) : prev));
        if (job.status !== "running") return;
      } catch {
        // A dropped connection (e.g. just resumed from the background) is
        // expected — keep polling, the job itself is unaffected.
        if (stopped) return;
      }
      timer = setTimeout(() => void poll(), pollIntervalMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    timer = setTimeout(() => void poll(), pollIntervalMs);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollingJobId, pollIntervalMs]);

  // Reacts to an import finishing. Whether the dialog is still open when
  // that happens decides the outcome: watched imports navigate straight to
  // the pre-filled form; dismissed ones can't do that safely (the user may
  // have moved on to something else entirely), so they get a toast with a
  // manual "Review" action instead.
  useEffect(() => {
    if (!active) return;
    if (active.status === "done" && active.recipe && active.jobId !== null) {
      const path = `/recipes/new?importId=${active.jobId}`;
      const state: ImportedRecipeState = {
        importedRecipe: active.recipe,
        importedImageUrl: active.imageUrl ?? null,
        collectionId: active.collectionId,
      };
      if (active.dismissed) {
        showToast(`Your recipe from ${hostnameOf(active.url)} is ready to review.`, {
          variant: "success",
          action: { label: "Review", onClick: () => navigate(path, { state }) },
        });
      } else {
        navigate(path, { state });
        setDialogOpen(false);
      }
      setActive(null);
    } else if (active.status === "error" && active.dismissed) {
      showToast(active.errorMessage ?? "Failed to import that recipe", { variant: "error" });
      // Shown once is enough — don't keep resurfacing the same failure on
      // every launch.
      if (active.jobId !== null) markImportReviewed(active.jobId).catch(() => undefined);
      setActive(null);
    }
  }, [active, navigate, showToast]);

  // An error shown inline in the still-open dialog counts as seen too.
  const inlineErrorJobId = active?.status === "error" && !active.dismissed ? active.jobId : null;
  useEffect(() => {
    if (inlineErrorJobId !== null) markImportReviewed(inlineErrorJobId).catch(() => undefined);
  }, [inlineErrorJobId]);

  const value = useMemo(
    () => ({ active, dialogOpen, openDialog, closeDialog, startImport, cancelImport, resetToIdle }),
    [active, dialogOpen, openDialog, closeDialog, startImport, cancelImport, resetToIdle],
  );

  return <ImportContext value={value}>{children}</ImportContext>;
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { importRecipeFromUrl } from "../api/import";
import { useToast } from "../toast/ToastContext";
import { ImportContext, type ActiveImport } from "./ImportContext";

/** Best-effort, display-only label for the completion toast — not a
 * security boundary, just "which site did this come from" copy. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "that link";
  }
}

/**
 * Owns import state independently of whatever component triggered it, so
 * closing the dialog doesn't cancel an in-progress import — it just stops
 * watching it. See docs/decisions.md for the reasoning (a video import can
 * take the better part of a minute; a modal that must stay open that whole
 * time is a worse experience than one you can dismiss and get notified from).
 */
export function ImportProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [active, setActive] = useState<ActiveImport | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const startImport = useCallback((url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setActive({ url, seenStages: [], startedAt: Date.now(), dismissed: false, status: "running" });
    setDialogOpen(true);

    importRecipeFromUrl(
      url,
      (stage) => {
        if (controller.signal.aborted) return;
        setActive((prev) =>
          prev?.status === "running" ? { ...prev, seenStages: [...prev.seenStages, stage] } : prev,
        );
      },
      controller.signal,
    )
      .then(({ recipe, imageUrl }) => {
        if (controller.signal.aborted) return;
        setActive((prev) => (prev ? { ...prev, status: "done", recipe, imageUrl } : prev));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
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

  const cancelImport = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActive(null);
    setDialogOpen(false);
  }, []);

  const openDialog = useCallback(() => {
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

  // Reacts to an import finishing. Whether the dialog is still open when
  // that happens decides the outcome: watched imports navigate straight to
  // the pre-filled form (today's behavior); dismissed ones can't do that
  // safely (the user may have moved on to something else entirely — see the
  // stale-response guard this replaces), so they get a toast with a manual
  // "Review" action instead.
  useEffect(() => {
    if (!active) return;
    if (active.status === "done") {
      if (active.dismissed) {
        const recipe = active.recipe;
        const imageUrl = active.imageUrl;
        showToast(`Your recipe from ${hostnameOf(active.url)} is ready to review.`, {
          variant: "success",
          action: {
            label: "Review",
            onClick: () => navigate("/recipes/new", { state: { importedRecipe: recipe, importedImageUrl: imageUrl } }),
          },
        });
      } else {
        navigate("/recipes/new", {
          state: { importedRecipe: active.recipe, importedImageUrl: active.imageUrl },
        });
        setDialogOpen(false);
      }
      setActive(null);
    } else if (active.status === "error" && active.dismissed) {
      showToast(active.errorMessage ?? "Failed to import that recipe", { variant: "error" });
      setActive(null);
    }
  }, [active, navigate, showToast]);

  const value = useMemo(
    () => ({ active, dialogOpen, openDialog, closeDialog, startImport, cancelImport, resetToIdle }),
    [active, dialogOpen, openDialog, closeDialog, startImport, cancelImport, resetToIdle],
  );

  return <ImportContext value={value}>{children}</ImportContext>;
}

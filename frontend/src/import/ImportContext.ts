import { createContext, useContext } from "react";
import type { ImportStage } from "../api/import";
import type { RecipeInput } from "../api/types";

export interface ActiveImport {
  url: string;
  seenStages: ImportStage[];
  startedAt: number;
  /** True once the dialog has been closed while this import kept running —
   * decides whether a finished import navigates the still-watching user
   * straight to the form, or announces itself with a toast instead. */
  dismissed: boolean;
  status: "running" | "done" | "error";
  recipe?: RecipeInput;
  /** The recipe's photo, found during import — attached automatically once
   * the form is saved and a real recipe id exists to attach it to. */
  imageUrl?: string | null;
  errorMessage?: string;
}

export interface ImportContextValue {
  active: ActiveImport | null;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  startImport: (url: string) => void;
  cancelImport: () => void;
  /** Clears a finished-with-error import so the dialog falls back to the
   * plain URL input, without otherwise touching dialogOpen. */
  resetToIdle: () => void;
}

export const ImportContext = createContext<ImportContextValue | null>(null);

/** Throws outside an ImportProvider rather than silently no-opping — a
 * missing provider is a wiring bug, not a state worth swallowing. */
export function useImport(): ImportContextValue {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error("useImport must be used within an ImportProvider");
  }
  return context;
}

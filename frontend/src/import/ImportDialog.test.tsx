import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as importApi from "../api/import";
import type { RecipeInput } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { useImport } from "./ImportContext";
import { ImportDialog } from "./ImportDialog";
import { ImportProvider } from "./ImportProvider";

/** Stands in for RecipeFormPage so the test can assert on the router state
 * a completed import hands over, without rendering the whole form. */
function StateProbe() {
  const { state } = useLocation() as { state?: { importedRecipe?: RecipeInput } };
  return <div data-testid="imported-title">{state?.importedRecipe?.title ?? "none"}</div>;
}

/** Stands in for RecipeListPage's trigger button. */
function OpenButton() {
  const { openDialog } = useImport();
  return (
    <button type="button" onClick={openDialog}>
      Import from URL
    </button>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <ImportProvider>
          <Routes>
            <Route path="/" element={<OpenButton />} />
            <Route path="/recipes/new" element={<StateProbe />} />
          </Routes>
          <ImportDialog />
        </ImportProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function openAndSubmit(url = "https://example.com/recipe") {
  fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
  fireEvent.change(screen.getByLabelText("Recipe URL"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));
}

describe("ImportDialog", () => {
  it("shows the URL input when opened with nothing running", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });

  it("closes (backgrounding, not cancelling) when the backdrop is clicked while running", async () => {
    let onStage!: (stage: importApi.ImportStage) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, stageCallback) =>
        new Promise(() => {
          onStage = stageCallback!;
        }),
    );

    renderApp();
    openAndSubmit();
    act(() => onStage("fetching"));

    // A click lands on the <dialog> element itself (rather than one of its
    // content descendants) exactly when it's on the backdrop area.
    fireEvent.click(screen.getByRole("dialog"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Reopening still shows the same in-progress import, proving the
    // backdrop click backgrounded it rather than cancelling it outright.
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
  });

  it("closes via the native cancel event the same way as the close button", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));

    // Real browsers fire a cancelable "cancel" event on the dialog when
    // Escape is pressed while it's modal — jsdom doesn't simulate that from
    // a raw keydown, so the event is dispatched directly to exercise the
    // same listener a real Escape press would trigger.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows each stage as it streams in, most recent first marked active", async () => {
    let onStage!: (stage: importApi.ImportStage) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, stageCallback) =>
        new Promise(() => {
          onStage = stageCallback!;
        }),
    );

    renderApp();
    openAndSubmit();

    act(() => onStage("fetching"));
    expect(await screen.findByText("Fetching the page")).toBeInTheDocument();

    act(() => onStage("structured-data"));
    expect(await screen.findByText("Reading the page's recipe data")).toBeInTheDocument();
    // The earlier stage is still shown, just no longer the active one.
    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
  });

  it("calls out the longer wait once a video stage appears", async () => {
    let onStage!: (stage: importApi.ImportStage) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, stageCallback) =>
        new Promise(() => {
          onStage = stageCallback!;
        }),
    );

    renderApp();
    openAndSubmit("https://www.instagram.com/p/abc123/");
    act(() => onStage("downloading-video"));

    expect(await screen.findByText(/up to a minute/i)).toBeInTheDocument();
  });

  it("navigates to the create form with the extracted recipe when left open", async () => {
    const recipe = { title: "Tomato Soup" } as RecipeInput;
    vi.spyOn(importApi, "importRecipeFromUrl").mockResolvedValue(recipe);

    renderApp();
    openAndSubmit();

    expect(await screen.findByTestId("imported-title")).toHaveTextContent("Tomato Soup");
    // The dialog closed itself as part of handing off to the form.
    expect(screen.queryByLabelText("Recipe URL")).not.toBeInTheDocument();
  });

  it("lets the user cancel — the underlying request is aborted, not just hidden", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, _onStage, signal) => {
        capturedSignal = signal;
        return new Promise(() => undefined);
      },
    );

    renderApp();
    openAndSubmit();

    fireEvent.click(await screen.findByRole("button", { name: "Cancel import" }));

    expect(capturedSignal?.aborted).toBe(true);
    // Cancelling returns to a clean idle dialog-closed state, not an error.
    expect(screen.queryByLabelText("Recipe URL")).not.toBeInTheDocument();
  });

  it("keeps running after being dismissed, then announces completion with a toast", async () => {
    let resolveImport!: (recipe: RecipeInput) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      () => new Promise((resolve) => (resolveImport = resolve)),
    );

    renderApp();
    openAndSubmit("https://www.instagram.com/p/abc123/");

    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));
    // Dialog is gone, but nothing was cancelled or navigated yet.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    resolveImport({ title: "Fajitas" } as RecipeInput);

    const reviewButton = await screen.findByRole("button", { name: "Review" });
    expect(screen.getByText(/ready to review/i)).toBeInTheDocument();
    // Not auto-navigated — the user is still wherever they were, and gets
    // to choose when to leave via the toast's action instead.
    expect(screen.getByRole("button", { name: "Import from URL" })).toBeInTheDocument();

    fireEvent.click(reviewButton);
    expect(await screen.findByTestId("imported-title")).toHaveTextContent("Fajitas");
  });

  it("shows an error toast instead of an inline error once dismissed", async () => {
    let rejectImport!: (err: unknown) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      () => new Promise((_resolve, reject) => (rejectImport = reject)),
    );

    renderApp();
    openAndSubmit();
    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));

    rejectImport(new Error("boom"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to import that recipe");
  });

  it("shows the error inline and offers to try again when left open", async () => {
    vi.spyOn(importApi, "importRecipeFromUrl").mockRejectedValue(new Error("boom"));

    renderApp();
    openAndSubmit();

    expect(await screen.findByText("Failed to import that recipe")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });

  it("reopening a backgrounded import shows its current progress, not a blank input", async () => {
    let onStage!: (stage: importApi.ImportStage) => void;
    vi.spyOn(importApi, "importRecipeFromUrl").mockImplementation(
      (_url, stageCallback) =>
        new Promise(() => {
          onStage = stageCallback!;
        }),
    );

    renderApp();
    openAndSubmit();
    act(() => onStage("fetching"));
    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));

    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));

    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
    expect(screen.queryByLabelText("Recipe URL")).not.toBeInTheDocument();
  });
});

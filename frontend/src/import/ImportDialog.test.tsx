import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as importApi from "../api/import";
import type { ImportJob } from "../api/import";
import type { RecipeInput } from "../api/types";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import * as pushNotifications from "../push/pushNotifications";
import { ToastProvider } from "../toast/ToastProvider";
import { useImport } from "./ImportContext";
import { ImportDialog } from "./ImportDialog";
import { ImportProvider } from "./ImportProvider";

/** Stands in for NewRecipePage so the test can assert on what a completed
 * import hands over, without rendering the whole form. */
function StateProbe() {
  const { state, search } = useLocation() as { state?: { importedRecipe?: RecipeInput }; search: string };
  return (
    <>
      <div data-testid="imported-title">{state?.importedRecipe?.title ?? "none"}</div>
      <div data-testid="search">{search}</div>
    </>
  );
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

function makeJob(patch: Partial<ImportJob> = {}): ImportJob {
  return {
    id: 7,
    url: "https://example.com/recipe",
    status: "running",
    seenStages: [],
    recipe: null,
    imageUrl: null,
    errorStatus: null,
    errorMessage: null,
    reviewed: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

/**
 * A fake of the server's job API: `startImport` creates the job, `getImport`
 * returns whatever state the test last moved it to via `update`. The
 * provider polls every 10ms in these tests, so an `update` shows up on
 * screen almost immediately.
 */
function fakeServer(pending: ImportJob[] = []) {
  let job = makeJob();
  const startImport = vi.spyOn(importApi, "startImport").mockImplementation((url) => {
    job = { ...job, url };
    return Promise.resolve(job);
  });
  vi.spyOn(importApi, "getImport").mockImplementation(() => Promise.resolve(job));
  const cancelImport = vi.spyOn(importApi, "cancelImport").mockResolvedValue(undefined);
  const markImportReviewed = vi.spyOn(importApi, "markImportReviewed").mockResolvedValue(undefined);
  vi.spyOn(importApi, "listPendingImports").mockResolvedValue(pending);
  return {
    startImport,
    cancelImport,
    markImportReviewed,
    update(patch: Partial<ImportJob>) {
      job = { ...job, ...patch };
    },
  };
}

function renderApp({ signedIn = false }: { signedIn?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <ImportProvider pollIntervalMs={10}>
          <Routes>
            <Route path="/" element={<OpenButton />} />
            <Route path="/recipes/new" element={<StateProbe />} />
          </Routes>
          <ImportDialog />
        </ImportProvider>
      </ToastProvider>
    </MemoryRouter>
  );
  const withAuth = (children: ReactNode) =>
    signedIn ? (
      <AuthContext value={{ user: { id: 1, email: "a@b.c", username: "a" } } as AuthContextValue}>
        {children}
      </AuthContext>
    ) : (
      children
    );
  return render(withAuth(tree));
}

function openAndSubmit(url = "https://example.com/recipe") {
  fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
  fireEvent.change(screen.getByLabelText("Recipe URL"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: /Import recipe/ }));
}

describe("ImportDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the URL input when opened with nothing running", () => {
    fakeServer();
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });

  it("closes (backgrounding, not cancelling) when the backdrop is clicked while running", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    server.update({ seenStages: ["fetching"] });
    expect(await screen.findByText("Fetching the page")).toBeInTheDocument();

    // A click lands on the <dialog> element itself (rather than one of its
    // content descendants) exactly when it's on the backdrop area.
    fireEvent.click(screen.getByRole("dialog"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.cancelImport).not.toHaveBeenCalled();
    // Reopening still shows the same in-progress import, proving the
    // backdrop click backgrounded it rather than cancelling it outright.
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
  });

  it("closes via the native cancel event the same way as the close button", () => {
    fakeServer();
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));

    // Real browsers fire a cancelable "cancel" event on the dialog when
    // Escape is pressed while it's modal — jsdom doesn't simulate that from
    // a raw keydown, so the event is dispatched directly to exercise the
    // same listener a real Escape press would trigger.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows each stage as polling picks it up, the latest marked active", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();

    server.update({ seenStages: ["fetching"] });
    expect(await screen.findByText("Fetching the page")).toBeInTheDocument();

    server.update({ seenStages: ["fetching", "structured-data"] });
    expect(await screen.findByText("Reading the page's recipe data")).toBeInTheDocument();
    // The earlier stage is still shown, just no longer the active one.
    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
  });

  it("calls out the longer wait once a video stage appears", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit("https://www.instagram.com/p/abc123/");
    server.update({ seenStages: ["downloading-video"] });

    expect(await screen.findByText(/up to a minute/i)).toBeInTheDocument();
  });

  it("navigates to the create form with the extracted recipe when left open", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    server.update({ status: "done", recipe: { title: "Tomato Soup" } as RecipeInput });

    expect(await screen.findByTestId("imported-title")).toHaveTextContent("Tomato Soup");
    expect(screen.getByTestId("search")).toHaveTextContent("?importId=7");
    // The dialog closed itself as part of handing off to the form.
    expect(screen.queryByLabelText("Recipe URL")).not.toBeInTheDocument();
  });

  it("lets the user cancel — the server-side job is cancelled, not just hidden", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    // Wait for the server to have acknowledged the job, so there's an id.
    await waitFor(() => expect(server.startImport).toHaveBeenCalled());
    await act(() => Promise.resolve());

    fireEvent.click(await screen.findByRole("button", { name: "Cancel import" }));

    expect(server.cancelImport).toHaveBeenCalledWith(7);
    // Cancelling returns to a clean idle dialog-closed state, not an error.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps running after being dismissed, then announces completion with a toast", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit("https://www.instagram.com/p/abc123/");

    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));
    // Dialog is gone, but nothing was cancelled or navigated yet.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    server.update({ status: "done", recipe: { title: "Fajitas" } as RecipeInput });

    const reviewButton = await screen.findByRole("button", { name: "Review" });
    expect(screen.getByText(/ready to review/i)).toBeInTheDocument();
    // Not auto-navigated — the user is still wherever they were, and gets
    // to choose when to leave via the toast's action instead.
    expect(screen.getByRole("button", { name: "Import from URL" })).toBeInTheDocument();

    fireEvent.click(reviewButton);
    expect(await screen.findByTestId("imported-title")).toHaveTextContent("Fajitas");
  });

  it("shows an error toast instead of an inline error once dismissed, and marks it seen", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));

    server.update({ status: "error", errorMessage: "That page couldn't be fetched" });

    expect(await screen.findByRole("alert")).toHaveTextContent("That page couldn't be fetched");
    expect(server.markImportReviewed).toHaveBeenCalledWith(7);
  });

  it("shows the error inline and offers to try again when left open", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    server.update({ status: "error", errorMessage: "No recipe could be found on that page" });

    expect(await screen.findByText("No recipe could be found on that page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("Recipe URL")).toBeInTheDocument();
  });

  it("shows a failure to even start the import inline", async () => {
    fakeServer();
    vi.spyOn(importApi, "startImport").mockRejectedValue(new Error("offline"));
    renderApp();
    openAndSubmit();

    expect(await screen.findByText("Failed to import that recipe")).toBeInTheDocument();
  });

  it("reopening a backgrounded import shows its current progress, not a blank input", async () => {
    const server = fakeServer();
    renderApp();
    openAndSubmit();
    server.update({ seenStages: ["fetching"] });
    expect(await screen.findByText("Fetching the page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Keep this running in the background/ }));

    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));

    expect(screen.getByText("Fetching the page")).toBeInTheDocument();
    expect(screen.queryByLabelText("Recipe URL")).not.toBeInTheDocument();
  });

  describe("restoring on launch", () => {
    it("offers to review an import that finished while the app was closed", async () => {
      fakeServer([makeJob({ id: 12, status: "done", recipe: { title: "Ramen" } as RecipeInput })]);
      renderApp({ signedIn: true });

      fireEvent.click(await screen.findByRole("button", { name: "Review" }));
      expect(await screen.findByTestId("imported-title")).toHaveTextContent("Ramen");
      expect(screen.getByTestId("search")).toHaveTextContent("?importId=12");
    });

    it("resumes polling an import that's still running", async () => {
      const server = fakeServer([makeJob({ seenStages: ["downloading-video"] })]);
      renderApp({ signedIn: true });

      fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
      expect(await screen.findByText("Downloading the video")).toBeInTheDocument();

      server.update({ status: "done", recipe: { title: "Dumplings" } as RecipeInput });
      // Reopened, so it's being watched again: navigates rather than toasts.
      expect(await screen.findByTestId("imported-title")).toHaveTextContent("Dumplings");
    });

    it("doesn't restore anything when signed out", async () => {
      fakeServer([makeJob({ status: "done", recipe: { title: "Ramen" } as RecipeInput })]);
      renderApp();

      await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
      expect(importApi.listPendingImports).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    });
  });

  describe("notify me", () => {
    it("isn't offered where pushes can't work (jsdom has no PushManager)", async () => {
      fakeServer();
      renderApp();
      openAndSubmit();

      expect(await screen.findByText("Starting…")).toBeInTheDocument();
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(screen.queryByRole("button", { name: /Notify me/ })).not.toBeInTheDocument();
    });

    it("is offered while running when supported, and asks for permission on tap", async () => {
      fakeServer();
      vi.spyOn(pushNotifications, "getPushStatus").mockResolvedValue("off");
      const enablePush = vi.spyOn(pushNotifications, "enablePush").mockResolvedValue("on");
      renderApp();
      openAndSubmit();

      fireEvent.click(await screen.findByRole("button", { name: /Notify me when it/ }));

      expect(enablePush).toHaveBeenCalled();
      expect(await screen.findByText(/feel free to close the app/)).toBeInTheDocument();
    });

    it("explains how to recover when notifications are blocked", async () => {
      fakeServer();
      vi.spyOn(pushNotifications, "getPushStatus").mockResolvedValue("denied");
      renderApp();
      openAndSubmit();

      expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument();
    });
  });
});

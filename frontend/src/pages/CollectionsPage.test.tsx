import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as collectionsApi from "../api/collections";
import type { Collection } from "../api/types";
import { ToastProvider } from "../toast/ToastProvider";
import { CollectionsPage } from "./CollectionsPage";

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    name: "Weeknight dinners",
    createdAt: "2026-01-01T00:00:00Z",
    recipeCount: 2,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <CollectionsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("CollectionsPage", () => {
  it("lists collections with their recipe counts", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([makeCollection()]);

    renderPage();

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows an empty state with no collections", async () => {
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
  });

  it("creates a collection and reloads the list", async () => {
    const list = vi
      .spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCollection()]);
    const create = vi.spyOn(collectionsApi, "createCollection").mockResolvedValue(makeCollection());

    renderPage();
    await screen.findByText(/no collections yet/i);

    fireEvent.change(screen.getByPlaceholderText("New collection…"), {
      target: { value: "Weeknight dinners" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText("Weeknight dinners")).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith("Weeknight dinners");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("deletes a collection after confirming", async () => {
    vi.spyOn(collectionsApi, "listCollections")
      .mockResolvedValueOnce([makeCollection()])
      .mockResolvedValueOnce([]);
    const deleteCollection = vi.spyOn(collectionsApi, "deleteCollection").mockResolvedValue(undefined);

    renderPage();
    await screen.findByText("Weeknight dinners");

    fireEvent.click(screen.getByRole("button", { name: /delete weeknight dinners/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteCollection).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
  });
});

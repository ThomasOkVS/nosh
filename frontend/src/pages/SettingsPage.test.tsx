import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settingsApi from "../api/settings";
import type { MagicImportSettings, RecipePreferences } from "../api/settings";
import { ToastProvider } from "../toast/ToastProvider";
import { SettingsPage } from "./SettingsPage";

function makeSettings(overrides: Partial<MagicImportSettings> = {}): MagicImportSettings {
  return {
    aiConfigured: true,
    selectedModel: null,
    defaultTextModel: "flash",
    defaultVideoModel: "flash-lite",
    models: [
      {
        id: "flash",
        dailyRequestLimit: 20,
        requestsToday: 3,
        promptTokensToday: 9000,
        outputTokensToday: 1000,
      },
      {
        id: "flash-lite",
        dailyRequestLimit: 500,
        requestsToday: 500,
        promptTokensToday: 0,
        outputTokensToday: 0,
      },
      {
        id: "mystery",
        dailyRequestLimit: null,
        requestsToday: 1,
        promptTokensToday: 0,
        outputTokensToday: 0,
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

const defaultPreferences: RecipePreferences = {
  language: null,
  unitSystem: "metric",
  temperatureUnit: "C",
  keepSpoons: true,
};

beforeEach(() => {
  vi.spyOn(settingsApi, "getRecipePreferences").mockResolvedValue(defaultPreferences);
  vi.spyOn(settingsApi, "getMagicImportSettings").mockResolvedValue(makeSettings());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsPage — magic import", () => {
  it("shows automatic selected and each model's estimated requests left", async () => {
    vi.spyOn(settingsApi, "getMagicImportSettings").mockResolvedValue(makeSettings());

    renderPage();

    expect(await screen.findByRole("radio", { name: /automatic/i })).toBeChecked();
    expect(screen.getByText("~17 of 20 requests left today")).toBeInTheDocument();
    expect(screen.getByText("~0 of 500 requests left today")).toBeInTheDocument();
    // No configured limit: usage only, no "left".
    expect(screen.getByText("1 request today")).toBeInTheDocument();
    expect(screen.getByText("10K tokens used today")).toBeInTheDocument();
  });

  it("saves a chosen model", async () => {
    vi.spyOn(settingsApi, "getMagicImportSettings").mockResolvedValue(makeSettings());
    const save = vi
      .spyOn(settingsApi, "setMagicImportModel")
      .mockResolvedValue(makeSettings({ selectedModel: "flash" }));

    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /^flash ~17/i }));

    expect(save).toHaveBeenCalledWith("flash");
    await waitFor(() => expect(screen.getByRole("radio", { name: /^flash ~17/i })).toBeChecked());
  });

  it("reverts the choice and toasts when saving fails", async () => {
    vi.spyOn(settingsApi, "getMagicImportSettings").mockResolvedValue(makeSettings());
    vi.spyOn(settingsApi, "setMagicImportModel").mockRejectedValue(new Error("nope"));

    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /^mystery/i }));

    expect(await screen.findByText("Couldn't save your model choice")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /automatic/i })).toBeChecked();
  });

  it("explains when the server has no AI configured", async () => {
    vi.spyOn(settingsApi, "getMagicImportSettings").mockResolvedValue(
      makeSettings({ aiConfigured: false }),
    );

    renderPage();

    expect(await screen.findByText(/isn.t set up on this server/i)).toBeInTheDocument();
    const magicImport = screen.getByRole("region", { name: /magic import/i });
    expect(within(magicImport).queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("SettingsPage — language & units", () => {
  it("shows the saved preferences", async () => {
    vi.spyOn(settingsApi, "getRecipePreferences").mockResolvedValue({
      ...defaultPreferences,
      language: "nl",
      temperatureUnit: "F",
    });

    renderPage();

    expect(await screen.findByRole("radio", { name: /nederlands/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /metric/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: "°F" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /keep spoons/i })).toBeChecked();
  });

  it("saves just the changed field", async () => {
    const update = vi
      .spyOn(settingsApi, "updateRecipePreferences")
      .mockResolvedValue({ ...defaultPreferences, unitSystem: "us" });

    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /^us/i }));

    expect(update).toHaveBeenCalledWith({ unitSystem: "us" });
    await waitFor(() => expect(screen.getByRole("radio", { name: /^us/i })).toBeChecked());
  });

  it("snaps back and says so when saving fails", async () => {
    vi.spyOn(settingsApi, "updateRecipePreferences").mockRejectedValue(new Error("nope"));

    renderPage();
    const checkbox = await screen.findByRole("checkbox", { name: /keep spoons/i });
    fireEvent.click(checkbox);

    expect(await screen.findByText("Couldn't save your preference")).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });
});

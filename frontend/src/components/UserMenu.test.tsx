import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../api/auth";
import { AuthProvider } from "../auth/AuthProvider";
import { UserMenu } from "./UserMenu";

function renderMenu() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UserMenu />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue({ id: 1, email: "a@b.com", username: "abee" });
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("renders nothing while unauthenticated", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockRejectedValue(new Error("Not authenticated"));

    renderMenu();

    await waitFor(() => expect(authApi.getCurrentUser).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the username and opens the menu on click, with the version at the bottom", async () => {
    renderMenu();

    const trigger = await screen.findByRole("button", { name: /abee/ });
    fireEvent.click(trigger);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /dark mode/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByText(/version/i)).toBeInTheDocument();
  });

  it("toggles the dark class on <html> and updates the label without closing the menu", async () => {
    renderMenu();

    fireEvent.click(await screen.findByRole("button", { name: /abee/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /dark mode/i }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("menuitem", { name: /light mode/i })).toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    renderMenu();

    fireEvent.click(await screen.findByRole("button", { name: /abee/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderMenu();

    fireEvent.click(await screen.findByRole("button", { name: /abee/ }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("logs out and navigates to /login", async () => {
    vi.spyOn(authApi, "logout").mockResolvedValue(undefined);
    renderMenu();

    fireEvent.click(await screen.findByRole("button", { name: /abee/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));

    await waitFor(() => expect(authApi.logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

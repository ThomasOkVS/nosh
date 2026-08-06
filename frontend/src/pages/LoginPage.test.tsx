import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as useAuthModule from "../auth/useAuth";
import { LoginPage } from "./LoginPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("submits the entered credentials", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: null,
      status: "unauthenticated",
      login,
      signup: vi.fn(),
      logout: vi.fn(),
    });

    renderPage();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("alice", "secret123"));
  });

  it("shows the server's error message when login fails", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, "Invalid username or password"));
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: null,
      status: "unauthenticated",
      login,
      signup: vi.fn(),
      logout: vi.fn(),
    });

    renderPage();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
  });
});

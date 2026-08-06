import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as authApi from "../api/auth";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Secret recipe</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no active session", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockRejectedValue(new Error("Not authenticated"));

    renderApp();

    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected route when the session check succeeds", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue({ id: 1, email: "a@b.com", username: "abee" });

    renderApp();

    expect(await screen.findByText("Secret recipe")).toBeInTheDocument();
  });
});

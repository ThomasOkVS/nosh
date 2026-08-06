import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as authApi from "./api/auth";
import App from "./App";

describe("App", () => {
  it("redirects to /login when there is no active session", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockRejectedValue(new Error("Not authenticated"));
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Log in to Nosh" })).toBeInTheDocument();
  });
});

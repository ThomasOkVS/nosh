import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as authApi from "./api/auth";
import * as collectionsApi from "./api/collections";
import * as recipesApi from "./api/recipes";
import App from "./App";

describe("App", () => {
  it("redirects to /login when there is no active session", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockRejectedValue(new Error("Not authenticated"));
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Log in to Nosh" })).toBeInTheDocument();
  });

  it("redirects the old /recipes page to the library, keeping its search", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue({
      id: 1,
      email: "a@example.com",
      username: "a",
    });
    vi.spyOn(collectionsApi, "listCollections").mockResolvedValue([]);
    const search = vi.spyOn(recipesApi, "searchRecipes").mockResolvedValue([]);
    window.history.pushState({}, "", "/recipes?q=soup&tag=dessert");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?q=soup&tag=dessert");
    expect(search).toHaveBeenCalledWith("soup", { tag: "dessert", within: undefined });
  });
});

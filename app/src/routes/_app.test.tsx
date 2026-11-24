import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../test/msw";
import { renderApp } from "../../test/render";

const me = (resolver: Parameters<typeof http.get>[1]) =>
  server.use(http.get("/api/auth/me", resolver));
const notAuthenticated = () => HttpResponse.json({ error: "Not authenticated" }, { status: 401 });

describe("protected screens", () => {
  it("AUTH-17 shows only a loading indicator while the session check runs", async () => {
    const answer = deferred();
    me(async () => {
      await answer.promise;
      return HttpResponse.json(owner);
    });
    renderApp("/");

    // Synchronous on purpose: any pending delay would leave a blank page here.
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Library" })).not.toBeInTheDocument();

    answer.resolve();
    await screen.findByRole("heading", { name: "Library" });
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("AUTH-17 shows the protected screen when a session exists", async () => {
    me(() => HttpResponse.json(owner));
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
  });

  it("AUTH-17 sends a visitor without a session to login", async () => {
    me(notAuthenticated);
    const { router } = renderApp("/");
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("AUTH-17 treats a failed session check as logged out", async () => {
    me(() => HttpResponse.error());
    const { router } = renderApp("/");
    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("AUTH-16 keeps the full requested address for after login", async () => {
    me(notAuthenticated);
    const { router } = renderApp("/recipes/new?importId=5#top");
    await screen.findByLabelText("Username");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/recipes/new?importId=5#top" });
  });

  it("AUTH-16 sends a logged-in owner on an unknown address to the library", async () => {
    me(() => HttpResponse.json(owner));
    const { router } = renderApp("/no/such/page");
    await screen.findByRole("heading", { name: "Library" });
    expect(router.state.location.href).toBe("/");
  });
});

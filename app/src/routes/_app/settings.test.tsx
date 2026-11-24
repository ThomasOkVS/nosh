import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { owner, server } from "../../../test/msw";
import { renderApp } from "../../../test/render";

function loggedIn(username = owner.username) {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ ...owner, username })));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Settings", () => {
  it("AUTH-21 shows the username in the Account section, truncated when long", async () => {
    const long = "a-very-long-username-that-does-not-fit-on-a-phone";
    loggedIn(long);
    renderApp("/settings");

    const account = await screen.findByRole("region", { name: "Account" });
    const name = screen.getByText(long);
    expect(account).toContainElement(name);
    expect(name).toHaveClass("truncate");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("AUTH-14 logs out and goes to the login page", async () => {
    loggedIn();
    let calls = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        calls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router, user } = renderApp("/settings");

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(calls).toBe(1);
  });

  it("AUTH-14 stays on the page and shows nothing when logout fails", async () => {
    loggedIn();
    let calls = 0;
    server.use(
      http.post("/api/auth/logout", () => {
        calls += 1;
        return HttpResponse.json({ error: "Something went wrong" }, { status: 500 });
      }),
    );
    const { router, user } = renderApp("/settings");
    const logOut = await screen.findByRole("button", { name: "Log out" });
    const before = document.body.textContent;

    await user.click(logOut);
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(logOut).toBeEnabled());

    expect(router.state.location.pathname).toBe("/settings");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body.textContent).toBe(before);
  });

  it("AUTH-21 shows the short commit at the bottom with the full commit on request", async () => {
    const sha = "0bf2e92a1c3d4e5f60718293a4b5c6d7e8f90123";
    vi.stubEnv("VITE_COMMIT_SHA", sha);
    loggedIn();
    renderApp("/settings");

    const version = await screen.findByText("0bf2e92");
    expect(version).toHaveAttribute("title", sha);
  });

  it("AUTH-21 shows dev when the build has no commit", async () => {
    // Hermetic: vite.config.ts bakes process.env.COMMIT_SHA at test time.
    vi.stubEnv("VITE_COMMIT_SHA", "dev");
    loggedIn();
    renderApp("/settings");
    expect(await screen.findByText("dev")).toHaveAttribute("title", "dev");
  });
});

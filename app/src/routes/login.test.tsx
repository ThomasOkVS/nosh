import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../test/msw";
import { renderApp } from "../../test/render";

const login = (resolver: Parameters<typeof http.post>[1]) =>
  server.use(http.post("/api/auth/login", resolver));

async function fillAndSubmit(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(await screen.findByLabelText("Username"), "Thomas");
  await user.type(screen.getByLabelText("Password"), "s3cret pass");
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("login screen", () => {
  it("AUTH-07 asks for username and password only and submits them", async () => {
    let body: unknown;
    login(async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(owner);
    });
    const { user } = renderApp("/login");

    await screen.findByLabelText("Username");
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    await fillAndSubmit(user);
    await screen.findByRole("heading", { name: "Library" });
    expect(body).toEqual({ username: "Thomas", password: "s3cret pass" });
  });

  it("AUTH-20 marks the fields for password managers", async () => {
    renderApp("/login");
    expect(await screen.findByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("AUTH-18 disables the button and relabels it while pending", async () => {
    const answer = deferred();
    login(async () => {
      await answer.promise;
      return HttpResponse.json(owner);
    });
    const { user } = renderApp("/login");

    await fillAndSubmit(user);
    expect(await screen.findByRole("button", { name: "Logging in…" })).toBeDisabled();

    answer.resolve();
    await screen.findByRole("heading", { name: "Library" });
  });

  it("AUTH-09 AUTH-18 shows the server's message in a focused alert", async () => {
    login(() => HttpResponse.json({ error: "Invalid username or password" }, { status: 401 }));
    const { user } = renderApp("/login");

    await fillAndSubmit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid username or password");
    expect(alert).toHaveFocus();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("AUTH-18 shows a generic message when the network fails", async () => {
    login(() => HttpResponse.error());
    const { user } = renderApp("/login");

    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("AUTH-18 links to sign-up", async () => {
    renderApp("/login");
    const link = await screen.findByRole("link", { name: "Sign up" });
    expect(link).toHaveAttribute("href", "/signup");
    expect(link.parentElement).toHaveTextContent("No account? Sign up");
  });

  it("AUTH-16 returns to the requested address, query included", async () => {
    login(() => HttpResponse.json(owner));
    const target = "/recipes/new?importId=5";
    const { user, visited } = renderApp(`/login?redirect=${encodeURIComponent(target)}`);

    await fillAndSubmit(user);
    await waitFor(() => expect(visited).toContain(target));
    await screen.findByRole("heading", { name: "Library" });
  });

  it("AUTH-16 lands on the home page when login was opened directly", async () => {
    login(() => HttpResponse.json(owner));
    const { user, router } = renderApp("/login");

    await fillAndSubmit(user);
    await screen.findByRole("heading", { name: "Library" });
    expect(router.state.location.href).toBe("/");
  });

  it.each(["https://evil.example", "/\t/evil.example"])(
    "AUTH-16 ignores a redirect to another site (%j)",
    async (target) => {
      login(() => HttpResponse.json(owner));
      const { user, router, visited } = renderApp(`/login?redirect=${encodeURIComponent(target)}`);

      await fillAndSubmit(user);
      await screen.findByRole("heading", { name: "Library" });
      expect(router.state.location.href).toBe("/");
      expect(visited.filter((href) => !href.startsWith("/login"))).toEqual(["/"]);
    },
  );
});

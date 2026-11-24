import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { deferred, owner, server } from "../../test/msw";
import { renderApp } from "../../test/render";

const signup = (resolver: Parameters<typeof http.post>[1]) =>
  server.use(http.post("/api/auth/signup", resolver));

async function fillAndSubmit(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(await screen.findByLabelText("Username"), "thomas");
  await user.type(screen.getByLabelText("Password"), "s3cret pass");
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("sign-up screen", () => {
  it("AUTH-01 asks for username and password only and lands on home", async () => {
    let body: unknown;
    signup(async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(owner, { status: 201 });
    });
    const { user, router } = renderApp("/signup");

    await screen.findByLabelText("Username");
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    await fillAndSubmit(user);
    await screen.findByRole("heading", { name: "Library" });
    expect(router.state.location.href).toBe("/");
    expect(body).toEqual({ username: "thomas", password: "s3cret pass" });
  });

  it("AUTH-18 constrains the username and explains the rules", async () => {
    renderApp("/signup");
    const username = await screen.findByLabelText("Username");
    expect(username).toHaveAttribute("minLength", "3");
    expect(username).toHaveAttribute("maxLength", "32");
    expect(username).toHaveAccessibleDescription("Letters, numbers, and underscores only.");
  });

  it("AUTH-20 marks the fields for password managers", async () => {
    renderApp("/signup");
    expect(await screen.findByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("AUTH-18 disables the button and relabels it while pending", async () => {
    const answer = deferred();
    signup(async () => {
      await answer.promise;
      return HttpResponse.json(owner, { status: 201 });
    });
    const { user } = renderApp("/signup");

    await fillAndSubmit(user);
    expect(await screen.findByRole("button", { name: "Creating account…" })).toBeDisabled();

    answer.resolve();
    await screen.findByRole("heading", { name: "Library" });
  });

  it("AUTH-02 AUTH-18 shows a refused sign-up in a focused alert", async () => {
    signup(() =>
      HttpResponse.json({ error: "Sign-ups are disabled on this server" }, { status: 403 }),
    );
    const { user } = renderApp("/signup");

    await fillAndSubmit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-ups are disabled on this server");
    expect(alert).toHaveFocus();
  });

  it("AUTH-18 links to login", async () => {
    renderApp("/signup");
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });
});

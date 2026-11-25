import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { owner, server } from "../../test/msw";
import { renderApp } from "../../test/render";

function linksTo(href: string) {
  return screen.getAllByRole("link").filter((link) => link.getAttribute("href") === href);
}

describe("app navigation", () => {
  it.each([
    ["/", "Library"],
    ["/settings", "Settings"],
  ])("AUTH-24 from %s, Home and Settings are one control away", async (path, heading) => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json(owner)));
    renderApp(path);
    await screen.findByRole("heading", { level: 1, name: heading });

    expect(linksTo("/")).toHaveLength(1);
    expect(linksTo("/")[0]).toHaveAccessibleName("Library");
    expect(linksTo("/settings")).toHaveLength(1);
    expect(linksTo("/settings")[0]).toHaveAccessibleName("Settings");
    expect(screen.getByRole("link", { name: "New recipe or import" })).toBeInTheDocument();
  });

  it("AUTH-24 marks the Library as the current screen only on the library", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json(owner)));
    const { user } = renderApp("/");
    await screen.findByRole("heading", { level: 1, name: "Library" });
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "Settings" }));
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
  });
});

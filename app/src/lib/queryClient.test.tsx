import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { createQueryClient, setOnUnauthorized } from "@/lib/queryClient";
import { recipesQuery } from "@/recipes/api";
import { deferred, owner, server } from "../../test/msw";
import { renderApp } from "../../test/render";

const me = () => server.use(http.get("/api/auth/me", () => HttpResponse.json(owner)));

describe("query client", () => {
  it("AUTH-12 AUTH-16: a 401 from any data call sends the owner to login, returning here afterwards", async () => {
    me();
    server.use(
      http.get("/api/recipes", () =>
        HttpResponse.json({ error: "Not authenticated" }, { status: 401 }),
      ),
    );
    const { router, queryClient } = renderApp("/settings");
    await screen.findByRole("button", { name: "Log out" });

    await expect(queryClient.fetchQuery(recipesQuery)).rejects.toMatchObject({ status: 401 });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.href).toBe("/login?redirect=%2Fsettings");
  });

  it("AUTH-09: a 401 from login itself stays on the login form with its message", async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({ error: "Not authenticated" }, { status: 401 })),
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: "Invalid username or password" }, { status: 401 }),
      ),
    );
    const { router, visited, user } = renderApp("/login");
    await user.type(await screen.findByLabelText("Username"), "Thomas");
    await user.type(screen.getByLabelText("Password"), "wrong pass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();
    expect(router.state.location.href).toBe("/login");
    expect(visited.filter((href) => href.includes("redirect"))).toEqual([]);
  });

  it("AUTH-14: logging out empties the query cache", async () => {
    me();
    server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { queryClient, user } = renderApp("/settings");
    queryClient.setQueryData(["recipes"], [{ id: 1 }]);

    await user.click(await screen.findByRole("button", { name: "Log out" }));
    await screen.findByLabelText("Username");

    expect(queryClient.getQueryData(["recipes"])).toBeUndefined();
  });

  it("AUTH-09: a 401 from a request marked authRequest does not trigger the redirect handler", async () => {
    const spy = vi.fn();
    const off = setOnUnauthorized(spy);
    const client = createQueryClient({ test: true });
    const fail = () => Promise.reject(new ApiError("Invalid username or password", 401));
    const run = (meta?: { authRequest?: boolean }) =>
      client.getMutationCache().build(client, { mutationFn: fail, meta }).execute(undefined).catch(() => {});

    await run({ authRequest: true });
    expect(spy).not.toHaveBeenCalled();

    await run();
    expect(spy).toHaveBeenCalledTimes(1);
    off();
  });

  it("AUTH-12 AUTH-14: a 401 empties the recipe cache", async () => {
    const off = setOnUnauthorized(() => {});
    const client = createQueryClient({ test: true });
    client.setQueryData(["recipes"], [{ id: 1 }]);

    await client
      .fetchQuery({
        queryKey: ["other"],
        queryFn: () => Promise.reject(new ApiError("Not authenticated", 401)),
      })
      .catch(() => {});

    expect(client.getQueryData(["recipes"])).toBeUndefined();
    expect(client.getQueryData(["session"])).toBeNull();
    off();
  });

  it("AUTH-07 AUTH-14: a successful login empties what an earlier account left in the cache", async () => {
    // The library asks for the new account's recipes; hold that answer so the
    // cache shows only whether the earlier account's list survived the login.
    const answer = deferred();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(owner)),
      http.post("/api/auth/login", () => HttpResponse.json(owner)),
      http.get("/api/recipes", async () => {
        await answer.promise;
        return HttpResponse.json([]);
      }),
    );
    const { queryClient, user } = renderApp("/login");
    queryClient.setQueryData(["recipes"], [{ id: 1 }]);
    await user.type(await screen.findByLabelText("Username"), "Thomas");
    await user.type(screen.getByLabelText("Password"), "s3cret pass");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("heading", { name: "Library" });
    expect(queryClient.getQueryData(["recipes"])).toBeUndefined();
    answer.resolve();
  });
});

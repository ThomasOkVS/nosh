import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FAKE_PNG } from "./test/images";
import { createTestApp } from "./test/app";

/**
 * The guarantees nosh needs once it's reachable from the public internet —
 * see docs/decisions.md's "Public HTTPS behind Caddy" entry. Grouped here
 * rather than per-route because they're app-wide policies, not route logic.
 */

const NEW_ORIGIN = "https://nosh.itsthomassito.com";
const TAILNET_ORIGIN = "http://homelab.tail43ff2b.ts.net:8080";
const ORIGINS = [NEW_ORIGIN, TAILNET_ORIGIN];

async function createUser(username: string, password = "correct-horse"): Promise<void> {
  await request(createTestApp())
    .post("/auth/signup")
    .send({ email: `${username}@example.com`, username, password });
}

function sessionCookie(res: request.Response): string {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith("connect.sid="));
  if (!cookie) throw new Error("no session cookie was set");
  return cookie;
}

function cookieAttributes(cookie: string): string[] {
  return cookie
    .split(";")
    .slice(1)
    .map((part) => part.trim().split("=")[0]!.toLowerCase());
}

describe("origin check on state-changing requests", () => {
  const app = (): Express => createTestApp({ frontendOrigins: ORIGINS });

  it.each([[NEW_ORIGIN], [TAILNET_ORIGIN]])(
    "accepts a POST from configured origin %s",
    async (origin) => {
      const res = await request(app()).post("/auth/logout").set("Origin", origin);
      expect(res.status).toBe(204);
    },
  );

  it.each([
    ["https://evil.example"],
    ["https://mc-map.itsthomassito.com"], // a sibling subdomain is still another origin
    ["http://nosh.itsthomassito.com"], // scheme matters
    ["https://nosh.itsthomassito.com:443"], // browsers never send the default port
    ["null"], // sandboxed iframe / privacy-redirected
  ])("rejects a POST from %s", async (origin) => {
    const res = await request(app()).post("/auth/logout").set("Origin", origin);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Request origin not allowed" });
  });

  it.each([["cross-site"], ["same-site"]])(
    "rejects a POST with no Origin but Sec-Fetch-Site: %s",
    async (site) => {
      const res = await request(app()).post("/auth/logout").set("Sec-Fetch-Site", site);
      expect(res.status).toBe(403);
    },
  );

  it.each([["same-origin"], ["none"]])(
    "accepts a POST with no Origin and Sec-Fetch-Site: %s",
    async (site) => {
      const res = await request(app()).post("/auth/logout").set("Sec-Fetch-Site", site);
      expect(res.status).toBe(204);
    },
  );

  it("accepts a POST with neither header (a non-browser client like curl)", async () => {
    const res = await request(app()).post("/auth/logout");
    expect(res.status).toBe(204);
  });

  it("doesn't apply to safe methods — same-origin GETs carry no Origin, foreign ones can't change state", async () => {
    const res = await request(app()).get("/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
  });

  it("applies to PUT, PATCH and DELETE too", async () => {
    for (const method of ["put", "patch", "delete"] as const) {
      const res = await request(app())[method]("/recipes/1").set("Origin", "https://evil.example");
      expect(res.status).toBe(403);
    }
  });

  it("answers CORS for each configured origin (the tailnet setup calls the API cross-origin)", async () => {
    for (const origin of ORIGINS) {
      const res = await request(app()).get("/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    }
    const foreign = await request(app()).get("/health").set("Origin", "https://evil.example");
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("session cookie attributes", () => {
  async function login(app: Express, headers: Record<string, string> = {}): Promise<string> {
    await createUser("cookieuser");
    const res = await request(app)
      .post("/auth/login")
      .set(headers)
      .send({ username: "cookieuser", password: "correct-horse" });
    expect(res.status).toBe(200);
    return sessionCookie(res);
  }

  it("is HttpOnly, SameSite=Lax, Path=/ and has no Domain", async () => {
    const cookie = await login(createTestApp());
    const attributes = cookieAttributes(cookie);

    expect(attributes).toContain("httponly");
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\/(;|$)/);
    expect(attributes).not.toContain("domain");
  });

  it("is Secure when a trusted proxy says the request was HTTPS", async () => {
    const app = createTestApp({ trustedProxies: ["loopback"] });
    const cookie = await login(app, { "X-Forwarded-Proto": "https" });
    expect(cookieAttributes(cookie)).toContain("secure");
  });

  it("is not Secure over plain HTTP, so the tailnet origin keeps working during the move", async () => {
    const app = createTestApp({ trustedProxies: ["loopback"] });
    const cookie = await login(app, { "X-Forwarded-Proto": "http" });
    expect(cookieAttributes(cookie)).not.toContain("secure");
  });

  it("ignores X-Forwarded-Proto from a peer that isn't a trusted proxy", async () => {
    const app = createTestApp({ trustedProxies: [] });
    const cookie = await login(app, { "X-Forwarded-Proto": "https" });
    expect(cookieAttributes(cookie)).not.toContain("secure");
  });
});

describe("signup switch", () => {
  it("refuses signup when disabled, and creates no account", async () => {
    const app = createTestApp({ allowSignup: false });

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "mallory@example.com", username: "mallory", password: "correct-horse" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Sign-ups are disabled on this server" });
    expect(sessionCookieOrNull(res)).toBeNull();

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ username: "mallory", password: "correct-horse" });
    expect(loginRes.status).toBe(401);
  });

  it("still lets existing users log in when disabled", async () => {
    await createUser("existing");
    const res = await request(createTestApp({ allowSignup: false }))
      .post("/auth/login")
      .send({ username: "existing", password: "correct-horse" });
    expect(res.status).toBe(200);
  });
});

function sessionCookieOrNull(res: request.Response): string | null {
  try {
    return sessionCookie(res);
  } catch {
    return null;
  }
}

// Each attempt is a real argon2 verification, ~20 per test — slow under CPU
// contention (e.g. when the frontend suite runs in parallel), so these get
// more than vitest's 5s default.
describe("login rate limiting", { timeout: 30_000 }, () => {
  const attempt = (app: Express, username: string, password: string, clientIp?: string) => {
    const req = request(app).post("/auth/login");
    if (clientIp) req.set("X-Forwarded-For", clientIp);
    return req.send({ username, password });
  };

  it("locks an account after 10 failures, even spread across many IPs", async () => {
    await createUser("victim");
    const app = createTestApp({ trustedProxies: ["loopback"] });

    for (let i = 0; i < 10; i++) {
      expect((await attempt(app, "victim", "wrong", `203.0.113.${i + 1}`)).status).toBe(401);
    }
    const locked = await attempt(app, "victim", "correct-horse", "203.0.113.50");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("clears an account's failure count on a successful login", async () => {
    await createUser("forgetful");
    const app = createTestApp({ trustedProxies: ["loopback"] });

    for (let i = 0; i < 9; i++) await attempt(app, "forgetful", "wrong", `203.0.113.${i + 1}`);
    expect((await attempt(app, "forgetful", "correct-horse", "198.51.100.1")).status).toBe(200);
    for (let i = 0; i < 9; i++) await attempt(app, "forgetful", "wrong", `203.0.113.${i + 20}`);
    expect((await attempt(app, "forgetful", "correct-horse", "198.51.100.2")).status).toBe(200);
  });

  it("limits each client IP (as reported by the trusted proxy) separately", async () => {
    const app = createTestApp({ trustedProxies: ["loopback"] });

    for (let i = 0; i < 20; i++) await attempt(app, `nobody${i}`, "wrong", "203.0.113.7");
    expect((await attempt(app, "nobody99", "wrong", "203.0.113.7")).status).toBe(429);
    expect((await attempt(app, "nobody99", "wrong", "203.0.113.8")).status).toBe(401);
  });

  it("ignores X-Forwarded-For from an untrusted peer, so it can't be spoofed to dodge the limit", async () => {
    const app = createTestApp({ trustedProxies: [] });

    for (let i = 0; i < 20; i++) await attempt(app, `nobody${i}`, "wrong", `203.0.113.${i + 1}`);
    expect((await attempt(app, "nobody99", "wrong", "203.0.113.200")).status).toBe(429);
  });
});

describe("per-user import limit", () => {
  it("rejects imports past 30 an hour for one user", async () => {
    const app = createTestApp();
    const agent = request.agent(app);
    await agent
      .post("/auth/signup")
      .send({ email: "heavy@example.com", username: "heavy", password: "correct-horse" });

    // An invalid body still counts — the limit guards the endpoint, and is
    // checked before any work is done.
    for (let i = 0; i < 30; i++) expect((await agent.post("/import").send({})).status).toBe(400);
    expect((await agent.post("/import").send({})).status).toBe(429);
  });

  it("requires login", async () => {
    const res = await request(createTestApp()).post("/import").send({ url: "https://example.com" });
    expect(res.status).toBe(401);
  });
});

describe("uploaded file type is checked by content, not by the declared type", () => {
  async function uploadAs(file: Buffer, contentType: string): Promise<number> {
    const app = createTestApp();
    const agent = request.agent(app);
    await agent
      .post("/auth/signup")
      .send({ email: "uploader@example.com", username: "uploader", password: "correct-horse" });
    const recipe = await agent.post("/recipes").send({
      title: "Soup",
      description: null,
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [],
      steps: [],
      tags: [],
      collectionId: null,
    });
    const res = await agent
      .post(`/recipes/${recipe.body.id}/images`)
      .attach("image", file, { filename: "photo", contentType });
    return res.status;
  }

  it("rejects HTML declared as image/png", async () => {
    expect(await uploadAs(Buffer.from("<html><script>alert(1)</script></html>"), "image/png")).toBe(
      400,
    );
  });

  it("rejects a PNG declared as image/jpeg (it would be served under the wrong type)", async () => {
    expect(await uploadAs(FAKE_PNG, "image/jpeg")).toBe(400);
  });

  it("accepts a PNG declared as image/png", async () => {
    expect(await uploadAs(FAKE_PNG, "image/png")).toBe(201);
  });
});

describe("error responses", () => {
  it("returns 400, not 500, for a malformed JSON body — without echoing it", async () => {
    const res = await request(createTestApp())
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"username": "x", ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request" });
  });

  it("returns JSON for an unknown route rather than Express's HTML page", async () => {
    const res = await request(createTestApp()).get("/no/such/route");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("doesn't advertise the framework", async () => {
    const res = await request(createTestApp()).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.body).toEqual({ status: "ok" });
  });
});

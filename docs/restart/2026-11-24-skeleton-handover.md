# nosh restart: handover for skeleton + auth (2026-11-24)

Start the next session here. This file replaces
[2026-11-24-task5-handover.md](2026-11-24-task5-handover.md).

Suggested opener:

> Read `docs/restart/2026-11-24-skeleton-handover.md`, then write the
> skeleton + auth plan.

## Where things stand

| What | State |
|---|---|
| Design | Approved: [restart design](../superpowers/specs/2026-11-24-nosh-restart-design.md). |
| Spec | Approved: [nosh-v2](../superpowers/specs/nosh-v2/index.md), 9 areas, 330 criteria. |
| Archive | v1 is on tag `legacy-v1` and branch `legacy` (`5f58bc3`). Use them for lookups only. |
| `main` | Wiped in PR #28. It now holds the lean `CLAUDE.md`, the docs, and the agents/skills config. There is no app code and no CI yet. |
| Production | v1 still runs and was untouched by the wipe. Image digests before and after: frontend `sha256:281959d6…`, backend `sha256:d093f1bb…`. |
| SSH | `ssh homelab` now prompts instead of being denied (PR #29). Ask the owner before each use and stay read-only. |

## Next: the skeleton + auth plan

This is build step 1 of design §8. Write the plan with
`superpowers:writing-plans`, then execute it, preferably subagent-driven.
Build plans cite criterion IDs, and nobody plans the whole project up
front.

**The skeleton** (design §8):
- A one-container build: Hono on Node 22 serving the API and the built Vite
  SPA.
- Drizzle wired up with a first migration.
- A health endpoint.
- Vitest and Playwright running in CI.
- A Dockerfile that ships yt-dlp.
- The style tokens: DM Serif Display / DM Sans, the P4 colours, the motion
  constants.
- The app shell with the bottom pill (Library + mustard "+") and settings
  top-right.
- Login working end to end.

**Criteria to cover:**
- `auth.md`: AUTH-01…AUTH-24, of which AUTH-22 is struck.
- `security.md`: SEC-01…SEC-60.

Not every SEC criterion fits the skeleton; many (SSRF, import limits, push)
belong to later groups. The plan should say which SEC IDs it covers now and
which group owns the rest.

**Do these first, in this order:**
1. **Fix the `shadcn` CLI / pnpm problem on Windows** (design §3) before you
   scaffold anything. Things to try:
   - `npx shadcn@latest` from PowerShell.
   - A different pnpm install method.
   - Setting `npm_config_user_agent`.

   If none works, fall back to the registry JSON at
   `https://ui.shadcn.com/r/styles/base-nova/<name>.json`.
2. **Run the Better Auth fit check** (design §6) and make it the plan's first
   task, test first. Requirements:
   - Login is by username. The format rules apply at sign-up only (Q1).
   - Usernames are case-insensitive (Q2).
   - Accounts may have no email; sign-up asks for username and password only
     (Q19).
   - v1 argon2 hashes must verify (AUTH-08).

   The likely route is the username plugin plus custom
   `password.hash`/`verify`. If that can't be done cleanly, fall back to
   hand-rolled sessions and record the reason in `docs/decisions.md`.

**Security that lands with the skeleton:**
- A `__Host-` session cookie that is HttpOnly and SameSite.
- An origin check on state-changing requests.
- Rate limits on login and sign-up, keyed by the client IP. The client IP
  comes from `X-Forwarded-For` only when the request comes from the trusted
  proxy, which is Caddy (SEC-13, SEC-14).
- Sign-up off by default.
- Production refuses to start without a session secret (SEC-57).
- `nosniff` and `Referrer-Policy: same-origin` on every response (SEC-60).

**Deploy:** deploy the skeleton next to v1 early, on its own subdomain or
port behind Caddy, so the real topology gets exercised. Then:
- Write `docs/deployment.md`.
- Check whether Caddy appends to `X-Forwarded-For` or overwrites it.
- Each production step needs the owner's yes at that moment.

**Two CI traps:**
- The new CI must not publish to `ghcr.io/thomasokvs/nosh-frontend` or
  `nosh-backend`. Watchtower on the box pulls those tags and would replace
  v1. Publish under a new image name.
- The kept `.github/workflows/claude-build.yml` runs lint/test/build for
  the old layout. Update it once the skeleton's commands exist.

## Working rules

- **Worktrees only:** work in `.claude/worktrees/<name>`, never in the main
  checkout.
- **Tests cite criterion IDs.** Write them red-green. Port only the pure-logic
  tests from `legacy`: units, quantity/temperature formatting, ingredient-line
  parsing.
- **Look:** design §7 and [style-log.md](style-log.md) win over any design
  plugin. The style prototype runs with the `style-spike` launch entry on
  `http://localhost:5199`, rounds 1–7.
- **Owner's yes:** every push, PR, merge and production action needs it.
- **Spec checker:** it now needs a legacy checkout, run with
  `--repo <dir>` (see `CLAUDE.md`). Its unit test has one known Windows
  failure, which is logged in `docs/backlog.md`.

## After skeleton + auth

The build order from there (design §8): recipes → collections → search →
units and scaling → import jobs → PWA and push → settings. Then the
one-time importer and the cutover (design §11). Each feature group gets its
own plan. [docs/backlog.md](../backlog.md) tracks all of this.

## Loose ends in the owner's checkout (not blocking)

- `backend/`, `frontend/` and `packages/` still hold git-ignored build
  output, `node_modules` and `backend/uploads`. The owner removes them.
- About 15 old local `feat/*` and `claude/*` branches from v1 work remain.

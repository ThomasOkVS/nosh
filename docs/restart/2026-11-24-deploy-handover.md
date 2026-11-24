# nosh restart: handover after the skeleton deploy (2026-11-24)

Start the next session here. This file replaces
[2026-11-24-pr31-handover.md](2026-11-24-pr31-handover.md).

Suggested opener:

> Read `docs/restart/2026-11-24-deploy-handover.md`, then start the recipes
> group: brainstorm first.

## Where things stand

| What | State |
|---|---|
| Skeleton + auth | Plan [2026-11-24-skeleton-auth.md](../superpowers/plans/2026-11-24-skeleton-auth.md): all tasks done. Tasks 0–11 merged in ThomasOkVS/nosh#31; Task 12 (the deploy) in ThomasOkVS/nosh#33. |
| Production | **v2 is live at `https://nosh.itsthomassito.com`** (Dockge stack `/opt/nosh-v2`). The owner chose to give v2 the real hostname straight away. v1 (`/opt/nosh`) is stopped, and its data is kept for the importer. See [deployment.md](../deployment.md). |
| Owner's account | Created on v2. Signup is off again (403 checked). |
| Deploys | Watchtower pulls `ghcr.io/thomasokvs/nosh:main` nightly at 04:00. The app migrates on start, so **every merge to `main` is live, and migrated, the next morning**. |
| GitHub | `main` is protected: the `check` and `image` jobs are required. The repo allows auto-merge. |

## Next, in order

### 1. Quick checks and small follow-ups

- **SEC-08 is not verified in production yet.** Ask the owner to log in and reload. Staying logged in means the `__Host-nosh.sid` cookie works over HTTPS. Then note it in `docs/deployment.md`.
- **CLAUDE.md line 13** still says "Better Auth for accounts". It should say hand-rolled sessions with argon2 and point at the decisions entry. CLAUDE.md is owner-governed, so ask first.
- **The Settings screen pill** has no active option. This is a design question for the owner.
- **`tsx` as a server devDependency** was refused, so `pnpm dev` builds the server once and doesn't watch for changes.

### 2. The recipes group (design §8, first feature group)

Run one superpowers cycle: brainstorm → plan (`superpowers:writing-plans`) → red-green TDD → review. The recipes group owns:

- recipe CRUD and the list and detail screens, per the spec in `docs/superpowers/specs/nosh-v2/`;
- SEC-22, SEC-24 and SEC-25;
- the shared SSRF fetch guard, SEC-31 to SEC-42.

Carry these into its plan:

- **The empty state looks really bad.** The owner flagged this after creating the account: a new user lands on a bare screen. The recipe list's empty state is the natural fix, designed to design §7 and the style log. It is in the backlog under Fixes.
- **An app-wide 401 handler** that clears the session and goes to login. Noted by the skeleton's final review.
- **Clearing the TanStack Query cache on logout.** Also noted by that review.

After recipes, the build order is: collections → search → units and scaling → import jobs → PWA and push → settings → importer.

### 3. Before anything fetches URLs

v2's subnet `10.102.0.0/24` is not in the host firewall's egress sandbox. That sandbox is `SANDBOX_NETS` in the box's `/opt/HOST.md`, and changing it needs `sudo`. The container is also on Caddy's `proxy` network, so check which network its outbound traffic actually leaves through. Do this before the first feature that fetches a URL ships to `main`, since Watchtower deploys it overnight. This is in the backlog.

### 4. Before the v1 import

- Look at the Watchtower label on `nosh-v2` again: automatic updates mean unattended migrations on real data. This is in the backlog.
- Before any migration that changes or drops data, run `pg_dump` and deploy that image by hand. [deployment.md](../deployment.md) has the commands.

## Useful context

- **Box access:**
  - `ssh homelab` works with key auth, and the owner allows the SSH calls.
  - The project settings deny `scp` and `curl`. Copy files with `ssh homelab 'cat > /path' < file`, and run HTTP checks with Node's `fetch`. The owner approved both.
  - Never read or print a `.env` value on the box.
- **Box docs:** read `/opt/nosh-v2/CLAUDE.md` before changing the stack. `/opt` is a local-only git repo: commit there, never push. A new top-level directory under `/opt` becomes a Dockge stack.
- **Logs:** recreating the app container drops its request log. Read the logs before recreating.
- **iPhone:** a phone that had v1 installed keeps v1's service worker until the home-screen app is deleted and Safari's website data for the site is cleared. This matters again in the PWA and push group: the v2 worker should live at a path that replaces or unregisters the old `/sw.js`.
- **Shared package:** the `source` export condition is used for tsc, Vitest and Vite; `dist` is used for plain Node and Docker. See `docs/decisions.md`.
- **Dev database:** `docker compose -f compose.dev.yml up -d`, on port 5433.
- **Lockout trade-off:** the automated security scan flagged that guessing can lock the owner out (SEC-18). The spec accepts this trade-off.

## Working rules

The same as before:

- Use worktrees only.
- Tests cite criterion IDs and are written red first.
- Design §7 and the style log win on look.
- Every push, PR and production action needs the owner's yes.

Once the owner has said yes to a PR, turn on Auto-fix and auto-merge (merge commit) without asking again.

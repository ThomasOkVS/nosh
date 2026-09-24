# Deployment

Status: **live since 2026-08-19.** This doc reflects the actual first
deployment, done from a separate Claude Code session running directly on the
target box (which caught and corrected a few assumptions below that turned
out to be wrong for the real environment — noted inline).

## Target environment

| Aspect | Details |
|---|---|
| **Hardware** | HP ProDesk 400 G5 — i5-9500T, 8GB DDR4, 2TB Samsung 970 EVO Plus |
| **OS** | Ubuntu Server (Docker + Docker Compose). Previously ZimaOS — the box was migrated before Nosh's first deploy, which is why anything below phrased as "ZimaOS convention" no longer applies. |
| **Container management** | Dockge (stacks root is `/opt` itself on this box, not `/opt/stacks` — verify per-target with `docker inspect <dockge-container> --format '{{json .Mounts}}'` rather than assuming) |
| **Monitoring** | Beszel (resource metrics), Dozzle (log viewer) |
| **Backups** | Kopia, homelab-wide 3-2-1 |
| **Updates** | Watchtower, homelab-wide |
| **Networking** | Moving from Tailscale-only to public HTTPS at `https://nosh.itsthomassito.com` behind the homelab's Caddy — see "Public HTTPS cutover" below |

These are existing homelab services shared across everything running on the box,
not things Nosh needs to set up itself.

## Directory layout

All Nosh data lives under a single root, `/opt/nosh/` — one root makes the
Kopia backup and any future restore a single-path operation, and keeps
Nosh's disk I/O isolated from other services. (Originally written as
`/DATA/nosh/` on the assumption of ZimaOS's convention; the actual target
turned out to be Ubuntu Server with no `/DATA` at all. `/opt/nosh/` gets the
same single-path property for free on this box, since Dockge's stacks — and
Kopia's backup sweep — both already root at `/opt`. On a future retarget to
a different box, re-derive this from wherever *that* box's Dockge/Kopia
actually root, not from either `/DATA` or `/opt` by default.)

## Networking

**Target (2026-09-24 onward):**

```
browser ──HTTPS──▶ Caddy (proxy network, 172.28.255.2; TLS, HSTS)
                     │ reverse_proxy frontend:8080
                     ▼
                   frontend nginx :8080 (edge network, fixed 10.101.0.10)
                     ├── /       → the built SPA
                     └── /api/*  → strip /api → backend:3001
                                               │
                                   backend (edge + default) ── postgres (default)
```

- Only the **frontend** joins Caddy's `proxy` network. The backend never
  does, because that network can reach dockge and other admin UIs.
- nginx trusts `X-Forwarded-For` and `X-Forwarded-Proto` only from Caddy's
  IP. It overwrites both before passing them on.
- The backend trusts those headers only from the frontend's fixed IP
  (`TRUSTED_PROXIES`).
- That chain is how the backend learns the real client IP (for rate limits)
  and whether the request was HTTPS (for the cookie's `Secure` flag). The
  reasoning is in
  [decisions.md](decisions.md#2026-09-24-public-https-behind-caddy).

**Before the cutover:** Tailscale only. The frontend was at
`http://homelab.tail43ff2b.ts.net:8080`, and the browser called the backend
directly on host port `3101`. That keeps working until it's retired (see
below).

## Monitoring

Beszel and Dozzle already monitor every container on the box, so Nosh's
containers are covered automatically once deployed — no extra integration
work needed.

## Backups

Kopia's existing homelab-wide 3-2-1 backup sweeps `/opt` (confirmed by
reading the Kopia stack's own compose file, not assumed), which includes
Nosh's PostgreSQL volume and `.env` since both live under `/opt/nosh`. No
Nosh-specific backup tooling is needed — see the (deprioritized-for-now)
backup discussion in [decisions.md](decisions.md).

## Updates / CD

Watchtower already runs homelab-wide and pulls new images on a schedule. Once
Nosh publishes images to a registry (e.g. GHCR) via CI, Watchtower picks up new
versions automatically — this is the pull-based auto-update mechanism referenced
in [decisions.md](decisions.md), confirmed rather than needing a separate
self-hosted GitHub Actions runner.

## Security notes

- Secrets (DB password, API keys) live in `.env`, which git ignores.
- No default passwords. Every service is configured through `.env`.
- Once public, Nosh's own auth is the only access control. It rests on:
  - signup off by default (`ALLOW_SIGNUP`);
  - rate-limited login and import;
  - an `Origin` check on every state-changing request;
  - an SSRF guard on every server-side fetch of a user-supplied URL.

  Details: [decisions.md](decisions.md#2026-09-24-public-https-behind-caddy).
- **Recommended defense in depth (homelab side):** block egress from nosh's
  Docker networks to the host and the LAN. For example, a `DOCKER-USER`
  iptables rule that drops traffic from the nosh subnets to RFC1918 and
  CGNAT destinations.
  - The app's SSRF guard covers every fetch the backend makes itself.
  - It can't cover `yt-dlp`, which does its own networking. yt-dlp is limited
    to Instagram's and TikTok's own extractors, but a platform open redirect
    could still send it inward.

## Public HTTPS cutover

The frontend image serves `/api` itself, so the **first build that ships
this change keeps the tailnet setup working unchanged.** The old absolute
`VITE_API_URL` is still baked into that build, and browsers still call
`:3101` directly. Nothing below has to coincide with Watchtower's 04:00 run.

The repo's [docker-compose.prod.yml](../docker-compose.prod.yml) is a
reference. The box runs its own copy in `/opt/nosh` (backend host port
`3101`), so apply the network changes there.

### Variables, with this box's production values

| Variable | Value on this box | Notes |
|---|---|---|
| `FRONTEND_ORIGINS` | `https://nosh.itsthomassito.com,http://homelab.tail43ff2b.ts.net:8080` | Both origins during the move, only the first later. No `:443`, no path. The backend refuses to start on a malformed entry. `FRONTEND_ORIGIN` (singular, the old name) is read only when this is unset. |
| `TRUSTED_PROXIES` | `10.101.0.10` | The frontend container's fixed IP on `edge`. Must match `ipv4_address` in the compose file. Empty means trust nobody, which is right for direct `:3101` access. |
| `ALLOW_SIGNUP` | `false` | Turn it on briefly to create an account, then off again. |
| `TAG` | `latest` (or `sha-<7>` to pin) | Every build is tagged `:latest`, `:sha-<7>` and `:<full sha>`. |
| GitHub repo variable `VITE_API_URL` | `/api` (from step 3) | Build-time. Empty or unset also means `/api`. |

### Order

The order matters in one place: **step 2 before step 3.** Once the frontend
calls `/api`, every request reaches the backend from nginx's IP. Without
`TRUSTED_PROXIES` naming that IP, all users would share one login and import
rate-limit bucket.

1. **Merge. Watchtower deploys it overnight.** Nothing changes for users:
   - the backend still reads `FRONTEND_ORIGIN`;
   - the cookie is unchanged over plain HTTP;
   - nginx has an unused `/api` route;
   - there's no migration.

   The one visible change is that **signup closes**, because `ALLOW_SIGNUP`
   defaults to false. Existing accounts keep working.
2. **Network and env** (in `/opt/nosh`):
   - Add the `edge` network, with the frontend at
     `ipv4_address: 10.101.0.10` and the backend on `default` and `edge`, as
     in the reference compose file. Pick another subnet if `10.101.0.0/24`
     is already used on the host or LAN.
   - Set `FRONTEND_ORIGINS` and `TRUSTED_PROXIES` from the table.
   - Run `docker compose up -d`.
   - Check from the host: `curl -s localhost:8080/api/health` returns
     `{"status":"ok"}`.
3. **Flip `VITE_API_URL` to `/api`** and let CI rebuild. The next frontend
   calls `/api` on its own origin, and that works on the tailnet `:8080`
   too.
4. **Caddy:**
   - Put the frontend (and only the frontend) on the `proxy` network.
   - Add `nosh.itsthomassito.com { reverse_proxy frontend:8080 }`.
   - Add `nosh.` to DDNS.
   - Run the checks below.
5. **Later, retire the tailnet origin:**
   - Drop it from `FRONTEND_ORIGINS`.
   - Remove the backend's host port `3101`, and the frontend's `8080` if you
     like.
   - Then do the backlog follow-up (`__Host-` cookie with `secure: true`).

### Verifying the cutover

From any machine, once DNS and Caddy are live:

```bash
H=https://nosh.itsthomassito.com
# Signup refused (403)
curl -si -X POST $H/api/auth/signup -H "Origin: $H" -H 'Content-Type: application/json' \
  -d '{"email":"x@example.com","username":"probe","password":"x"}' | sed -n '1p;$p'
# Login -> Set-Cookie: connect.sid=...; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax (no Domain)
curl -si -c /tmp/nosh.jar -X POST $H/api/auth/login -H "Origin: $H" -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<password>"}' | grep -iE '^HTTP|^set-cookie'
# Authenticated request -> 200 {"id":...,"username":"<user>",...}
curl -s -b /tmp/nosh.jar $H/api/auth/me
# SSRF: the host gateway's dockge port -> {"error":"This URL cannot be imported"} 400
curl -s -w ' %{http_code}\n' -b /tmp/nosh.jar -X POST $H/api/import -H "Origin: $H" \
  -H 'Content-Type: application/json' -d '{"url":"http://172.28.0.1:5001"}'
```

## First-deploy runbook

Prerequisites: images published to GHCR (see [decisions.md](decisions.md) —
CI does this automatically on every merge to `main`), and the homelab box
reachable over Tailscale with Dockge running.

1. **Check the target box for a host-port conflict on the backend's default
   3001 before deciding on `VITE_API_URL`.** This box's actual deploy hit
   one: AdGuard Home's web UI already owned host port 3001, so the backend
   was remapped to `3101:3001` in `docker-compose.prod.yml` (container-side
   stays 3001; only the host-side mapping changed). Don't assume 3001 is
   free on a new target — check running containers' published ports first
   (`docker ps`).
2. **Set the frontend's build-time API URL, once.** `VITE_API_URL` is baked
   into the frontend's static JS at image-build time (Vite has no
   server-side process to read a runtime env var from — see the comment atop
   [frontend/Dockerfile](../frontend/Dockerfile)), so it has to be a GitHub
   Actions repo variable, not a `.env` value: Settings → Secrets and
   variables → Actions → Variables → `VITE_API_URL`, set to the backend's
   real address as the browser will reach it — on this deploy,
   `http://homelab.tail43ff2b.ts.net:3101` (note the remapped port from step
   1, not the container-internal 3001). Re-run the `publish` workflow (or
   push any commit to `main`) after setting it — any image built before
   this is set has the wrong URL baked in. *(Superseded 2026-09-24: the
   frontend's nginx now proxies `/api`, so the target value is the relative
   `/api` on any box — see "Public HTTPS cutover".)*
   - If the target box has no `gh` CLI, no local clone, and no
     GitHub-registered SSH key (all true for this box's first deploy), `gh`
     installs directly from Ubuntu's own apt repo (`apt-get install gh`, no
     need to add GitHub's apt source), and `gh auth login --web`'s
     device-code flow works with **no local browser** — it prints a URL and
     a one-time code that can be approved from any other device (phone,
     laptop) while the target box only needs outbound network access to
     poll GitHub for completion.
3. **Check GHCR package visibility.** The first time each image
   (`nosh-backend`, `nosh-frontend`) is published, GHCR sometimes defaults it
   to private regardless of the repo's own visibility. If Watchtower/`docker
   pull` later fails with a 401/403, go to the package's page on GitHub
   (org/user → Packages) and set visibility to match the repo. (Not hit on
   this deploy — both images pulled fine on the first try.)
4. **Create the data directory** on the homelab box:
   ```bash
   mkdir -p /opt/nosh/postgres /opt/nosh/uploads
   ```
   These are bind mounts, not named Docker volumes, specifically so Kopia's
   existing `/opt`-wide backup sweep picks them up automatically — see
   "Directory layout" above. (Adjust the root if a future target box's
   Dockge/Kopia don't both live under `/opt`.)
5. **Create `.env`** next to `docker-compose.prod.yml` (copy
   [.env.prod.example](../.env.prod.example) and fill in real values —
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, `FRONTEND_ORIGINS`,
   `TRUSTED_PROXIES`, `ALLOW_SIGNUP` — see the variable table under
   "Public HTTPS cutover"). Never commit this file. To create the first
   account, start with `ALLOW_SIGNUP=true`, sign up, then set it back to
   `false` and restart the backend.
   - **Do not set up a second hostname (e.g. a local DNS shortcut) that
     resolves to the frontend.** `FRONTEND_ORIGIN` is an exact match
     (scheme + host + port) enforced by the backend's CORS/cookie check —
     any additional origin will load the page but silently fail login/signup
     there with no visible error. This deploy deliberately skipped adding a
     local DNS shortcut for exactly this reason; Nosh is reached only by the
     one address in `FRONTEND_ORIGIN`. (Since 2026-09-24 the backend takes a
     list, `FRONTEND_ORIGINS`, so a second address is possible — but it
     still has to be listed there, exactly.)
6. **Add the stack in Dockge**, pointing it at `docker-compose.prod.yml` and
   the `.env` from the previous step, then start it. First boot order is
   `postgres` (waits for its own healthcheck) → `backend` → `frontend`.
7. **Run the initial migration** — the image ships the migration runner and
   files, but doesn't run them automatically on startup (a deliberate choice,
   consistent with [dev-commands.md](dev-commands.md)'s dev workflow — a
   migration is a decision to run, not a side effect of a container
   restarting):
   ```bash
   docker compose -f docker-compose.prod.yml exec backend pnpm migrate up
   ```
8. **Health check.** `docker compose -f docker-compose.prod.yml ps` should
   show `backend` and `postgres` as `healthy`. Visit the frontend's address
   in a browser and confirm the login page loads and signup works. (This
   deploy had no browser available on the target box — verified the same
   thing via `curl`: signup → `Set-Cookie` → an authenticated `/auth/me`
   request using that cookie, which exercises the same CORS/cookie path a
   browser would.)

### Update / rollback

Watchtower pulls `nosh-backend:latest`/`nosh-frontend:latest` on its own
schedule once new images land — no action needed for a routine update. A
migration that ships alongside an update still needs the manual
`pnpm migrate up` step above; Watchtower only replaces the running
container, it doesn't run one-off commands inside it.

**A migration that reshapes existing data needs a check, not just a run.**
The first-deploy step above is against an empty database, so nothing there
is at risk — but a later update's migration runs against whatever real data
production has accumulated since. `1700000000010_nest-collections` (added
2026-08-28) is the concrete example: it collapses a recipe that was in more
than one collection down to just one, and the migration was *initially*
written assuming that case couldn't occur in real data — an assumption that
was never actually checked against this box's real database, only against
local seed/demo data. It was fixed to archive the exact pre-migration state
before collapsing anything (`recipe_collections_archive_1700000000010`), so
nothing is destroyed even if the assumption was wrong — see
[decisions.md](decisions.md#2026-08-28-collections-redesigned-as-a-nested-mandatory-hierarchy-becomes-the-home-page)
for the full story. The general lesson for any future migration that
collapses, merges, or drops a relationship rather than just adding a column:
run `pnpm migrate up`, then **before** trusting it, run whatever query the
migration's own comments say to (for this one:
`SELECT recipe_id, COUNT(*) FROM recipe_collections_archive_1700000000010 GROUP BY recipe_id HAVING COUNT(*) > 1;`
— any rows returned name a recipe that had more than one collection and
kept only the lowest id; nothing is lost, but it's now single-collection and
the operator should know that happened).

To roll back, set `TAG` in `.env` to a previous build and run
`docker compose -f docker-compose.prod.yml up -d`. Each image is published as
`:latest`, `:sha-<first 7 chars of the commit>` and `:<full commit sha>`.
The `sha-` tag only exists on builds from 2026-09-24 onward. Older builds
have only the full-SHA tag. This does not reverse a
migration that already ran — check the migration history
(`pgmigrations` table) before rolling back across one.

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
| **Networking** | Tailscale only — no public ingress |

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

Tailscale is the only access path — no public ingress, no reverse proxy or TLS
termination inside Nosh's own containers. See
[architecture.md](architecture.md) for how this shapes the app (e.g. no
app-level rate limiting in v1).

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

- Secrets (DB password, any API keys) live in `.env`, excluded from git.
- No public-facing endpoint — Tailscale is the access boundary.
- No default passwords; every service is configured via `.env`.

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
   this is set has the wrong URL baked in.
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
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, `FRONTEND_ORIGIN`). Never commit
   this file.
   - **Do not set up a second hostname (e.g. a local DNS shortcut) that
     resolves to the frontend.** `FRONTEND_ORIGIN` is an exact match
     (scheme + host + port) enforced by the backend's CORS/cookie check —
     any additional origin will load the page but silently fail login/signup
     there with no visible error. This deploy deliberately skipped adding a
     local DNS shortcut for exactly this reason; Nosh is reached only by the
     one address in `FRONTEND_ORIGIN`.
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

To roll back, set `TAG` in `.env` to a previous build's short git SHA (each
image is published under both `:latest` and `:<sha>` — see
[decisions.md](decisions.md)) and run
`docker compose -f docker-compose.prod.yml up -d`. This does not reverse a
migration that already ran — check the migration history
(`pgmigrations` table) before rolling back across one.

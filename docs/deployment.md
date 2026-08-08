# Deployment

Status: infrastructure is real and already running; Nosh-specific deploy steps
(Compose file, env vars, first-deploy runbook) aren't written yet because the app
doesn't exist yet. Fill those in once the backend/frontend are buildable — don't
guess at them here in the meantime.

## Target environment

| Aspect | Details |
|---|---|
| **Hardware** | HP ProDesk 400 G5 — i5-9500T, 8GB DDR4, 2TB Samsung 970 EVO Plus |
| **OS** | ZimaOS (Docker-native) |
| **Container management** | Dockge |
| **Monitoring** | Beszel (resource metrics), Dozzle (log viewer) |
| **Backups** | Kopia, homelab-wide 3-2-1 |
| **Updates** | Watchtower, homelab-wide |
| **Networking** | Tailscale only — no public ingress |

These are existing homelab services shared across everything running on the box,
not things Nosh needs to set up itself.

## Directory layout

All Nosh data lives under a single root, `/DATA/nosh/`, following ZimaOS
convention — one root makes the Kopia backup and any future restore a
single-path operation, and keeps Nosh's disk I/O isolated from other services.

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

Kopia's existing homelab-wide 3-2-1 backup sweeps `/DATA`, which will include
Nosh's PostgreSQL volume and `.env` once deployed. No Nosh-specific backup
tooling is needed — see the (deprioritized-for-now) backup discussion in
[decisions.md](decisions.md).

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

1. **Set the frontend's build-time API URL, once.** `VITE_API_URL` is baked
   into the frontend's static JS at image-build time (Vite has no
   server-side process to read a runtime env var from — see the comment atop
   [frontend/Dockerfile](../frontend/Dockerfile)), so it has to be a GitHub
   Actions repo variable, not a `.env` value: Settings → Secrets and
   variables → Actions → Variables → `VITE_API_URL`, set to the backend's
   real address as the browser will reach it, e.g.
   `http://nosh.<your-tailnet>.ts.net:3001`. Re-run the `publish` workflow
   (or push any commit to `main`) after setting it — any image built before
   this is set has the wrong URL baked in.
2. **Check GHCR package visibility.** The first time each image
   (`nosh-backend`, `nosh-frontend`) is published, GHCR sometimes defaults it
   to private regardless of the repo's own visibility. If Watchtower/`docker
   pull` later fails with a 401/403, go to the package's page on GitHub
   (org/user → Packages) and set visibility to match the repo.
3. **Create the data directory** on the homelab box:
   ```bash
   mkdir -p /DATA/nosh/postgres /DATA/nosh/uploads
   ```
   These are bind mounts, not named Docker volumes, specifically so Kopia's
   existing `/DATA`-wide backup sweep picks them up automatically — see
   "Directory layout" above.
4. **Create `.env`** next to `docker-compose.prod.yml` (copy
   [.env.prod.example](../.env.prod.example) and fill in real values —
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, `FRONTEND_ORIGIN`). Never commit
   this file.
5. **Add the stack in Dockge**, pointing it at `docker-compose.prod.yml` and
   the `.env` from the previous step, then start it. First boot order is
   `postgres` (waits for its own healthcheck) → `backend` → `frontend`.
6. **Run the initial migration** — the image ships the migration runner and
   files, but doesn't run them automatically on startup (a deliberate choice,
   consistent with [dev-commands.md](dev-commands.md)'s dev workflow — a
   migration is a decision to run, not a side effect of a container
   restarting):
   ```bash
   docker compose -f docker-compose.prod.yml exec backend pnpm migrate up
   ```
7. **Health check.** `docker compose -f docker-compose.prod.yml ps` should
   show `backend` and `postgres` as `healthy`. Visit the frontend's address
   in a browser and confirm the login page loads and signup works.

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

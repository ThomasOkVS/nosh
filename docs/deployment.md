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

## Not yet written

- `docker-compose.yml` for Nosh's own services (frontend, backend, Postgres).
- First-deploy runbook (directory creation, `.env` generation, initial
  migration, health check).
- Update/rollback procedure for Nosh specifically, beyond "Watchtower handles
  it."

Add these once the MVP is implemented and there's a real Compose file to
document, rather than a placeholder one.

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
| **Networking** | Public HTTPS at `https://nosh.itsthomassito.com` behind the homelab's Caddy — see "Networking" below |

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

```
browser ──HTTPS──▶ Caddy (proxy network, 172.28.255.2; TLS, HSTS)
                     │ reverse_proxy nosh-frontend:8080
                     ▼
                   frontend nginx :8080 (edge network, fixed 10.101.0.10)
                     ├── /       → the built SPA
                     └── /api/*  → strip /api → nosh-backend:3001
                                               │
                                   backend (edge + default) ── postgres (default)
```

- Only the **frontend** joins Caddy's `proxy` network. The backend never
  does, because that network can reach dockge and other admin UIs.
- Both hops use **unique network aliases**: `nosh-backend` on `edge` and
  `nosh-frontend` on `proxy`. Compose also registers the bare service names
  `backend` and `frontend` on every network a container joins, and another
  stack on the shared `proxy` network could use those names too. If it did,
  Docker DNS could route nosh's traffic to the wrong container.
- nginx trusts `X-Forwarded-For` and `X-Forwarded-Proto` only from Caddy's
  IP. It overwrites both before passing them on.
- The backend trusts those headers only from the frontend's fixed IP
  (`TRUSTED_PROXIES`).
- That chain is how the backend learns the real client IP (for rate limits)
  and whether the request was HTTPS. The session cookie is Secure-only in
  production, so without it nobody can log in. The reasoning is in
  [decisions.md](decisions.md#2026-09-24-public-https-behind-caddy) and
  [decisions.md](decisions.md#2026-09-25-tailscale-retired).
- **No host ports are published.** Caddy is the only way in. To check the
  backend from the box itself, use
  `docker compose exec backend wget -qO- localhost:3001/health`.

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
- Nosh is public, so its own auth is the only access control. It rests on:
  - signup off by default (`ALLOW_SIGNUP`);
  - rate-limited login and import;
  - an `Origin` check on every state-changing request;
  - an SSRF guard on every outbound request whose destination comes from a
    user or a remote page: the backend's own fetches, every `yt-dlp`
    connection (through an in-process egress proxy on `127.0.0.1`), and
    Web Push sends (allowlisted push-service hosts). The full list is in
    [architecture.md](architecture.md#outbound-network-calls).

  Details: [decisions.md](decisions.md#2026-09-24-public-https-behind-caddy)
  and [decisions.md](decisions.md#2026-09-25-ssrf-yt-dlp-and-web-push).
- **Recommended defense in depth (homelab side):** block egress from nosh's
  Docker networks to the host and the LAN. For example, a `DOCKER-USER`
  iptables rule that drops traffic from the nosh subnets to RFC1918 and
  CGNAT destinations. It's a second layer: the app doesn't depend on it.
- The egress proxy is internal to the backend process: no host port, no
  extra container, nothing to configure.

## Configuration

The repo's [docker-compose.prod.yml](../docker-compose.prod.yml) is a
reference. The box runs its own copy in `/opt/nosh`, so changes to it have
to be applied there by hand.

### Variables, with this box's production values

| Variable | Value on this box | Notes |
|---|---|---|
| `FRONTEND_ORIGINS` | `https://nosh.itsthomassito.com` | Required. No `:443`, no path. The backend refuses to start without it, or with a malformed entry. |
| `TRUSTED_PROXIES` | `10.101.0.10` | Required. The frontend container's fixed IP on `edge`. Must match `ipv4_address` in the compose file. |
| `ALLOW_SIGNUP` | `false` | Turn it on briefly to create an account, then off again. |
| `TAG` | `latest` (or `sha-<7>` to pin) | Every build is tagged `:latest`, `:sha-<7>` and `:<full sha>`. |

### Verifying a deploy

From any machine:

```bash
H=https://nosh.itsthomassito.com
# Signup refused (403)
curl -si -X POST $H/api/auth/signup -H "Origin: $H" -H 'Content-Type: application/json' \
  -d '{"email":"x@example.com","username":"probe","password":"x"}' | sed -n '1p;$p'
# Login -> Set-Cookie: __Host-nosh.sid=...; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax (no Domain)
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
CI does this automatically on every merge to `main`), shell access to the
homelab box, and Dockge and Caddy running there.

1. **Caddy.** Nosh publishes no host ports, so Caddy is the only way in.
   The frontend joins Caddy's external `proxy` network with the alias
   `nosh-frontend` (already in the compose file). Add
   `nosh.itsthomassito.com { reverse_proxy nosh-frontend:8080 }` to the
   Caddyfile and point DNS (DDNS) at the box. The frontend has no API URL to
   configure: it always calls `/api` on its own origin.
2. **Check GHCR package visibility.** The first time each image
   (`nosh-backend`, `nosh-frontend`) is published, GHCR sometimes defaults it
   to private regardless of the repo's own visibility. If Watchtower/`docker
   pull` later fails with a 401/403, go to the package's page on GitHub
   (org/user → Packages) and set visibility to match the repo. (Not hit on
   this deploy — both images pulled fine on the first try.)
3. **Create the data directory** on the homelab box:
   ```bash
   mkdir -p /opt/nosh/postgres /opt/nosh/uploads
   ```
   These are bind mounts, not named Docker volumes, specifically so Kopia's
   existing `/opt`-wide backup sweep picks them up automatically — see
   "Directory layout" above. (Adjust the root if a future target box's
   Dockge/Kopia don't both live under `/opt`.)
4. **Create `.env`** next to `docker-compose.prod.yml` (copy
   [.env.prod.example](../.env.prod.example) and fill in real values —
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, `FRONTEND_ORIGINS`,
   `TRUSTED_PROXIES`, `ALLOW_SIGNUP` — see the variable table under
   "Configuration"). Never commit this file. To create the first
   account, start with `ALLOW_SIGNUP=true`, sign up, then set it back to
   `false` and restart the backend.
   - **Every host name the app is opened under must be listed in
     `FRONTEND_ORIGINS`**, exactly (scheme + host + port). An unlisted
     origin loads the page but every login and save fails with a 403.
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
   show `backend` and `postgres` as `healthy`. Then run the curls under
   "Verifying a deploy", and open `https://nosh.itsthomassito.com` in a
   browser to confirm the login page loads.

### Update / rollback

Watchtower pulls `nosh-backend:latest`/`nosh-frontend:latest` on its own
schedule once new images land — no action needed for a routine update. A
migration that ships alongside an update still needs the manual
`pnpm migrate up` step above; Watchtower only replaces the running
container, it doesn't run one-off commands inside it.

Updates that need more than a routine pull (a migration, a config change)
get a step-by-step note for whoever runs the box in [handover/](handover/),
e.g. [2026-09-25: recipe units & translation](handover/2026-09-25-recipe-units-and-translation.md)
(migration 015) and [2026-09-25: Tailscale retired](handover/2026-09-25-tailscale-removal.md)
(config only).

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

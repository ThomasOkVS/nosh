# Deployment

nosh v2 runs on the homelab box as the Dockge stack `nosh-v2`, behind the
box's Caddy, at `https://nosh.itsthomassito.com`. It took that hostname from
v1 on 2026-11-24. v1 is stopped, and its data is kept for the importer (see
[Rollback](#rollback-to-v1)).

The box keeps its own notes in `/opt/nosh-v2/CLAUDE.md` and
`/opt/proxy/CLAUDE.md`. This file covers what the app repo needs to know.

## Topology

```
internet ──443──▶ Caddy (proxy network, pinned 172.28.255.2)
                    │  reverse_proxy nosh-v2:3001
                    ▼
               nosh (ghcr.io/thomasokvs/nosh:main)   networks: proxy (alias nosh-v2), default
                    │
                    ▼
               postgres (postgres:17-alpine)          network: default only (10.102.0.0/24)
```

- **One app container** serves both the API and the built SPA on port 3001.
  It runs the Drizzle migrations on every start, before it listens.
- **Only the app joins `proxy`**, under the unique alias `nosh-v2`. Compose
  also registers the bare service name `nosh` on every network, and a
  same-named container in another stack could capture that, so Caddy must use
  the alias.
- **Postgres** stays on the stack's own network, which is pinned to
  `10.102.0.0/24`. No host ports are published.
- **Data** lives under `/opt/nosh-v2/`, inside Kopia's backup of `/opt`
  (the box has no `/DATA`):
  - `postgres/` holds the database files;
  - `uploads/` is mounted at `/data/uploads`. The image runs as `node`
    (uid 1000), so this directory must be owned by 1000.
- **Files on the box:** `/opt/nosh-v2/compose.yaml` is a copy of
  [`deploy/compose.yml`](../deploy/compose.yml). `/opt/nosh-v2/.env` holds the
  secrets.

## Environment

| Variable | Where | What it does |
|---|---|---|
| `NODE_ENV` | image (`production`) | Turns on the production checks below and the `__Host-nosh.sid` cookie name. |
| `PORT` | compose, `3001` | Listen port. |
| `DATABASE_URL` | compose, built from `POSTGRES_PASSWORD` | Postgres connection. Required. |
| `ALLOWED_ORIGINS` | compose, `https://nosh.itsthomassito.com` | The exact origins for the CSRF origin check. The server refuses to start in production without it, or with a malformed value. |
| `TRUSTED_PROXIES` | compose, `172.28.255.2` | Caddy's pinned IP: exact IPs only, no names, no CIDR (SEC-13, SEC-53). Forwarding headers are believed only from these peers. Without it nothing counts as HTTPS and nobody can log in, so production refuses to start. |
| `SESSION_SECRET` | `.env` | A long random string (generated with `openssl rand -hex 48`). Required in production. |
| `POSTGRES_PASSWORD` | `.env` | Hex only, so it needs no escaping in `DATABASE_URL`. |
| `ALLOW_SIGNUP` | compose, `"false"` | Only the exact value `"true"` opens `POST /api/auth/signup` (SEC-15, SEC-58). |
| `UPLOADS_DIR` | image, `/data/uploads` | Where uploads are written. |
| `COMMIT_SHA` | image build arg | Printed at startup (`nosh <sha> listening on port 3001`). |
| `TAG` | optional, in `.env` | Image tag; defaults to `main`. Set a full SHA to pin. |

The Postgres service sets `POSTGRES_INITDB_ARGS=--locale=en_US.utf8`, because
Unicode case folding needs a UTF-8 ctype. Like the dev compose's `nosh_test`
database, **this only applies when the data directory is created, i.e. on a
fresh volume**. Changing it later does nothing to an existing database.
Production has no `nosh_test` database.

## Caddy route

In `/opt/proxy/conf/Caddyfile`, inside the `*.itsthomassito.com` site (see
[`deploy/Caddyfile.snippet`](../deploy/Caddyfile.snippet)):

```
@nosh host nosh.itsthomassito.com
handle @nosh {
	reverse_proxy nosh-v2:3001 {
		flush_interval -1
	}
}
```

Apply an edit with `docker exec caddy caddy validate --config /etc/caddy/Caddyfile`,
then the same command with `reload`. The hostname was already in DDNS and in the
proxy monitor's host list, so v2 needed no DNS change.

### X-Forwarded-For (SEC-13, SEC-14)

Caddy's `reverse_proxy` has no `trusted_proxies` on this box, so it ignores
the incoming `X-Forwarded-For` and sends the real peer address. The box's
Caddyfile already relies on this overwrite for mc-remote. Checked on
2026-11-24: a request with `X-Forwarded-For: 6.6.6.6` was logged by v2 with
the real client IP (`192.168.128.1`, the router's hairpin address for a LAN
client), never `6.6.6.6`. The server takes the rightmost entry from a trusted
peer, which is correct whether Caddy appends or overwrites.

## Deploying a new image

Watchtower deploys on its own: the app container has the
`com.centurylinklabs.watchtower.enable=true` label. Watchtower pulls `:main`
nightly at 04:00 and recreates the container, which then migrates on start. So
**a merge to `main` is live the next morning, with its migrations**. Postgres
has no label and is updated by hand.

To deploy right away:

```sh
docker compose -f /opt/nosh-v2/compose.yaml pull nosh
docker compose -f /opt/nosh-v2/compose.yaml up -d nosh
docker logs --tail 5 nosh-v2-nosh-1   # "nosh <sha> listening on port 3001"
```

Before a migration that changes or drops data, take a dump first, and deploy
that image by hand rather than letting Watchtower do it:

```sh
docker exec nosh-v2-postgres-1 pg_dump -U nosh nosh > /opt/nosh-v2/pre-<sha>.sql
```

After changing `compose.yaml` or `.env`, run `docker compose ... up -d
--force-recreate`. Never `restart`, which keeps the old configuration.

## Health and logs

- From the box: `docker exec nosh-v2-nosh-1 wget -qO- http://127.0.0.1:3001/health`
  returns `{"status":"ok"}`. The image's own healthcheck calls the same
  endpoint.
- Every request logs one line: method, raw path, status, client IP and
  duration. Read them with `docker logs nosh-v2-nosh-1`, or in Dozzle.

## Accounts

Signup is off. To create an account:

1. Set `ALLOW_SIGNUP: "true"` in `/opt/nosh-v2/compose.yaml`, then run
   `up -d --force-recreate nosh`.
2. Sign up in the browser.
3. Set it back to `"false"`, recreate, and confirm that `POST /api/auth/signup`
   answers 403.

The owner's account was created this way on 2026-11-24. The importer later
brings the v1 account and data.

## Rollback to v1

v1's stack (`/opt/nosh`, which uses `docker-compose.yml`) is stopped, not
removed. Its Postgres data and uploads are untouched. To go back:

1. In the Caddyfile, point `@nosh` at `nosh-frontend:8080` again. Validate,
   then reload.
2. Run `docker compose -f /opt/nosh/docker-compose.yml start`.
3. Optionally, `docker compose -f /opt/nosh-v2/compose.yaml stop`.

Never run `down -v` on either stack.

## Known gaps

- The host firewall's egress sandbox (`SANDBOX_NETS` in `/opt/HOST.md`) covers
  v1's subnets, not `10.102.0.0/24`. v2 makes no outbound fetches yet. This
  must be handled before import jobs land (backlog).
- An iPhone that had v1 installed keeps v1's service worker (`/sw.js`, which v2
  answers with 404) until the home-screen app is deleted and Safari's website
  data for the host is cleared.

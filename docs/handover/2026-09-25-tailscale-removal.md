# Handover for the homelab box: Tailscale retired, HTTPS only

**For:** the agent or operator running Nosh on the homelab box (`/opt/nosh`,
Docker Compose, Watchtower, images from GHCR).
**Written:** 2026-09-25, with the PR that removes the tailnet support.
**Background:** [decisions.md](../decisions.md#2026-09-25-tailscale-retired)
and [deployment.md](../deployment.md#networking).

## What changes on the box

- **No migration.** The images change, and so does the config below.
- **The backend refuses to start** in production unless `FRONTEND_ORIGINS`
  and `TRUSTED_PROXIES` are both set. The singular `FRONTEND_ORIGIN` is no
  longer read.
- **The session cookie is renamed** to `__Host-nosh.sid` and is always
  Secure. Everyone is logged out once and logs in again as usual.
- **No host ports.** The reference compose file no longer publishes the
  backend (`3101` on this box) or the frontend (`8080`). Caddy reaches the
  frontend over the `proxy` network.
- **No CORS.** The backend only answers same-origin requests via `/api`.
  Anything still calling `http://<box>:3101` directly from a browser stops
  working, which is the intent.

## ⚠️ Do steps 1–2 before the PR is merged

Watchtower deploys the new images around 04:00 after the merge. If `.env`
still only has `FRONTEND_ORIGIN` (singular), or `TRUSTED_PROXIES` is empty,
the new backend crash-loops at boot with a message naming the missing
variable. Both steps are harmless for the images running now.

## Steps

From `/opt/nosh`. Replace `docker compose` with
`docker compose -f docker-compose.prod.yml` if the file there has that name.

1. **`.env`:**
   - `FRONTEND_ORIGINS=https://nosh.itsthomassito.com`, with no tailnet
     origin in the list;
   - delete any `FRONTEND_ORIGIN=` line;
   - `TRUSTED_PROXIES=10.101.0.10` (the frontend's fixed IP on `edge`).
2. **Compose file**, to match the repo's
   [docker-compose.prod.yml](../../docker-compose.prod.yml):
   - remove `FRONTEND_ORIGIN` from the backend's `environment`;
   - remove the backend's `ports:` (`3101:3001`) and the frontend's
     `ports:` (`8080:8080`);
   - make sure the frontend is on the external `proxy` network with the
     alias `nosh-frontend`.

   Then run `docker compose up -d` and check that the site still loads at
   `https://nosh.itsthomassito.com`. The current images don't need the ports.
3. **After the merge has deployed** (the CI `publish` job is green and
   Watchtower has run, or pull by hand with `docker compose pull && docker compose up -d`):
   ```bash
   docker compose exec backend wget -qO- localhost:3001/health   # {"status":"ok"}
   curl -s https://nosh.itsthomassito.com/api/health             # {"status":"ok"}
   docker compose logs --since 10m backend | grep -iE "error|failed" || echo "clean"
   ```
   Then run the login and SSRF curls under
   [Verifying a deploy](../deployment.md#verifying-a-deploy). The login's
   `Set-Cookie` should start with `__Host-nosh.sid=` and include `Secure`.
4. **Optional:** delete the GitHub repo variable `VITE_API_URL` (Settings →
   Secrets and variables → Actions → Variables). CI no longer reads it.
5. **Report back to the owner:** the output of step 3 and the running image
   tag (`docker compose images backend frontend`).

## If something goes wrong

- **The backend crash-loops with `FRONTEND_ORIGINS must be set` or
  `TRUSTED_PROXIES must be set`.** Step 1 wasn't applied to the `.env` the
  stack actually uses. Fix it and run `docker compose up -d backend`.
- **The site loads, but login does nothing (no cookie).** The backend isn't
  seeing the request as HTTPS. Check that `TRUSTED_PROXIES` equals the
  frontend's `ipv4_address` on `edge`, and that Caddy sends
  `X-Forwarded-Proto: https` (it does by default).
- **Rolling back.** Set `TAG=sha-<previous 7-char sha>` in `.env` and run
  `docker compose up -d`. The old images work with the new `.env` and
  compose file. Everyone is logged out once more, because the old image
  uses the old cookie name.

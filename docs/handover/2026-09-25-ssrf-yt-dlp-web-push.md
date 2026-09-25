# Handover for the homelab box: SSRF guard for yt-dlp and Web Push

**For:** the agent or operator running Nosh on the homelab box (`/opt/nosh`,
Docker Compose, Watchtower, images from GHCR).
**Written:** 2026-09-25, with the PR that ships the change.
**Background:** [decisions.md](../decisions.md#2026-09-25-ssrf-yt-dlp-and-web-push)
and [architecture.md](../architecture.md#outbound-network-calls).

## What changes on the box

- **New backend image only.** No migrations, env vars, ports, volumes,
  networks or containers are added.
- The egress proxy runs inside the backend process on `127.0.0.1` at a
  random port. Nothing to publish or configure.
- If the proxy can't start, the backend exits at startup. A crash-loop
  right after the update would show up in the logs.
- The host firewall rule you're adding separately is still worth having as
  a second layer. The app no longer depends on it.

## Steps

1. **Let Watchtower pull the new image, or pull it now:**
   ```bash
   docker compose pull backend
   docker compose up -d backend
   ```
2. **Check it's up:**
   ```bash
   curl -s localhost:3101/health        # {"status":"ok"}
   docker compose logs --since 10m backend | grep -iE "error|failed|refused" || echo "clean"
   ```
3. **Check the flags against the image's yt-dlp.** They were verified against
   Alpine's 2026.07.04. Confirm the build that shipped still has them:
   ```bash
   docker compose exec backend yt-dlp --version
   docker compose exec backend sh -c "yt-dlp --help | grep -cE -- '^\s+(--ignore-config|--proxy URL|--downloader \[PROTO|--fixup POLICY)'"
   # expect a version line, then 4
   ```
4. **Report back to the owner:** the three outputs above and the running
   image tag (`docker compose images backend`).

The owner then checks the app themselves:
- one Instagram Reel import and one TikTok import, both of which must still
  work;
- turning notifications off and on again, then one import that sends a push.

If a Reel import fails with "Couldn't fetch that post", look for
`Egress proxy refused <host>` in the backend logs.
- A **public** host refused there is a bug. Report the host.
- Anything **internal** refused there is the guard doing its job.

## If something goes wrong

Roll back the backend to the previous image tag (see
[deployment.md](../deployment.md#update--rollback)). There's no schema
change, so nothing needs undoing in the database.

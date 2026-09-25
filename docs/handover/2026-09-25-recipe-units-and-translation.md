# Handover for the homelab box: recipe units, scaling & translated imports

**For:** the agent or operator running Nosh on the homelab box (`/opt/nosh`,
Docker Compose, Watchtower, images from GHCR).
**Written:** 2026-09-25, with the PR that ships the feature.
**Background:** [decisions.md](../decisions.md#2026-09-25-recipe-units-and-language)
and [architecture.md](../architecture.md#language-units--scaling).

## What changes on the box

- **New images only.** CI publishes `nosh-backend` and `nosh-frontend` as
  usual once the PR is merged to `main`. There are no new services, ports,
  volumes, networks or env vars.
- **One migration is required:** `1700000000015_recipe-preferences`.
  - It adds four columns to `users`: `recipe_language`, `unit_system`,
    `temperature_unit` and `keep_spoons`.
  - It adds one column to `import_jobs`: `translation_skipped`.
  - It's additive only, with defaults, so no existing data is reshaped.
    None of the "check before trusting it" steps in
    [deployment.md](../deployment.md#update--rollback) apply.
- **Translation uses the existing `GEMINI_API_KEY`.** Nothing new to
  configure. Without a key, imports still work; they just aren't translated,
  and the review form says so.

## ⚠️ Run the migration as soon as the new backend is up

The new backend reads the new `users` columns every time an import
starts. Between Watchtower swapping in the new image (normally around 04:00)
and `migrate up` running, **every import fails with a 500**, and the
Settings page's "Language & units" section shows an error. Recipe pages keep
working; they fall back to metric/°C.

So don't leave the migration until after the next scheduled run. Either
deploy by hand straight after the merge's CI publish finishes, or run the
migration first thing after Watchtower's run.

## Steps

From `/opt/nosh`, the box's own copy of the compose file. Replace
`docker compose` with `docker compose -f docker-compose.prod.yml` if the
file there has that name.

1. **Wait until CI has published images for the merge commit.** The GitHub
   Actions `publish` job on `main` must be green. Then either:
   - let Watchtower pick them up, or
   - pull them now:
     ```bash
     docker compose pull backend frontend
     docker compose up -d backend frontend
     ```
2. **Run the migration:**
   ```bash
   docker compose exec backend pnpm migrate up
   ```
   The output should list `1700000000015_recipe-preferences` and end with
   `Migrations complete!`.
3. **Verify:**
   ```bash
   curl -s localhost:3101/health                  # {"status":"ok"}
   docker compose exec postgres psql -U nosh -d nosh -c \
     "SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1;"
     # 1700000000015_recipe-preferences
   docker compose exec postgres psql -U nosh -d nosh -c \
     "SELECT unit_system, temperature_unit, keep_spoons, recipe_language FROM users;"
     # every row: metric | C | t | (null)
   docker compose logs --since 10m backend | grep -iE "error|failed" || echo "clean"
   ```
   Use the database user and name from the box's `.env` if they differ from
   `nosh`/`nosh`.
4. **Report back to the owner:**
   - the migration output;
   - the result of the three checks above;
   - the running image tag (`docker compose images backend frontend`).

   The owner checks the UI themselves:
   - Settings → Language & units;
   - scaling on a recipe page;
   - one import with the recipe language set to Nederlands.

## If something goes wrong

- **The backend won't start after the update.**
  - Collect `docker compose logs backend`.
  - The new image runs the shared `@nosh/units` package from
    `/repo/packages/units/dist`. A `Cannot find module '@nosh/units'` error
    means the image was built wrong. Report it and don't try to patch the
    container.
- **Rolling back.**
  - Set `TAG=sha-<previous 7-char sha>` in `.env`, then run
    `docker compose up -d`.
  - You don't need to reverse migration 015: the old code ignores the new
    columns.
  - Only if the owner asks for a full revert:
    `docker compose exec backend pnpm migrate down` (it drops the five
    columns and the preferences saved in them).
- **Imports fail with 500 after migrating.** Check that
  `SELECT recipe_language FROM users LIMIT 1;` works. If it errors, the
  migration didn't run against the database the backend uses; check
  `DATABASE_URL`.

## Not needed

- No Caddy, DNS, firewall or `.env` changes.
- No data backfill. Existing recipes stay stored exactly as they are; only
  the *display* converts, and new imports are converted when they're made.

# Backlog

Concrete, actionable work items — not to be confused with
[index.md](index.md)'s roadmap (which describes *what* Nosh will
eventually do and *why*) or [decisions.md](decisions.md) (which records *why* a
choice was made). This is just a todo list.

## How to use this

- **Backlog** — unchecked items, roughly ordered by priority within their
  group. Add new items as they come up; it's fine for this to be messy/flat.
- **Completed** — when an item is done, move it here (don't just check it off
  in place) with the date it was finished. Newest entries at the top. A short
  note on what actually happened is more useful later than just the item title.

## Backlog

### Deployment
- [ ] Write Nosh's `docker-compose.yml` for the homelab (see
      [deployment.md](deployment.md)'s "Not yet written" section)
- [ ] First-deploy runbook
- [ ] Publish images to a registry Watchtower can poll
- [ ] Confirm the frontend's dev container actually works on Windows dev
      machines before writing dev-workflow docs — see
      [decisions.md](decisions.md#2026-08-06-frontend-dev-container-unreliable-on-windows-run-frontend-outside-docker-locally)
      for the unresolved Docker-Desktop-on-Windows networking issue and the
      current workaround (run frontend via `pnpm dev`, not Docker)

## Completed

- **2026-08-06** — MVP frontend group finished: `react-router-dom` for routing
  (classic `<Routes>`/`<Route>` API, not the v6.4+ data router — plain
  component routing + `useEffect` data fetching was the more incremental step
  given no data-fetching library exists yet), a small hand-rolled `api/`
  fetch client (base URL + `credentials: "include"` + typed `ApiError`, no
  TanStack Query/SWR) and a React Context-based `AuthProvider` (checks
  `GET /auth/me` on mount) with a `RequireAuth` route guard. Pages: login,
  signup, recipe list with debounced full-text search, recipe detail
  (ingredients/steps/tags/images, edit/delete), and a shared create/edit form
  with plain controlled-component array editors for ingredients and steps (no
  react-hook-form) plus per-image upload/delete once a recipe has an id.
  Installable PWA via `vite-plugin-pwa` (Workbox-generated service worker,
  `generateSW` mode — precaches the built app shell only, never the API) and
  a single SVG app icon (`sizes: "any"`, no raster PNG set or
  `apple-touch-icon` — acceptable gap for a Tailscale-only homelab app).
  Required a backend change: added `cors` middleware (credentials-enabled,
  restricted to the frontend's origin via a new `FRONTEND_ORIGIN` env var)
  since the frontend and backend run on different ports/origins — see
  [decisions.md](decisions.md#2026-08-06-cors-added-to-the-backend-for-the-frontends-cross-origin-session-cookie).
  Added Vitest + React Testing Library coverage (mocked `fetch`, no MSW) for
  the API client, the auth guard, both auth forms, list/search, and the
  ingredient/step array editors. Verified: `pnpm lint`, `pnpm build`, and the
  full frontend `pnpm test` all pass; the dev server was manually checked in a
  browser (routing/redirect behavior, manifest, and service worker
  registration all confirmed) but the full signup→create→search→delete
  golden path was **not** exercised end-to-end — this sandbox has no
  Docker/Postgres available, so the backend couldn't actually run. Do that
  walkthrough locally before considering this fully verified.
- **2026-08-06** — MVP backend group finished: node-postgres (`pg`, raw SQL,
  no ORM) for DB access; `node-pg-migrate` migrations for the full MVP schema
  (users, recipes, ingredients, steps, tags, recipe_tags, recipe_images);
  full username/password auth (argon2 hashing, `express-session` +
  `connect-pg-simple` Postgres-backed sessions, httpOnly cookies) with
  signup/login/logout/me; recipe CRUD with nested ingredients/steps/tags
  (transactional create/update, ownership checks scoped to the session user);
  image upload via `multer` to a local disk volume, served back through an
  authenticated, ownership-checked route (not a static mount — see
  [decisions.md](decisions.md#2026-08-06-recipe-images-served-through-an-authenticated-route-not-a-static-mount)),
  with cleanup of files on delete; full-text search (`GET /recipes/search`)
  backed by a trigger-maintained `search_vector` column (see
  [decisions.md](decisions.md#2026-08-06-full-text-search-implemented-via-triggers-not-a-single-generated-column),
  which supersedes the original "generated column" wording in
  [architecture.md](architecture.md#search)). Added a `zod`-validated request
  layer, a dedicated `nosh_test` Postgres database (created via
  `postgres-init/`) so the Vitest/Supertest suite never touches dev data, and
  a Postgres service in CI. `createApp()` now takes injected dependencies
  (pool, session secret, uploads dir) for testability. A follow-up security
  review (3 sub-agent findings, independently re-verified) confirmed the
  missing image-route authorization above as a real gap and fixed it, and
  added session regeneration on login/signup against session fixation;
  a hardcoded fallback `SESSION_SECRET` and missing cookie `secure`/`sameSite`
  flags were investigated and ruled out as non-issues for this app's actual
  design (see the same decisions.md entry). Verified for real this time:
  `pnpm lint`, `pnpm build`, and the full `pnpm test` (28 backend + 1 frontend
  test, migrations included) all pass against a live Postgres instance.
- **2026-08-06** — Project setup group finished: pnpm-workspace monorepo
  (`frontend/`, `backend/`); backend is Express + strict TS (CommonJS output,
  `tsx` for dev) with ESLint flat config + Prettier; frontend is Vite + React 19
  + strict TS + Tailwind v4, same lint/format setup; Vitest + Supertest on the
  backend and Vitest + React Testing Library on the frontend, each with one
  passing smoke test; `docker-compose.yml` runs Postgres + backend + frontend
  for local dev (each service Dockerfile.dev builds from the repo root so pnpm
  workspace resolution works, with node_modules dirs shadowed via anonymous
  volumes so the container's installed deps aren't clobbered by the source
  bind-mount); GitHub Actions `ci.yml` runs install/lint/test/build on push and
  PRs. Verified for real: `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build`
  all pass, and the Vite dev server serves the placeholder page correctly. Hit
  and fixed two real issues along the way — see
  [decisions.md](decisions.md#project-setup-tooling-choices).
- **2026-08-05** — Initial project documentation created: `PROJECT.md`,
  `docs/README.md`, `docs/architecture.md`, `docs/decisions.md`, `CLAUDE.md`,
  `.claude/settings.json` permissions template. No code written yet.
- **2026-08-05** — Cleaned up `docs/deployment.md` (removed placeholder scraper
  service and inaccurate "post-move" Tailscale framing); confirmed the CD
  mechanism decision (Watchtower already runs homelab-wide).

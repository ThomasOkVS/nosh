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

### Post-MVP features
Confirm scope with the project owner before starting any of these — per
[CLAUDE.md](../CLAUDE.md), none should be built ahead of an explicit
go-ahead. Ordered per [index.md](index.md#planned-post-mvp)'s stated
priority.

- [ ] LLM-based recipe import from URLs, Instagram Reels, and TikTok — see
  [decisions.md](decisions.md#2026-08-05-recipe-import-via-cloud-llm-post-mvp)
  for the already-decided approach (cloud LLM API, not local/self-hosted).
- [ ] Nutrition info via an external nutrition database.
- [ ] Smart unit conversions & recipe scaling.
- [ ] Notes & ratings on recipes.
- [ ] Recipe organization: collections and tag-based browsing.
- [ ] Weekly meal planner.
- [ ] Grocery list generation from planned meals (depends on the meal
      planner above existing first).
- [ ] Grocery list integration with Belgian supermarkets (Colruyt, Albert
      Heijn, etc.) — depends on grocery list generation above existing
      first.
- [ ] Native-feeling mobile experience (MVP ships as a responsive PWA; this
      is a further step beyond that).

## Completed

- **2026-08-08** — Design polish (post-restyle follow-ups) group finished:
  a `ToastProvider`/`useToast()` (`frontend/src/toast/`) replacing the three
  remaining `window.alert()` error calls (recipe delete, image upload/delete)
  with a dismissible, auto-expiring `.glass` toast — informational, not
  blocking, unlike `ConfirmDialog`; two hand-built empty-state illustrations
  (`EmptyRecipesIllustration`, `EmptySearchIllustration`) replacing the
  icon+copy interim fallback, built from the app's own recipe-card shape
  rather than generic clip-art; a real PWA icon set (192/512 PNGs, a
  dedicated maskable-safe 512 PNG, and an `apple-touch-icon`) generated from
  an updated brand-colored source SVG — the old `icon.svg` was still on the
  pre-restyle slate palette, fixed as part of this; and the glass-panel
  focus-ring mismatch fixed by making `ring-offset-color` transparent instead
  of assuming an opaque `--color-surface`, which turned out to be the more
  correct fix in general (not glass-specific — see
  [design-system.md](design-system.md#inputs)). See
  [decisions.md](decisions.md#2026-08-08-design-polish-follow-ups) for the
  toast and icon-generation notes. `pnpm lint`/`test`/`build` all pass;
  verified live against the real backend + seeded demo data (both empty
  states, the toast's auto-dismiss and manual-dismiss, and the focus ring's
  computed `box-shadow` on the glass login card, in both light and dark).
- **2026-08-08** — Deployment group finished: production
  `backend/Dockerfile`/`frontend/Dockerfile` (multi-stage, distinct from the
  dev-only `Dockerfile.dev` of each — backend down to a `tsc`-built,
  prod-deps-only runtime image, frontend to an `nginx`-served static build
  with SPA fallback routing and cache-aware headers);
  `docker-compose.prod.yml` for the homelab (pulls published GHCR images,
  bind-mounts Postgres/uploads under `/DATA/nosh/` so Kopia's backup sweep
  covers them — see [deployment.md](deployment.md)); a `publish` job added
  to [ci.yml](../.github/workflows/ci.yml) that builds and pushes both
  images to GHCR (tagged `latest` + commit SHA) on every merge to `main`,
  which Watchtower now has something to poll; and a first-deploy runbook
  added to [deployment.md](deployment.md) (directory setup, `.env` from the
  new [.env.prod.example](../.env.prod.example), migration step, health
  check, update/rollback). Also re-confirmed the Windows frontend
  dev-container issue is still present (Docker Desktop is now available in
  this environment, so this could actually be re-tested rather than assumed)
  — see [decisions.md](decisions.md) for both entries. Verified for real:
  built both production images, ran real migrations against the built
  backend image, and hit the built frontend image's nginx server from a
  browser (SPA routing, cache headers, PWA manifest content-type all
  confirmed working, not just read from config) — caught and fixed a missing
  `manifest.webmanifest` MIME type this way.
- **2026-08-06** — Restyled the app to match
  [design-system.md](design-system.md): tokens (colors, type, radius, glass,
  dark mode), then a follow-up critical design review against the real
  running app that found the token pass alone still read as CRUD, and fixed
  the recipe card/detail/form *structure* (photo-forward card grid, hero
  photo on the detail page, checklist/step-card ingredients & steps,
  de-emphasized delete, grouped form sections with placeholders, capitalized
  tag chips, fixed near-invisible input borders). See
  [decisions.md](decisions.md#2026-08-06-design-system-defined-citrus-pop-glassyrounded-motion-forward)
  and the critical-review entry immediately below it. `pnpm lint`/`test`/
  `build` all pass; verified live against the real backend + seeded demo
  data, light and dark, desktop and mobile widths.
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

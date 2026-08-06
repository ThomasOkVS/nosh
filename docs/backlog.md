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

### MVP — backend
- [ ] Postgres migrations for MVP schema (users, recipes, ingredients, steps,
      tags, recipe_tags, recipe_images) — see [architecture.md](architecture.md)
- [ ] Auth: signup, login, session/JWT handling, password hashing
- [ ] Recipe CRUD API endpoints
- [ ] Image upload handling (local disk volume)
- [ ] Full-text search endpoint (Postgres `tsvector`)

### MVP — frontend
- [ ] App shell + routing
- [ ] Login / signup screens
- [ ] Recipe list + search UI
- [ ] Recipe detail view
- [ ] Recipe create/edit form
- [ ] PWA manifest + service worker (installable)

### Deployment
- [ ] Write Nosh's `docker-compose.yml` for the homelab (see
      [deployment.md](deployment.md)'s "Not yet written" section)
- [ ] First-deploy runbook
- [ ] Publish images to a registry Watchtower can poll

## Completed

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

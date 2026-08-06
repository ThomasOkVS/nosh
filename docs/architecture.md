# Architecture

Status: design for MVP. Update this doc as implementation reveals better answers —
it should always describe the system as it actually is (or, for not-yet-built
pieces, as currently intended), not just as it was first imagined.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Tailwind CSS, responsive, shipped as an installable PWA |
| Backend | Node.js, TypeScript (strict mode), Express |
| Database | PostgreSQL |
| Auth | Username/password, hashed (argon2/bcrypt), server-side sessions or JWT |
| File storage | Local disk volume (recipe photos, uploads) |
| Deployment | Docker containers, managed via Dockge, on a home server |
| Network | Tailscale only — no public ingress, no in-app TLS termination |
| Repo | Monorepo on GitHub (`/frontend`, `/backend`), pnpm workspaces |
| Tooling | ESLint + Prettier, Vitest, React Testing Library, Supertest (backend HTTP tests) |

Rationale for each of these is in [decisions.md](decisions.md).

## High-level design

```
┌─────────────┐        HTTPS (Tailscale-only)        ┌──────────────┐
│  React PWA   │ ───────────────────────────────────▶ │  Node.js API │
│ (frontend)  │ ◀─────────────────────────────────── │  (backend)   │
└─────────────┘                                        └──────┬───────┘
                                                                │
                                        ┌───────────────────────┼───────────────────────┐
                                        ▼                                               ▼
                                ┌───────────────┐                              ┌────────────────┐
                                │  PostgreSQL   │                              │ Local disk vol. │
                                │ (recipe data) │                              │ (recipe photos) │
                                └───────────────┘                              └────────────────┘
```

The frontend is a single-page app that talks to the backend over a JSON REST API.
There is no separate API gateway or reverse proxy inside Nosh's own containers —
Tailscale is the network boundary.

## Repo / folder structure

```
nosh/
├── README.md
├── CLAUDE.md
├── docs/
├── frontend/          # React + Tailwind PWA
│   └── src/
├── backend/           # Node.js + TypeScript API
│   ├── src/
│   └── migrations/    # SQL migrations for PostgreSQL
└── docker-compose.yml # local dev + reference for Dockge deployment
```

## Data model (MVP)

Entities needed for manual recipe CRUD. `user_id` foreign keys exist from day one
even though there is exactly one user today — see
[decisions.md#multi-user-ready-schema](decisions.md#multi-user-ready-schema).

- **users** — `id`, `email`, `password_hash`, `created_at`
- **recipes** — `id`, `user_id`, `title`, `description`, `servings`,
  `prep_time_minutes`, `cook_time_minutes`, `created_at`, `updated_at`
- **ingredients** — `id`, `recipe_id`, `position`, `quantity`, `unit`, `name`
  (free-text per line for MVP; not normalized against a master ingredient table)
- **steps** — `id`, `recipe_id`, `position`, `instruction`
- **tags** — `id`, `name`
- **recipe_tags** — `recipe_id`, `tag_id` (join table)
- **recipe_images** — `id`, `recipe_id`, `file_path`, `position`

Not modeled yet, deliberately: collections, ratings/notes, nutrition facts, meal
plans, grocery lists. These are post-MVP (see [index.md](index.md)) and will
get their own migrations when built, rather than speculative columns now.

## Search

Postgres full-text search (`tsvector`/`tsquery`) over `recipes.title`,
`ingredients.name`, `steps.instruction`, and `tags.name`, combined via a
generated/indexed column on `recipes`. Chosen over plain `LIKE` queries for
relevance ranking, and over a dedicated search engine (Elasticsearch/Meilisearch)
because it needs no extra infrastructure and comfortably handles a personal-scale
recipe collection. Faceted filters (tag, cook time, etc.) can be added as plain
`WHERE` clauses alongside the full-text query later.

## Auth

Full username/password accounts (not a shared passphrase), because the schema is
already multi-user-ready and because it's the more transferable pattern to learn.
Passwords hashed with argon2 or bcrypt; sessions or JWTs for the API. No rate
limiting/lockout for v1 — Tailscale-only network exposure is the accepted primary
defense; revisit if Nosh is ever exposed beyond the tailnet.

## Future: recipe import

Post-MVP, recipe import (from URLs, Instagram Reels, TikTok) will use a cloud LLM
API (e.g. Anthropic/OpenAI) to extract structured recipe data (ingredients, steps,
nutrition, photo) from messy source content. Local/self-hosted LLM was considered
and rejected for this specific feature due to the ProDesk 400 G5's limited
hardware for running a model capable of reliable extraction from video/social
content — see [decisions.md](decisions.md).

## Deployment target

Docker containers on an HP ProDesk 400 G5 (ZimaOS), managed via Dockge, reachable
only over Tailscale. Concrete build/release/CD mechanics live in
[deployment.md](deployment.md) (maintained separately by the project owner).

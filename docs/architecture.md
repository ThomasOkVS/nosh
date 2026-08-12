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
| Recipe import | schema.org JSON-LD parsing (`cheerio`), falling back to the Google Gemini API |
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
Tailscale is the network boundary. Frontend and backend run on different
ports (different origins, but the same site/hostname), so the backend allows
the frontend's origin via CORS with credentials enabled — see
[decisions.md#2026-08-06-cors-added-to-the-backend-for-the-frontends-cross-origin-session-cookie](decisions.md).

## Repo / folder structure

```
nosh/
├── README.md
├── CLAUDE.md
├── docs/
├── frontend/               # React + Tailwind PWA
│   ├── src/
│   ├── Dockerfile.dev      # dev image (Vite dev server, bind-mounted source)
│   ├── Dockerfile          # production image (vite build -> nginx)
│   └── nginx.conf          # SPA fallback + cache headers for the built app
├── backend/                # Node.js + TypeScript API
│   ├── src/
│   ├── migrations/         # SQL migrations for PostgreSQL
│   ├── Dockerfile.dev      # dev image (tsx watch, bind-mounted source)
│   └── Dockerfile          # production image (tsc build -> node dist/)
├── docker-compose.yml      # local dev (builds Dockerfile.dev, hot reload)
└── docker-compose.prod.yml # homelab deployment (pulls published GHCR images)
```

## Data model (MVP)

Entities needed for manual recipe CRUD. `user_id` foreign keys exist from day one
even though there is exactly one user today — see
[decisions.md#multi-user-ready-schema](decisions.md#multi-user-ready-schema).

- **users** — `id`, `email`, `password_hash`, `created_at`
- **recipes** — `id`, `user_id`, `title`, `description`, `servings`,
  `prep_time_minutes`, `cook_time_minutes`, `source_url`, `created_at`,
  `updated_at`. `source_url` is null for manually-created recipes and set to
  the originating page for imported ones — see [recipe import](#recipe-import-urls).
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
`ingredients.name`, `steps.instruction`, and `tags.name`, materialized into an
indexed `recipes.search_vector` column. Chosen over plain `LIKE` queries for
relevance ranking, and over a dedicated search engine (Elasticsearch/Meilisearch)
because it needs no extra infrastructure and comfortably handles a personal-scale
recipe collection. Faceted filters (tag, cook time, etc.) can be added as plain
`WHERE` clauses alongside the full-text query later.

Since the search corpus spans four tables, `search_vector` can't be a single
`GENERATED ALWAYS AS` column (Postgres generated columns only see their own
row) — see
[decisions.md#2026-08-06-full-text-search-implemented-via-triggers-not-a-single-generated-column](decisions.md).
It's kept up to date by triggers instead: a `BEFORE INSERT OR UPDATE` trigger
on `recipes` sets it from the recipe's own `title`/`description`, and
`AFTER INSERT OR UPDATE OR DELETE` triggers on `ingredients`, `steps`, and
`recipe_tags` call a shared `recompute_recipe_search_vector(recipe_id)`
function that rebuilds the full vector (title, description, ingredient names,
step instructions, tag names, each `setweight`-ranked) whenever anything
underneath a recipe changes. The search endpoint itself is then a plain
`search_vector @@ plainto_tsquery(...)` lookup against the GIN index — no
joins or aggregation at query time.

## Auth

Full username/password accounts (not a shared passphrase), because the schema is
already multi-user-ready and because it's the more transferable pattern to learn.
Passwords are hashed with argon2. Auth uses server-side sessions (`express-session`,
backed by Postgres via `connect-pg-simple`, httpOnly cookie) rather than JWTs, so
logout actually revokes access — see
[decisions.md#2026-08-06-backend-mvp-db-access-auth-mechanism-and-supporting-libraries](decisions.md).
No rate limiting/lockout for v1 — Tailscale-only network exposure is the accepted
primary defense; revisit if Nosh is ever exposed beyond the tailnet.

Database access throughout the backend is raw SQL via `pg` (node-postgres) —
deliberately no ORM or query builder, to keep the Postgres learning goal front
and center.

## Recipe import (URLs) {#recipe-import-urls}

`POST /import` takes `{ url }` and yields an unsaved `RecipeInput` for the
frontend to pre-fill the normal create form with — nothing is persisted until
the user reviews it and submits that form through the existing
`POST /recipes` path. It responds with newline-delimited JSON (a progress line
per phase, then a result or error line) so the UI can say which extraction
path is running; see
[decisions.md](decisions.md#2026-08-11-import-streams-ndjson-progress-instead-of-returning-one-json-object).
Extraction is two-stage:

1. **schema.org JSON-LD** — the page's `<script type="application/ld+json">`
   blocks are parsed (via `cheerio`) looking for a `Recipe` node, handling the
   common real-world shapes (bare object, array, `@graph`-wrapped,
   `HowToStep`/`HowToSection` instructions, ISO-8601 durations). Most recipe
   sites publish this, so the common case costs no LLM call at all.
2. **Gemini fallback** — when there's no usable JSON-LD, the page is stripped
   to plain text, truncated, and sent to the Gemini API with a `responseSchema`
   constraining the output to `RecipeInput`'s shape.

Either way the result is validated with the same `recipeSchema` the recipe
routes use, `source_url` is set to the imported URL, and two normalizations
run over both paths' output: ingredient lines are split into
quantity/unit/name (`services/ingredientLine.ts`), and tags are restricted to
a fixed attribute vocabulary — "high protein", "quick", "gluten free" and
similar (`services/recipeTags.ts`) — rather than the site's SEO keywords. See
[decisions.md](decisions.md#2026-08-11-import-tags-come-from-a-fixed-vocabulary-not-the-sites-keywords)
for both. The Gemini client is
injected into `createApp()` (`AppDeps.geminiExtract`) so tests substitute a
fake and never hit the network. It's optional: with no `GEMINI_API_KEY` set,
stage 1 still works — only pages that need the fallback return 503. Since this is the app's
first code path that fetches a user-supplied URL, it rejects non-http(s)
schemes and local hostnames before making any request.

Photos are not imported — the existing "recipe must be saved before adding
photos" constraint applies unchanged, so an imported recipe gets its photo
added manually afterward.

## Future: recipe import from social video

Import from Instagram Reels and TikTok is still to be built. It needs genuine
content understanding of video/caption content that static parsing can't
provide, and the platforms actively resist scraping — it'll reuse the same
`/import` endpoint shape and `source_url` column. Local/self-hosted LLM was
considered and rejected for this feature due to the ProDesk 400 G5's limited
hardware — see [decisions.md](decisions.md).

## Deployment target

Docker containers on an HP ProDesk 400 G5 (ZimaOS), managed via Dockge, reachable
only over Tailscale. Concrete build/release/CD mechanics live in
[deployment.md](deployment.md) (maintained separately by the project owner).

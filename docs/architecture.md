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
| Network | Public HTTPS at `nosh.itsthomassito.com`; TLS terminated by the homelab's Caddy, frontend nginx proxies `/api` (was Tailscale-only until 2026-09-24) |
| Repo | Monorepo on GitHub (`/frontend`, `/backend`), pnpm workspaces |
| Tooling | ESLint + Prettier, Vitest, React Testing Library, Supertest (backend HTTP tests) |

Rationale for each of these is in [decisions.md](decisions.md).

## High-level design

```
┌─────────────┐  HTTPS via Caddy → frontend nginx /api  ┌──────────────┐
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
In production the frontend container's nginx serves the built app and
proxies `/api/*` to the backend (stripping the prefix), so page and API share
one origin; the homelab's Caddy terminates TLS in front of that at
`https://nosh.itsthomassito.com`, and the app is reachable from the public
internet — its own auth is the only access control. See
[decisions.md#2026-09-24-public-https-behind-caddy](decisions.md#2026-09-24-public-https-behind-caddy)
and [deployment.md](deployment.md#networking) for the topology and which hop
trusts which. Local dev still runs the two on different ports, so the backend
also allows its configured origins via CORS with credentials — see
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
├── packages/
│   └── units/              # @nosh/units: quantity parsing, scaling, unit &
│                           # temperature conversion, shared by both apps
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
- **collections** — `id`, `user_id`, `parent_id` (nullable, self-referencing,
  `ON DELETE CASCADE`), `name`, `created_at`. A named, user-curated,
  *nestable* folder — see [Collections](#collections) below for how this
  differs from tags.
- **recipes.collection_id** — `NOT NULL`, `ON DELETE CASCADE` — every recipe
  belongs to exactly one collection, always (see Collections below); there is
  no `recipe_collections` join table any more, this is a plain to-one FK.
- **meal_plan_entries** — `id`, `user_id`, `planned_on` (`DATE`, mapped to
  `date` in the API), `recipe_id` (`NOT NULL`, `ON DELETE CASCADE`),
  `UNIQUE(user_id, planned_on)` — one recipe assigned to one calendar day, at
  most one entry per user per day. See [Weekly meal planner](#weekly-meal-planner)
  below.
- **users.import_model** — nullable `TEXT`, the user's magic-import model
  preference (`NULL` = Automatic).
- **users.recipe_language / unit_system / temperature_unit / keep_spoons** —
  the Settings page's "Language & units" preferences. `recipe_language` is
  nullable `TEXT` `CHECK IN ('nl','en')` (`NULL` = keep the original);
  `unit_system` `'metric'|'us'` (default `metric`), `temperature_unit`
  `'C'|'F'` (default `C`), `keep_spoons` `BOOLEAN` (default `true`). See
  [Language, units & scaling](#language-units--scaling).
- **llm_usage** — `usage_day` (`DATE`, Pacific time), `model`, `requests`,
  `prompt_tokens`, `output_tokens`, primary key `(usage_day, model)`. Global,
  not per-user. See [Magic import settings](#magic-import-settings) below.
- **import_jobs** — `id`, `user_id`, `url`, `collection_id` (nullable,
  `ON DELETE SET NULL`), `status` (`running`/`done`/`error`/
  `cancelled`), `seen_stages` (`TEXT[]`), `recipe` (`JSONB`, the unsaved
  `RecipeInput`), `image_url`, `translation_skipped` (`BOOLEAN`, the user
  wanted a translation that couldn't happen), `error_status`,
  `error_message`, `reviewed_at`, `created_at`, `updated_at`. One row per recipe import — see
  [Import jobs & push notifications](#import-jobs).
- **push_subscriptions** — `id`, `user_id`, `endpoint` (`UNIQUE`), `p256dh`,
  `auth`, `created_at`. One row per device opted into Web Push.

Not modeled yet, deliberately: ratings/notes, nutrition facts, grocery lists.
These are post-MVP (see [index.md](index.md)) and will get their own
migrations when built, rather than speculative columns now.

## Collections

Collections are nested, folder-like containers: `collections.parent_id`
self-references `collections.id` (nullable — `NULL` means a root/top-level
collection), with unlimited nesting depth. A collection is explicitly named
and created/renamed/moved/deleted by the user (`collections.user_id` gives it
the same ownership identity `recipes` has), which is what keeps it a
genuinely separate concept from `tags` — a tag is attribute-like: free-text,
global (not per-user), and implicitly created/destroyed as a side effect of
editing a recipe's tag list, whereas a collection is a first-class,
user-managed object with its own CRUD and — unlike a tag — a recipe lives in
exactly one place.

**Every recipe lives in exactly one place: one collection, or Home.** The
library is a folder tree whose root, **Home**, is itself a place recipes can
live — `recipes.collection_id` is a *nullable* foreign key (not a
many-to-many join table), and `NULL` means "directly at Home". Moving a
recipe changes that single value (`PATCH /recipes/:id/collection`, with
`collectionId: null` meaning "move to Home"). A recipe created with no
explicit `collectionId` lands at Home. (Before 2026-09-23 the column was
`NOT NULL` and such recipes went into an auto-created "Other" collection —
see [decisions.md](decisions.md#2026-09-23-library-unified-recipes-may-live-at-home).)

**Sibling name uniqueness needs two partial indexes, not one plain
constraint.** Two collections may share a name as long as they aren't
siblings (different parents, or one root-level and one not), but Postgres
treats `NULL <> NULL` in a unique constraint — a single
`UNIQUE(user_id, parent_id, name)` would let two root-level collections both
be named "Desserts". `collections_root_sibling_name_idx` (`WHERE parent_id IS
NULL`) and `collections_child_sibling_name_idx` (`WHERE parent_id IS NOT
NULL`) enforce the two cases separately.

**Deleting a collection cascades destructively**: `ON DELETE CASCADE` on both
`collections.parent_id` and `recipes.collection_id` means deleting a
collection recursively deletes every sub-collection and every recipe nested
anywhere inside it, in one `DELETE` statement — a deliberate choice, matching
a literal "delete the folder and everything in it" over promoting contents to
the parent or blocking a non-empty delete. Since that cascade happens at the
database level, it never touches the filesystem — the route
(`backend/src/routes/collections.ts`) collects every image file path in the
subtree via a recursive CTE (`getCollectionSubtreeImagePaths`) *before*
issuing the delete (the rows won't exist to query afterward), then unlinks
those files. Recipes at Home are never touched by any collection delete.

**A recursive CTE (`WITH RECURSIVE`) walks the tree in three places**: the
file-path collection above and `wouldCreateCycle` (which rejects reparenting
a collection underneath its own descendant), both in
`backend/src/repositories/collections.ts`, plus the `within` recipe filter in
`backend/src/repositories/recipes.ts` (see [Library browsing & search](#library-browsing--search)).
Each walks the tree in one round trip rather than one query per level — the
standard Postgres pattern for unknown-depth tree traversal.

### Library browsing & search {#library-browsing--search}

There is one place to find recipes: the library (`CollectionsPage`, serving
`/` for Home and `/collections/:id` for any folder). There is no separate
"all recipes" page any more — the old `/recipes` URL redirects to `/`,
keeping `?q`/`?tag`.

- **Browse mode** (no `?q`/`?tag`): a folder's direct sub-collections (from
  the flat `GET /collections` list, filtered by `parentId` client-side), then
  the recipes *directly* in it — `GET /recipes?collection=<id>`, or
  `?collection=root` for Home.
- **Search mode** (`?q` from the header's always-visible `LibrarySearch`
  box, and/or `?tag` from a clicked tag chip): a flat result list covering
  that folder **and everything beneath it** — `GET /recipes/search?q=…&within=<id>`
  (or `GET /recipes?tag=…&within=<id>` for a tag-only filter). At Home there
  is no `within`, so it's the whole library. Each result is captioned with
  its folder path, and a "Search everywhere" link drops the scope.
- Searching from a non-library page (a recipe, the meal plan) jumps to
  Home's results — i.e. the whole library.
- Every folder, Home included, has **New recipe** (`/recipes/new?collection=<id>`)
  and **Import** buttons that file the new recipe straight into that folder;
  an import carries the folder through `ImportProvider` into the create
  form's router state.

`collection` and `within` are validated as positive integers (or `"root"`)
by `recipeFiltersSchema`, and every query is already scoped by `user_id`, so
a `within` pointing at someone else's collection simply matches nothing.

See
[decisions.md](decisions.md#2026-08-28-collections-redesigned-as-a-nested-mandatory-hierarchy-becomes-the-home-page)
for the full reasoning and what this supersedes.

## Weekly meal planner {#weekly-meal-planner}

A single ongoing calendar per user — `meal_plan_entries(user_id, planned_on,
recipe_id)` with `UNIQUE(user_id, planned_on)` — not a `meal_plans` entity a
user creates/names/switches between. There's exactly one calendar, browsed
week by week (`GET /meal-plan?start=YYYY-MM-DD&end=YYYY-MM-DD`, always a
7-day span from the frontend, Monday-start per European convention). The
range shape is deliberate: "recipes planned in date range X–Y" is exactly
what the next roadmap item, grocery list generation, will need, so that
feature can query this same table/endpoint unchanged rather than needing its
own.

`PUT /meal-plan/:date` assigns (or replaces) the recipe for a day —
idempotent set-or-replace via `INSERT ... ON CONFLICT (user_id, planned_on)
DO UPDATE`, the same reasoning as `PUT /collections/:id`. `recipe_id` is
`NOT NULL` with `ON DELETE CASCADE`: an entry carries no data beyond "which
recipe, which day," so when the recipe is deleted the day simply goes back
to empty rather than leaving a null-recipe row behind. See
[decisions.md](decisions.md#2026-08-28-weekly-meal-planner) for why this was
chosen over a nullable `SET NULL` FK.

**A `DATE` column needs an explicit text cast on the way out, or dates
silently shift by a day.** `meal_plan_entries.planned_on` is this schema's
first plain `DATE` column (everything else is `TIMESTAMPTZ`) — a meal-plan
slot is a calendar day, not a point in time. `pg`'s default type parser turns
a `DATE` into a JS `Date` at local midnight; serializing that back out with
`JSON.stringify` converts to UTC, which silently shifts the date a day
earlier on any host east of UTC (the homelab's own timezone included). The
repository (`backend/src/repositories/mealPlan.ts`) casts explicitly
(`planned_on::text AS date`) in every query instead of letting `pg` hand
back a `Date` — the fix is one `::text`, but it's easy to reintroduce this
bug by adding a new query that selects `planned_on` directly. The backend
never computes a date itself for the same reason: every date in a request is
a client-supplied `"YYYY-MM-DD"` string, stored/filtered/echoed as-is.

The frontend has no date library (none was a dependency before this
feature, and CLAUDE.md's "no unnecessary dependencies" rule applies) — week
math (`startOfWeekMonday`, `addDays`, `weekDates`, `formatWeekLabel`) is
hand-rolled in `frontend/src/lib/week.ts`, built from a `Date`'s *local*
calendar fields, never `toISOString()`, which reads UTC fields and would
shift the same way described above.

## Search

Postgres full-text search (`tsvector`/`tsquery`) over `recipes.title`,
`ingredients.name`, `steps.instruction`, and `tags.name`, materialized into an
indexed `recipes.search_vector` column. Chosen over plain `LIKE` queries for
relevance ranking, and over a dedicated search engine (Elasticsearch/Meilisearch)
because it needs no extra infrastructure and comfortably handles a personal-scale
recipe collection. Tag-based browsing is implemented as an optional `tag` query
param on `GET /recipes` and `GET /recipes/search`, combinable with the
full-text query — an `EXISTS` subquery against `recipe_tags`/`tags` rather than
a `JOIN`, so it can't multiply rows or disturb `ORDER BY`/`ts_rank`. Reached by
clicking a tag chip on a recipe card or the detail page, which opens the
library filtered via `/?tag=…`; there's no separate "browse all tags" listing
UI — an early version had one (backed by a `GET /recipes/tags` endpoint), but
it read as clutter above the recipe grid and was removed. Both filters can
also be scoped to a folder's subtree with `within` — see
[Library browsing & search](#library-browsing--search).

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
Since Nosh became publicly reachable (2026-09-24), app-level defenses carry
the weight Tailscale used to: signup is off unless `ALLOW_SIGNUP=true`; login
is rate-limited per client IP and per account (failures only) with a delay
on each failure; every POST/PUT/PATCH/DELETE must come from a configured
origin (`Origin`, else `Sec-Fetch-Site`); the session cookie is `HttpOnly`,
`SameSite=Lax`, `Path=/`, host-only (no `Domain`) and `Secure` whenever the
request came over HTTPS. The client IP and scheme come from
`X-Forwarded-*` only when sent by the exact proxy IPs in `TRUSTED_PROXIES`.
See [decisions.md#2026-09-24-public-https-behind-caddy](decisions.md#2026-09-24-public-https-behind-caddy).

Database access throughout the backend is raw SQL via `pg` (node-postgres) —
deliberately no ORM or query builder, to keep the Postgres learning goal front
and center.

## Recipe import (URLs) {#recipe-import-urls}

`POST /import` takes `{ url }` and yields an unsaved `RecipeInput` for the
frontend to pre-fill the normal create form with — no *recipe* is persisted
until the user reviews it and submits that form through the existing
`POST /recipes` path. The import itself runs as a server-side job that the
frontend polls for progress and the result, so it survives the app being
closed mid-import — see [Import jobs & push notifications](#import-jobs)
below. Extraction is two-stage:

1. **schema.org JSON-LD** — the page's `<script type="application/ld+json">`
   blocks are parsed (via `cheerio`) looking for a `Recipe` node, handling the
   common real-world shapes (bare object, array, `@graph`-wrapped,
   `HowToStep`/`HowToSection` instructions, ISO-8601 durations). Most recipe
   sites publish this, so the common case costs no LLM call at all.
2. **Gemini fallback** — when there's no usable JSON-LD, the page is stripped
   to plain text, truncated, and sent to the Gemini API with a `responseSchema`
   constraining the output to `RecipeInput`'s shape.

Either way the result is validated with the same `recipeSchema` the recipe
routes use, then translated and unit-converted to the user's preferences
(see [Language, units & scaling](#language-units--scaling)), `source_url` is set to the imported URL, and two normalizations
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

The recipe's source photo is auto-imported too (schema.org `image`, falling
back to an `og:image`/`twitter:image` meta tag) — see
[Recipe photo auto-import](#recipe-photo-auto-import) below, which covers
both import paths since it hangs off the same `/import` response.

## Recipe import (Instagram Reels / TikTok)

Shares the same `POST /import` endpoint and `source_url` column as URL
import above — `recipeExtraction.ts` dispatches on hostname
(`services/socialVideo.ts`'s `detectSocialPlatform`) before doing anything
else. There's no schema.org fast path for a video post, so this is a single
extraction route:

1. **`yt-dlp`** (shelled out to via `child_process.execFile`, installed from
   Alpine's own package repo rather than upstream's PyInstaller binary — see
   [decisions.md](decisions.md#2026-08-12-instagram-reelstiktok-import--yt-dlp--gemini-flash-lite))
   fetches the post's metadata first (cheap, no video bytes — used to reject
   an over-long video before spending bandwidth on it), then the video
   itself, capped to `height<=480` and streamed straight to a `Buffer` over
   stdout rather than a temp file. **Every connection yt-dlp opens goes
   through the backend's in-process egress proxy** (`services/egressProxy.ts`,
   `--proxy http://127.0.0.1:<ephemeral port>`), which applies the same
   address guard as the backend's own fetches — see
   [Outbound network calls](#outbound-network-calls).
2. The video (as inline base64) plus the caption go to Gemini in one
   multimodal call — the caption alone is often missing the actual steps
   (many recipe creators only caption the ingredients), so the model has to
   watch the clip to recover technique and timing, not just read text.

Both extraction paths converge back on the same `sanitizeCandidate` →
`recipeSchema` → ingredient/tag normalization pipeline URL import uses. The
text and video paths use different Gemini models
(`GEMINI_TEXT_MODEL`/`GEMINI_VIDEO_MODEL`, both overridable, defaulting to
`gemini-3.6-flash`/`gemini-3.5-flash-lite`) — video's per-request token cost
is high enough that quota matters more than model tier, and a live
side-by-side found no quality loss from the lighter model. Local/self-hosted
LLM was considered and rejected for this feature due to the ProDesk 400 G5's
limited hardware — see [decisions.md](decisions.md).

**Verified live against a real Instagram Reel** end-to-end (import →
pre-filled form → save → detail page's source link), including a case where
the caption had no steps at all and the model recovered them purely from
the video. **Not verified live against a real TikTok URL** — the same
`yt-dlp` extractor and pipeline handle both platforms, but only Instagram
was actually exercised. Do a real TikTok import before considering this
fully proven for that platform. (The yt-dlp half has since run live
against a real TikTok post through the egress proxy, metadata and video.
Only the Gemini step is still unexercised for TikTok.)

## Recipe photo auto-import {#recipe-photo-auto-import}

Both import paths above discover the recipe's photo alongside its data and
report it as a separate `imageUrl` field on the import job
(never as part of `RecipeInput` — recipe images are their own DB entity, keyed
off a recipe id that doesn't exist until the recipe is saved, so this rides
alongside the persisted fields rather than becoming one of them):

- **URL import** — schema.org's `image` property if JSON-LD was usable,
  otherwise an `og:image`/`twitter:image` meta tag (`jsonLd.ts`'s
  `extractMetaImageUrl`) — checked even on the Gemini-fallback path, since
  it's cheaper and more reliable than asking the model to locate an image in
  page text. Resolved to an absolute URL against the page's own URL.
- **Instagram/TikTok import** — `yt-dlp`'s own `thumbnail` field from the
  metadata call already made for duration/caption, so no extra request.

The frontend carries `imageUrl` through the same router-state handoff as the
pre-filled recipe (`importedImageUrl`), and once the user reviews and saves
normally through `POST /recipes`, calls a new
`POST /recipes/:id/images/from-url` with it — the earliest point a recipe id
exists to attach an image to. That route
(`services/imageFromUrl.ts`) reuses `recipeExtraction.ts`'s SSRF guard
(`validateUrl`, exported for this; plus `services/safeFetch.ts`, which
re-checks every address a hostname resolves to at connect time) and manual
redirect re-validation, since
this URL travels back from the browser in a request body and isn't provably
the same one the server discovered. Content-type is checked against the same
`IMAGE_MIME_EXTENSIONS` allowlist the manual multipart upload uses, and size
is capped at the same 5MB.

This is deliberately best-effort from the frontend's point of view: the
recipe is already saved by the time this call runs, so a failure (404,
blocked host, unsupported type, oversized) is swallowed with a toast
("Couldn't import the photo — add one manually") rather than surfaced as a
save error.

## Magic import settings (model choice + usage estimate) {#magic-import-settings}

A **Settings** page (`/settings`, reached from the user menu) has a "Magic
import" section where each user picks which Gemini model AI-assisted import
uses, and sees roughly how much of each model's daily free-tier quota is
left.

- **Model choice** is a per-user preference, `users.import_model` (nullable
  `TEXT`; `NULL` = "Automatic", i.e. today's behavior — `GEMINI_TEXT_MODEL`
  for web pages, `GEMINI_VIDEO_MODEL` for videos). A chosen model applies to
  both paths. `GET`/`PUT /settings/magic-import` read and write it.
- **Allowed models** are runtime config, not schema: `GEMINI_MODELS`
  (`id=dailyLimit,…`, parsed by `config/llmModels.ts`), with the two
  per-path defaults always included. The server checks a chosen id against
  that list on write *and* again on every import (`resolveImportModel`) — the
  id ends up in Gemini's request URL, and a preference saved before the list
  shrank silently falls back to Automatic rather than failing imports.
- **Usage** is counted by Nosh itself, since Gemini exposes no
  quota-remaining endpoint: the Gemini client takes an `onUsage` hook
  (wired to `repositories/llmUsage.ts` in `index.ts`) that upserts one row
  per `(usage_day, model)` in `llm_usage` for every request Google answered,
  adding the tokens from the response's `usageMetadata` (thinking tokens
  count as output). A failure to record never fails the import. The table is
  **not** per-user — Gemini's limits are per Google project, so every Nosh
  user draws from the same budget — and `usage_day` is the **Pacific**
  calendar day, computed in SQL, because that's when Google resets
  requests-per-day quotas.

The page labels every number as an estimate: calls made with the same key
outside Nosh (AI Studio, another app) aren't seen. See
[decisions.md](decisions.md#2026-09-24-magic-import-settings) for the
reasoning.

## Import jobs & push notifications {#import-jobs}

An import can take up to a minute (a Reels/TikTok video), and on a phone the
user wants to start one and put the phone away. So imports are server-side
jobs rather than a request the client must keep open — see
[decisions.md](decisions.md#2026-09-24-imports-become-server-side-jobs-with-push-notifications).

**Backend.**
- `POST /import` validates the URL, inserts an `import_jobs` row and answers
  `202` with the job straight away.
- `services/importJobs.ts` then runs the extraction in-process,
  fire-and-forget. It is not a queue, just an unawaited async function, and
  each job's `AbortController` sits in an in-memory map so
  `POST /import/:id/cancel` can stop it.
- While it runs, each stage is appended to `seen_stages`. At the end the row
  becomes `done` (with `recipe`/`image_url`) or `error` (with the HTTP status
  the failure maps to, plus a message).
- Every job-state write is guarded by `status = 'running'`, so a job that
  was cancelled mid-flight can't be resurrected by a late result.
- At boot, `recoverImportJobs` marks rows still `running` as `error`, since
  their process is gone (a deploy or Watchtower restart). It also prunes
  finished jobs older than a week.

**Frontend.** `ImportProvider` polls `GET /import/:id` about once a second
while the page is visible. It pauses when the page is hidden and polls
immediately on becoming visible again.
- **Launch restore.** On sign-in or launch it calls `GET /import` (running
  jobs plus finished-but-unreviewed ones) and restores the newest. That is
  what makes "close the app, reopen, the result is waiting" work, with or
  without push.
- **Marking reviewed.** A result counts as reviewed (`POST /import/:id/reviewed`)
  once it has been shown: the create form opened with it, or its error
  displayed.
- **The `/recipes/new?importId=` route.** A finished import opens this URL.
  `NewRecipePage` fetches the job when router state doesn't already carry the
  recipe, as happens when a tapped notification cold-starts the app, and
  writes it into router state before `RecipeFormPage` mounts.

**Push.**
- When a job finishes, `services/pushNotifier.ts` sends a Web Push message
  (via the `web-push` library, VAPID-signed) to each of the user's
  `push_subscriptions`: "Recipe ready" or "Import failed".
- `src/sw.ts`, the app's service worker (vite-plugin-pwa `injectManifest`),
  shows it as a notification. Tapping it focuses or opens the app at the
  payload's URL.
- Push services answering 404/410 get the subscription deleted.
- Endpoints come from the client, so they're allowlisted to the real push
  services (`services/pushEndpoint.ts`: https, port 443, Apple/FCM/Mozilla/
  WNS hosts) on subscribe *and* before every send, and the send connects
  through the guarded DNS lookup. A stored endpoint that fails either check
  is deleted without being posted to.
- Opt-in happens from a tap: the import dialog's "Notify me when it's done"
  button, or a toggle in the user menu. `POST /push/subscriptions` stores
  the browser's subscription.
- The public key is served at runtime by `GET /push/vapid-public-key`.
- With no `VAPID_*` env vars, push is off: the `/push` routes return 503, the
  UI hides its controls and jobs finish silently.
- The notification controls are also hidden wherever the browser can't
  receive pushes. Web Push is secure-context-only, and on iOS it exists only
  in the app added to the home screen.
- The sender is injected via `createApp` (`AppDeps.sendPush`), so tests
  never reach a real push service.

## Outbound network calls {#outbound-network-calls}

The backend's Docker networks can reach the host and everything it
publishes, so every request whose destination comes from a user or a remote
page goes through one address guard: `resolveCheckedAddresses` in
`services/safeFetch.ts`. It resolves the host, refuses the lot if *any*
address is private/loopback/link-local/CGNAT/reserved, and the caller then
connects to that checked address — no second lookup for DNS rebinding.

| Call | Destination comes from | Guard |
| --- | --- | --- |
| Recipe page fetch (`recipeExtraction.ts`) | user | `safeFetch` (guarded lookup) + `validateUrl` for literals, every redirect hop re-validated |
| Photo from URL (`imageFromUrl.ts`: schema.org image, og:image, yt-dlp thumbnail) | remote page, via the browser | same as above |
| yt-dlp (metadata, video, redirects, CDN) | user + platform API responses | egress proxy: `CONNECT`/plain HTTP, ports 80/443 only, checked IP connected to; proxy env vars stripped, `--ignore-config`, `--downloader native` so ffmpeg never fetches |
| ffmpeg | — | never given a URL (`--downloader native`, `--fixup never`, no merged formats) |
| Web Push (`pushNotifier.ts`) | client (subscription endpoint) | host allowlist on subscribe and send + guarded lookup on the send's socket |
| Gemini (`llm/geminiClient.ts`) | fixed constant `generativelanguage.googleapis.com` | trusted fixed host; plain `fetch` |
| Postgres (`pg`) | `DATABASE_URL` from `.env` | operator-configured, not user input |

yt-dlp is the only child process in production (`test/migrate.ts`'s
`spawnSync` runs migrations in tests only). Nothing else uses axios,
undici, `net.connect` or `tls.connect`.

The egress proxy binds `127.0.0.1` only, and there is no way to build the
video downloader without it (`createSocialVideoDownloader` requires the
proxy URL; with no downloader injected, a Reels/TikTok import fails with
503).

## Language, units & scaling {#language-units--scaling}

Ingredient amounts are stored as free text (`"1 1/2"`, `"½"`, `"2-3"`,
`"2 x 400"`), so everything that does arithmetic on them goes through one
shared workspace package, **`packages/units` (`@nosh/units`)** — pure
TypeScript, no dependencies:
- `parseQuantity` evaluates the text (singles incl. fractions and comma
  decimals, ranges, multipacks); anything else is `null` and shown as
  written.
- `lookupUnit` knows measurable units in English *and Dutch* (`el`, `tl`,
  `eetlepel`…) with their exact metric factors; count units (clove, blik,
  kopje…) are recognised but never converted. The same word list feeds the
  backend's ingredient-line parser.
- `convertIngredient` scales by a factor, converts to metric or US and
  "auto-tidies" (1500 g → 1.5 kg, 48 tsp → 1 cup), formatting exactly to two
  decimals. `convertTemperaturesInText` rewrites explicit oven temperatures
  in step text. `anchorFactor` computes "the recipe says 150 g, I have
  200 g".

**How both apps consume it.** The package's `exports` has a `"source"`
condition pointing at `src/index.ts`. Vite (build, dev and Vitest), the
backend's Vitest config and `tsx --conditions=source` in backend dev all
resolve that, so nothing needs a prebuilt `dist/`. The backend's `tsc -b`
builds the package through a TypeScript project reference, and the
production backend image runs its compiled CommonJS `dist/`. See
[decisions.md](decisions.md#shared-units-package).

**Where conversion happens.**
- **On display** (`RecipeDetailPage`): every recipe — typed in or
  imported — is converted to the user's preferences at render time, derived
  with `useMemo` from the stored recipe, the scale factor and the
  preferences (`useRecipePreferences`). Scaling (the servings stepper, or
  "I have…" on a tappable amount) is view-only state: a single factor.
- **On import** (`services/recipeExtraction.ts`): after validation, a
  schema.org recipe that isn't already in the user's `recipe_language`
  (`services/recipeLanguage.ts`, a stopword count) is translated with one
  extra Gemini call (`createGeminiTranslator`); the AI paths are told the
  language in their own prompt instead. Translation fails open
  (`import_jobs.translation_skipped`, a banner on the review form). *Then*
  `services/recipeUnits.ts` converts amounts and temperatures, so the
  pre-filled form — and the saved recipe — is already in the user's units.

Preferences are one resource, `GET/PUT /settings/recipe-preferences` (PUT
takes any subset of fields). See
[decisions.md](decisions.md#2026-09-25-recipe-units-and-language) for the
reasoning behind the choices.

## Deployment target

Docker containers on an HP ProDesk 400 G5 (ZimaOS), managed via Dockge, reachable
at `https://nosh.itsthomassito.com` through the homelab's Caddy (Tailscale-only
before 2026-09-24). Concrete build/release/CD mechanics live in
[deployment.md](deployment.md) (maintained separately by the project owner).

# Decisions

A running log of notable decisions and the reasoning behind them. Append new
entries; don't edit history. If a decision is reversed or superseded, add a new
dated entry that says so and links back to the one it replaces.

## 2026-08-05: Tech stack — React/Tailwind + Node.js/TypeScript + PostgreSQL

**Decision:** Frontend in React + Tailwind, backend in Node.js/TypeScript
(strict mode), database PostgreSQL. Monorepo on GitHub.

**Why:** Project has two goals — a working recipe manager, and hands-on learning
of a stack that's in high demand in the job market. Maintainer already knows
Angular/Java professionally and deliberately chose *not* to reuse that stack, to
maximize the learning value. React/Node/TS/Postgres is a widely-used, well
documented combination.

**Alternatives considered:** Reusing Angular/Java (rejected — defeats the
learning goal); Go, Python (FastAPI/Django), Rust for backend (rejected — less
directly transferable to the mainstream JS full-stack job market the maintainer
is targeting); SQLite (rejected — Postgres is the more broadly useful skill and
the extra operational overhead is negligible on a home server); MongoDB
(rejected — recipes are naturally relational, and losing relational integrity
wasn't worth it for a document-model that MVP doesn't need).

## 2026-08-05: Multi-user-ready schema {#multi-user-ready-schema}

**Decision:** Nosh is single-user today, but every table that logically belongs
to a user (recipes, etc.) carries a `user_id` foreign key from the first
migration, and auth is a full account system (not a shared passphrase).

**Why:** Retrofitting user-scoping onto an already-populated single-tenant
schema is a painful migration (backfilling ownership, rewriting every query).
Paying a small, near-zero-cost complexity tax now avoids that later, in case the
project ever grows beyond one user.

**Alternatives considered:** Fully single-user schema with no `user_id` at all
(rejected — cheap now, expensive later); building full multi-tenant support
(roles, invites, sharing) now (rejected — speculative, no current need, would
slow down MVP).

## 2026-08-05: MVP scope is manual CRUD only

**Decision:** The MVP is manual recipe create/read/update/delete (title,
ingredients, steps, photo, tags, servings, prep/cook time) plus search and full
login. No import, meal planning, grocery lists, or LLM features in v1.

**Why:** Ship something usable quickly; every other discussed feature (import,
meal planning, nutrition, grocery integration) depends on the core recipe model
existing and being stable first.

## 2026-08-05: Search via Postgres full-text search

**Decision:** Use Postgres `tsvector`/`tsquery` full-text search over recipe
title, ingredients, steps, and tags, rather than plain `LIKE` queries or a
dedicated search engine.

**Why:** Better relevance than substring matching, with zero additional
infrastructure — appropriate for a personal-scale recipe collection (dozens to
low hundreds of recipes). Elasticsearch/Meilisearch would add an operational
dependency with no benefit at this scale.

**Alternatives considered:** Simple `ILIKE` search (rejected — poor relevance,
though it was the zero-effort option); Meilisearch/Elasticsearch (rejected —
disproportionate operational cost for a single-user homelab app; revisit only if
recipe volume or query complexity grows far beyond current expectations).

## 2026-08-05: Recipe import via cloud LLM (post-MVP)

**Decision:** When recipe import is built, it will extract structured data
(ingredients, steps, nutrition, photo) from URLs, Instagram Reels, and TikTok
using a cloud LLM API (e.g. Anthropic/OpenAI), not a local/self-hosted model or
static HTML scraping.

**Why:** Social video content (Reels/TikTok) isn't reliably parseable with
static scraping or schema.org markup — it needs genuine content understanding.
A local LLM on the HP ProDesk 400 G5 was considered but the hardware likely
can't run a model capable of reliable extraction from messy video/text content
at acceptable quality or speed.

**Alternatives considered:** Local LLM via Ollama (rejected for this feature —
hardware-limited; may be reconsidered for lighter-weight future AI features);
static scraping library / schema.org parsing (rejected as the sole method — too
narrow, doesn't cover social video sources, though it may still be worth using
as a fast-path for plain recipe-site URLs alongside the LLM path).

## 2026-08-05: Full login instead of a shared passphrase

**Decision:** Nosh uses real username/password accounts with hashed passwords,
not a single shared app-level passphrase, even though it's single-user and only
reachable via Tailscale.

**Why:** Consistent with the multi-user-ready schema decision above, and a more
useful pattern to have actually built when learning the stack.

**Alternatives considered:** Shared passphrase gate (rejected — minimal learning
value, and inconsistent with the multi-user-ready schema); no app-level auth,
relying solely on Tailscale (rejected — same reasoning).

## 2026-08-05: No rate limiting / lockout for v1

**Decision:** No login rate limiting, account lockout, or general API throttling
in v1.

**Why:** Tailscale is the accepted primary security boundary for a single-user
app with no public exposure. This can be revisited if that exposure model ever
changes (e.g. if Nosh is ever shared with other households or exposed publicly).

## 2026-08-05: Local disk storage for recipe images

**Decision:** Recipe photos and other uploads are stored on a local Docker
volume, not in S3-compatible object storage (e.g. MinIO).

**Why:** Single-node homelab deployment; a local volume is simpler to set up and
sufficient at this scale. Revisit only if Nosh ever needs to run across multiple
nodes or needs independent backup/replication of media separate from the app.

## 2026-08-05: Deployment target and CD mechanism

**Decision:** Nosh deploys as Docker containers on an HP ProDesk 400 G5 (ZimaOS),
managed via Dockge, reachable only via Tailscale (no reverse proxy or TLS
termination needed inside Nosh). GitHub Actions builds/tests/builds Docker
images; auto-deploy on merge to `main` uses the homelab's existing Watchtower
instance (already running homelab-wide) to pull new images, rather than a
self-hosted Actions runner on the homelab box — so the homelab never needs to
expose anything to GitHub or hold deploy credentials.

**Status:** Confirmed. Watchtower is already deployed and running homelab-wide;
Nosh just needs to publish images to a registry it polls. See
[deployment.md](deployment.md).

**Why:** A self-hosted runner would need standing access on the homelab machine
and, if compromised via a GitHub-side issue, could act on the network Tailscale
otherwise protects. A pull-based updater only ever reaches out, never accepts
inbound instructions from GitHub.

## 2026-08-05: Backups deprioritized for v1

**Decision:** No automated backup strategy in v1.

**Why:** Explicitly deprioritized by the project owner at this stage. Revisit
before the recipe collection grows large enough that losing it would hurt.

## 2026-08-06: Project setup tooling choices {#project-setup-tooling-choices}

**Decision:** Backend web framework is Express (not Fastify or NestJS). Monorepo
package management is pnpm workspaces (not npm workspaces or a tool like
Turborepo). Frontend build tool is Vite with Tailwind CSS v4 (via the
`@tailwindcss/vite` plugin, no separate PostCSS config needed). Backend
TypeScript compiles to CommonJS (not ESM/`NodeNext`) for simplicity.

**Why:** Express is the most widely used and most transferable Node framework
for the job-market-relevance goal, and is close in spirit to writing plain
servlets rather than a full opinionated framework — Fastify was a reasonable
runner-up, NestJS was rejected as too close to reintroducing Angular/Spring-style
structure, which works against the learning goal of this stack. pnpm was the
maintainer's explicit choice over npm workspaces. Tailwind v4's Vite plugin
removes a class of config (no `tailwind.config.js`/`postcss.config.js` needed)
compared to v3, which fits the "don't introduce unnecessary config" preference.
CommonJS output avoids the Node ESM "relative imports need explicit `.js`
extensions in TypeScript source" gotcha, which has no payoff for a small backend
at this stage.

**Two real issues hit while verifying the scaffold (both fixed):**
1. pnpm 11 requires explicit opt-in for dependency install/build scripts
   (`allowBuilds` in `pnpm-workspace.yaml`). `esbuild` (a transitive dependency
   of Vite/Vitest/tsx) needs its postinstall script to fetch the right platform
   binary, so it's allowed there.
2. The frontend's own `vite` devDependency (`^6.x`) and the copy `vitest`
   pulls in internally (`^5.x`, via `@vitest/mocker`) resolved to two different
   major versions side by side, which broke `tsc -b` (incompatible duplicate
   `Plugin`/`UserConfig` types). Fixed by pinning the frontend's `vite` to
   `^5.4.11` so pnpm dedupes to a single copy. Revisit if a future vitest
   release relaxes that internal pin and vite 6 is wanted for its own sake.

**Alternatives considered:** npm workspaces (rejected — maintainer specifically
wanted pnpm); Fastify/NestJS for backend (rejected — see above); Tailwind v3
(rejected — v4's simpler setup has no real downside for a new project).

## 2026-08-06: Backend MVP — DB access, auth mechanism, and supporting libraries

**Decision:** Database access is raw SQL via `pg` (node-postgres) — no ORM or
query builder. Auth uses server-side sessions (`express-session`, backed by a
Postgres store via `connect-pg-simple`, httpOnly cookie) rather than JWTs.
Passwords are hashed with `argon2`. Migrations run through `node-pg-migrate`
(JS migration files that mostly call `pgm.sql(...)` with real SQL, rather than
its table-builder DSL, to keep the SQL itself visible). Image uploads use
`multer` writing to local disk. Request body validation uses `zod`.

**Why:** Raw `pg` was chosen over Drizzle/Prisma specifically because
docs/index.md's learning goal is Postgres itself — an ORM would trade that
transparency for convenience. Sessions were chosen over JWTs because they're
actually revocable (logout works) and map onto a more classic web-auth model,
which was judged more valuable to have built once than a stateless token
scheme. `node-pg-migrate` avoids hand-rolling a migration runner (a solved
problem with no learning payoff) while still requiring hand-written SQL for
the schema itself. `multer` and `zod` are both small, standard, and directly
address a real need (multipart file handling, request validation) rather than
being speculative — consistent with "don't introduce unnecessary
dependencies."

**Alternatives considered:** Drizzle ORM (rejected — still worthwhile to learn
someday, but competes with the raw-SQL learning goal now); Prisma (rejected —
furthest from raw SQL of the three); JWT auth (rejected — harder revocation,
no strong benefit for a server-rendered-session-friendly single-page app
talking to its own backend); bcrypt over argon2 (no strong reason either way;
argon2 is the more modern recommendation); hand-rolled migration runner
(rejected — reinvents a solved problem).

## 2026-08-06: Full-text search implemented via triggers, not a single generated column

**Decision:** `recipes.search_vector` (tsvector, GIN-indexed) is maintained by
triggers rather than a single Postgres `GENERATED ALWAYS AS` column. A
`BEFORE INSERT OR UPDATE` trigger on `recipes` sets the column from the
recipe's own `title`/`description`. Separate `AFTER INSERT OR UPDATE OR DELETE`
triggers on `ingredients`, `steps`, and `recipe_tags` call a shared function
that recomputes the owning recipe's `search_vector` by re-aggregating title,
description, ingredient names, step instructions, and tag names with
`setweight`.

**Why:** This supersedes the wording in
[architecture.md](architecture.md#search) ("combined via a generated/indexed
column"), which isn't achievable as written — Postgres generated columns can
only reference columns on the same row, and the search corpus here spans four
tables. Triggers are the standard Postgres pattern for cross-table
denormalized/materialized search columns, and keep search queries a simple
indexed lookup on `recipes` with no query-time joins or aggregation.

**Alternatives considered:** Compute `to_tsvector` at query time via joins and
`string_agg` (rejected — would need to happen on every search request with no
index support, or land in a materialized view that itself needs manual
refresh; the trigger keeps the same effect eagerly and simply); a
`GENERATED ALWAYS AS` column (rejected — not supported across tables).

## 2026-08-06: CORS added to the backend for the frontend's cross-origin session cookie {#2026-08-06-cors-added-to-the-backend-for-the-frontends-cross-origin-session-cookie}

**Decision:** The backend now runs the `cors` middleware (`credentials: true`,
`origin` restricted to a single configurable `FRONTEND_ORIGIN`, defaulting to
`http://localhost:5173`), and the frontend's fetch wrapper always sends
`credentials: "include"`. This supersedes the "there's no CORS" line in the
2026-08-06 image-auth decision below, written before any frontend existed.

**Why:** `docker-compose.yml` runs the frontend and backend on separate ports
(`:5173` / `:3001`), and `architecture.md` already rules out a reverse proxy
inside Nosh's own containers — so the browser sees them as different
*origins*. They're still the same *site* (same hostname, whether
`localhost` in dev or a Tailscale MagicDNS name in prod) so the existing
`SameSite=Lax` session cookie is unaffected, but the browser blocks the
`fetch` calls themselves without explicit CORS headers. A small, standard
middleware was the direct fix.

**Alternatives considered:** A Vite dev-server proxy to make requests
same-origin (rejected — only solves this in dev; the deployment target still
runs frontend/backend on separate ports/origins, so the same fix would be
needed again in prod, whereas the CORS approach works unchanged in both);
merging frontend and backend behind a single origin/port (rejected as a
bigger change than this backlog item called for — worth reconsidering
if/when the Deployment backlog group's Compose file is written).

## 2026-08-06: Login switched from email to username

**Decision:** Accounts now have a required, unique `username` (letters,
numbers, underscores; 3–32 chars) alongside `email`. Login uses
username + password instead of email + password; signup collects both.
`GET /auth/me`, signup, and login responses all include `username`. Added via
a migration that backfills a placeholder username (`<email-local-part>_<id>`)
for any pre-existing rows, so it's safe to run against an already-populated
database. The nav bar shows the username instead of the email.

**Why:** Requested directly — email-only login worked but didn't match the
"username/password accounts" framing used elsewhere in these docs, and a
username is a nicer thing to display than an email address in the UI.

**Alternatives considered:** Adding username as a display-only field while
keeping email-based login (rejected — the whole point was to actually log in
with a username, not just show one).

## 2026-08-06: No minimum password length

**Decision:** Removed the 8-character minimum on signup passwords, both in
the backend's zod schema and the frontend form. Only a non-empty password is
required now.

**Why:** Requested directly — the maintainer wants to pick any password
length for their own single-user, Tailscale-only instance without the app
second-guessing it.

## 2026-08-06: Demo data seed script, dev-only

**Decision:** `backend/src/db/seed.ts` exports `seedDemoData(pool)`, which
upserts a `demo@nosh.be` / username `Demo` / password `123` account and
ensures it owns five sample recipes (a Flemish stew, a soup, a pasta dish, a
salad, and a Belgian waffle recipe) with overlapping tags. It's idempotent —
safe to run on every restart — matching existing rows by email (for the user)
and by title (per recipe) rather than assuming a fresh database. Wired into
`index.ts` to run once at startup, gated behind `SEED_DEMO_DATA=true`, which
`docker-compose.yml` now sets by default. `env.ts` defaults this to `false`
if the variable isn't set at all, so anything that isn't this specific dev
Compose file (a bare `pnpm dev`, or whatever the real production Compose file
ends up being — see the Deployment backlog group) won't seed data unless it
explicitly opts in.

**Why:** Requested directly, to get a populated app to test/demo against
without manually recreating data every time. Idempotent-by-content (not a
one-time guard) so it also converges an account that already exists (e.g.
one created by hand while testing) to the intended demo credentials, rather
than silently skipping it.

**Alternatives considered:** A one-off script run manually (`pnpm seed`)
instead of automatic on startup (rejected — the maintainer explicitly wants
this to "always" happen when running the app for testing, not be a step to
remember); a one-time-only guard, e.g. an `INSERT ... ON CONFLICT DO NOTHING`
(rejected — wouldn't converge an existing demo account created with different
credentials to the intended ones).

## 2026-08-06: Frontend dev container unreliable on Windows — run frontend outside Docker locally

**Decision:** On the maintainer's Windows development machine, the frontend's
Docker container (Vite dev server) is unreliable — the browser/curl get
instant connection failures (`ERR_EMPTY_RESPONSE`/refused) reaching
`localhost:5173`, regardless of which host port is used. Root-caused to
Docker Desktop's Windows/WSL2 port-forwarding layer specifically failing for
the Vite process (Express on `:3001` reliably works through the same
mechanism, ruling out a general Docker Desktop or firewall problem). A full
Quit+relaunch of Docker Desktop and killing stale `wslrelay.exe` processes
were tried and didn't fix it; remapping the host port didn't either.
Workaround: run Postgres + backend via `docker compose up` as normal, but run
the frontend directly on the host with `pnpm --filter frontend dev` (falls
back to `http://localhost:3001` for the API with no `.env` needed, and the
backend's default `FRONTEND_ORIGIN` already matches Vite's default port).

**Why:** Getting a real fix would mean digging further into Docker
Desktop's WSL2 networking internals (this machine also runs both Tailscale
and ZeroTier as active virtual adapters, either of which could be a
contributing factor) for a problem that's specific to this one developer's
Windows machine, not the app. The production target
([deployment.md](deployment.md)) is a Linux box (ZimaOS) with no WSL2/Hyper-V
port-forwarding involved, so this is very unlikely to affect the real
deployment — it isn't worth more time right now.

**Status:** Workaround in place, root cause not fully resolved. Revisit if it
recurs, if it turns out to also affect other Windows dev setups, or once
there's a real `docker-compose.yml`/dev-workflow doc to keep in sync (see the
Deployment backlog group) — whoever writes that should confirm whether this
is still an issue.

**Alternatives considered:** A Vite dev-server proxy or single-origin setup
(rejected — orthogonal to this specific networking failure, which affected
the container regardless of port/origin); spending more time on root-causing
the WSL2/Tailscale/ZeroTier interaction (rejected for now — low payoff given
the production target is unaffected).

## 2026-08-05: Region — Belgium

**Decision:** Default units, currency, and future supermarket integrations
target Belgium (metric units, EUR, chains like Colruyt and Albert Heijn), kept
flexible enough to extend to neighboring EU countries later.

**Why:** Matches where the project owner actually shops; stated as the primary
region during scoping.

## 2026-08-06: Recipe images served through an authenticated route, not a static mount

**Decision:** Recipe images are served via `GET /recipes/:id/images/:imageId`
(behind the same `requireAuth` + ownership check as every other recipe route),
not via a blanket `express.static("/uploads", ...)` mount as originally built.
Login and signup also now call `req.session.regenerate()` before setting
`userId`, so a session ID issued before authentication can't be reused to
inherit the authenticated session afterward (session fixation).

**Why:** A security review of the MVP backend flagged that image files were
the one piece of recipe data with no access control at all — every other
route enforced per-user ownership, but `/uploads/<filename>` was globally
readable by anyone who obtained the URL, with no session check. Filenames are
unguessable (server-generated UUIDs), so this wasn't brute-forceable, but it
was a real inconsistency in the app's own authorization model, not just a
hardening gap. Fixed while it was still free to do (no frontend exists yet to
depend on the old static URL shape). The same review also considered a
hardcoded fallback `SESSION_SECRET` and missing cookie `secure`/`sameSite`
flags; both were investigated and rejected as non-issues for this app's
actual design (sessions are server-side via `connect-pg-simple`, so the secret
never signs privilege data; there's no CORS and every sensitive endpoint
requires a JSON body, which already blocks the classic CSRF vectors
`sameSite` addresses; `secure: true` would break login outright given the
project's documented no-TLS, Tailscale-only deployment). Session regeneration
was added anyway as a standard, low-cost defense against session fixation,
even though no concrete exploitation path exists in this codebase today.

**Alternatives considered:** Leaving `/uploads` as a static mount and
documenting the gap as an accepted trade-off (rejected — the fix was cheap
enough, and free while nothing depends on the URL shape yet, that documenting
around it wasn't worth it); setting `cookie.secure = true` (rejected — breaks
the app under its actual no-TLS deployment model rather than improving
security).

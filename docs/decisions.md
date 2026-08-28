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

## 2026-08-08: Windows frontend dev container issue reconfirmed, root cause still WSL2/Docker Desktop networking

**Decision:** Re-tested the 2026-08-06 finding above now that Docker Desktop is
available in the maintainer's environment. The symptom is unchanged: with
`docker compose up`, the backend container is reachable on `:3001` from the
Windows host (confirmed via Node's `fetch`, not just `curl`) while the
frontend container's Vite server is not reachable on `:5173` or
`127.0.0.1:5173` (`fetch failed`), even though `docker exec`-ing into the
frontend container and fetching `http://localhost:5173/` from its own
loopback returns `200` — the server is up and correct; only the host→
container port-forward for that specific port fails. No doc changes needed;
this reconfirms the existing workaround (run the frontend via
`pnpm --filter frontend dev` outside Docker) is still the right call, and the
dev-workflow docs ([dev-commands.md](dev-commands.md)) don't need updating.

**Unrelated finding along the way (also fixed in dev-commands.md):** a stale
anonymous `node_modules` volume from a previous container run can leave
`pnpm dev` crash-looping on startup with
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — pnpm 11's automatic
pre-script dependency-status check wants to purge and reinstall
`node_modules` when it doesn't match the lockfile, but can't prompt for
confirmation with no TTY attached, so the container never starts. Fixed with
`docker compose down && docker compose up -d --build` (fresh containers get a
fresh anonymous volume seeded from the image's own `node_modules`, which
matches the lockfile it was built from). Unrelated to the WSL2 networking
issue above — this one crash-looped *both* backend and frontend identically
and was fully visible in `docker compose logs`, whereas the networking issue
only affects the frontend and produces no error in the container's own logs
at all.

**Why:** [backlog.md](backlog.md)'s Deployment group explicitly called for
confirming this before writing dev-workflow docs, rather than assuming the
original diagnosis still holds.

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

## 2026-08-06: Design system defined — "Citrus Pop", glassy/rounded, motion-forward

**Decision:** Adopted a full design language ([design-system.md](design-system.md))
ahead of restyling the MVP UI, which currently uses Tailwind's default
`slate` palette with no custom tokens. Key choices: a bold "Citrus Pop"
orange/teal color system (gradient reserved for hero moments, flat fill for
buttons); Plus Jakarta Sans (display) + Inter (body), both via Google Fonts
CDN; a very-rounded shape language (`radius-full` on primary buttons);
glassy/translucent panels for nav/modals/floating overlays (not for every
card); Phosphor Icons in a mixed outline-default/filled-active system; rich,
springy motion that does **not** respect `prefers-reduced-motion`, on the
condition that motion stays purely decorative and never gates required
functionality; contained rounded photography rather than full-bleed;
custom illustrations for empty states (not yet produced). CLAUDE.md now
requires all UI work to follow this doc, and to extend it first if a new
pattern is needed.

**Why:** Requested directly — the app "looks like a CRUD tool, not a premium
consumer product." Design direction gathered via structured interview citing
Apple (restraint/motion polish), Arc browser (glass, color confidence), and
family.co (bold display type, vibrant gradients) as references.

**Notable trade-offs accepted knowingly (not oversights):**
- Ignoring `prefers-reduced-motion` is a deliberate call against the usual
  accessibility default, mitigated by keeping all motion decorative-only.
- Google Fonts CDN loading is a minor tension with Nosh's otherwise
  self-hosted, no-third-party-dependency ethos; accepted for now, revisit if
  it ever causes an actual (offline PWA / privacy) problem.

## 2026-08-06: Critical design review — token layer wasn't enough, structure still read as CRUD

**Decision:** After implementing the design system above, reviewed the real
running app (against the actual backend + seeded demo data, not just code)
and found the token layer alone didn't fix the "looks like a CRUD tool"
problem — the recipe list, detail, and form pages were still structurally an
admin scaffold. Revised, and [design-system.md](design-system.md) updated
first per CLAUDE.md's "extend the doc before building a new pattern" rule:

1. **Recipe cards**: horizontal thumbnail-left list row → photo-forward grid
   (1/2/3 columns by breakpoint), image full-card-width on top.
2. **Detail page**: photo moved from below three lines of metadata to a
   full-width hero immediately after the back link, before the title.
3. **Ingredients/Steps**: raw `<ul>`/`<ol>` → a bulleted checklist and
   individually-carded, numbered steps.
4. **Edit/Delete**: were two equal-weight pills (outlined + filled red)
   flanking the title — the canonical admin-record-toolbar pairing. Delete
   is now a low-emphasis ghost action, Edit stays the visible secondary
   button.
5. **Recipe form**: was a flat, unlabeled-example wall of inputs. Grouped
   into icon-labeled sections (Basics/Ingredients/Steps/Tags/Photos), each
   its own `bg-surface-sunken` card; every text/number field now carries an
   example placeholder.
6. **Tag chips** now always render capitalized, regardless of stored casing
   — raw lowercase (`belgian`) read as an unprocessed DB value.
7. **Input borders** were nearly invisible against their own fill in both
   themes (`#E8E2DC` light / `rgba(255,255,255,0.08)` dark) — bumped to
   `#DED5CA` / `rgba(255,255,255,0.14)` app-wide.

**Why:** Requested directly ("review the UI as if you were a senior product
designer... be brutally critical"). Confirms the general lesson: a color/
type/radius/glass token pass can make a CRUD scaffold *prettier* without
making it stop *being* a CRUD scaffold — the list-row, buried-photo,
raw-list, and equal-weight-destructive-action patterns are structural, not
stylistic, and needed layout changes, not just new classes.

**Explicitly scoped out, tracked instead:** there's still no moment of
delight anywhere in the app (saving a recipe just silently redirects) — a
lightweight toast/confirmation component would need real design (motion,
stacking, dismissal) beyond a one-off styling fix. Added to
[backlog.md](backlog.md) rather than built unscoped.

**Alternatives considered:** Leaving the list as a denser table-like view for
a large personal collection (rejected — Nosh's target scale is dozens to low
hundreds of recipes per docs/decisions.md's search-engine rationale, not
thousands, so density isn't worth sacrificing the photo-forward feel for).

Also added mobile-first as an explicit responsive strategy: the primary
target device is an iPhone 15 Pro, with tablet and desktop as real but
secondary breakpoints layered on top (see
[design-system.md#responsive-strategy-mobile-first](design-system.md#responsive-strategy-mobile-first)) —
44px minimum touch targets, `env(safe-area-inset-*)` padding for the
notch/home indicator on the installed PWA, single-column mobile layouts with
`sm:`/`md:` multi-column enhancements.

**Status:** Approved, not yet implemented — see the Design group in
[backlog.md](backlog.md).

## 2026-08-06: SonarQube cleanup — deprecated icon/type imports, Dockerfile COPY finding

**Decision:** Fixed all 60 SonarQube findings from a full-repo analysis:

1. **`@phosphor-icons/react` icon imports** (e.g. `ArrowLeft`, `Plus`, `X`,
   `Eye`/`EyeSlash`, etc., across every frontend component/page touched by
   the restyle) — the library's bare icon names are `@deprecated` in favor of
   an `*Icon`-suffixed export (`ArrowLeft` → `ArrowLeftIcon`, and so on).
   Renamed every import and usage to the `*Icon` form; no visual or
   behavioral change.
2. **`FormEvent` from `react`** (`AuthLayout`, `LoginPage`, `SignupPage`,
   `RecipeFormPage`) — `@types/react` marks it `@deprecated` with "FormEvent
   doesn't actually exist," pointing at `SubmitEvent` for form-submit
   handlers specifically. Replaced `FormEvent<HTMLFormElement>` with
   `SubmitEvent<HTMLFormElement>` everywhere; same shape (`SyntheticEvent`),
   so `.preventDefault()` etc. are unaffected.
3. **`Dockerfile.dev` recursive `COPY . .`** (frontend and backend) — flagged
   as "might inadvertently add sensitive data to the container." Checked
   rather than blindly restructured: the repo-root `.dockerignore` already
   excludes `.env`, `.env.*.local`, `.git`, and `node_modules` from the build
   context, and Docker's ignore-pattern matching applies extensionless
   patterns like `.env` at every depth, not just the root — so a nested
   `frontend/.env` or `backend/.env` is covered too. The recursive copy
   itself is required, not incidental (see
   [decisions.md](decisions.md#project-setup-tooling-choices) — each
   service's Dockerfile builds from the repo root so pnpm workspace
   resolution works). Added a comment above each `COPY . .` documenting the
   mitigation instead of restructuring around a already-covered risk.

**Why:** Direct request to resolve a SonarQube report. The icon/type
renames are pure library-recommended migrations with no behavior change;
the Dockerfile item is a "verify, don't silence" case, matching the
project's existing precedent of investigating security-review findings
before changing code (see the 2026-08-06 image-auth decision above, which
similarly ruled out `cookie.secure`/`SESSION_SECRET` findings as non-issues
for this app's actual design rather than changing them reflexively).

## 2026-08-08: Deployment group finished — production images, Compose file, CI publish, runbook

**Decision:** Closed out the Deployment backlog group:

- **`backend/Dockerfile` and `frontend/Dockerfile`** (new, alongside the
  existing dev-only `Dockerfile.dev` of each): multi-stage production
  builds. Backend compiles with `tsc` in a build stage, then the runtime
  stage does a fresh `pnpm install --frozen-lockfile --prod --filter
  backend` against just the two `package.json` files (not `pnpm deploy`,
  which is still marked experimental in this pnpm version — a plain
  filtered install is the same effect without relying on an experimental
  feature) so the final image has no frontend source and no
  devDependencies/TypeScript toolchain. Frontend builds the Vite app, then
  serves the static output with `nginx:alpine` (config in
  [frontend/nginx.conf](../frontend/nginx.conf)): SPA fallback
  (`try_files ... /index.html`) for `react-router-dom`'s client-side
  routing, `no-cache` on `index.html`/`sw.js`/`manifest.webmanifest` (they
  aren't content-hashed, and are exactly the files that decide whether a
  browser ever notices a new deploy), `immutable`-cached hashed assets, and
  an explicit `application/manifest+json` MIME type (nginx's default
  mime.types doesn't know `.webmanifest`, and PWA installability checks can
  care about that header).
- **`VITE_API_URL` is a build-time value, not a runtime one** — Vite inlines
  `import.meta.env.VITE_*` into the built JS at `vite build` time (see
  `frontend/src/api/client.ts`), so there's no server process in the
  frontend container that could read it from a container env var the way
  the backend reads `DATABASE_URL`. It's threaded through as a Docker build
  arg, sourced in CI from a GitHub Actions repo variable (see the `publish`
  job in [ci.yml](../.github/workflows/ci.yml)) rather than a secret, since
  it's not sensitive. Discovered by actually building and running the image
  locally rather than assuming it would "just work" like the backend's env
  vars — see [deployment.md](deployment.md)'s runbook step 1 for the
  one-time setup this requires before the first real deploy.
- **`docker-compose.prod.yml`** (new, alongside the existing root
  `docker-compose.yml`, which stays dev-only): references the published
  GHCR images directly (`image:`, no `build:`) since Watchtower's whole
  point is pulling pre-built images, not building on the homelab box.
  Postgres data and uploads are bind-mounted to `/DATA/nosh/postgres` and
  `/DATA/nosh/uploads` rather than named Docker volumes — a named volume
  would live under `/var/lib/docker/volumes/`, which Kopia's existing
  `/DATA`-wide backup sweep would never see. `SEED_DEMO_DATA` is
  intentionally left unset (defaults to `false` — see the 2026-08-06
  demo-data-seed entry above, written with exactly this file in mind).
- **CI publish job** (extends `.github/workflows/ci.yml` rather than a
  separate workflow file, so publishing only ever runs after the same
  lint/test/build gate that PRs go through): builds and pushes both images
  to GHCR on every push to `main`, tagged `latest` and the commit SHA (the
  SHA tag is what a rollback pins `TAG` to — see the runbook). Uses the
  repo's own `GITHUB_TOKEN` against `ghcr.io`, so no separate registry
  credential needed. Confirmed real by actually building both images
  locally (`docker build`), running `docker-compose.prod.yml`'s shape
  end-to-end against throwaway local volumes, running the real migrations
  against the built backend image, and hitting the built frontend image's
  nginx server from the host browser (SPA routing, cache headers, and
  manifest content-type all verified this way, not assumed from reading the
  config).
- **First-deploy runbook**: added directly to
  [deployment.md](deployment.md) rather than a separate doc, since
  docs/index.md already designates that file as the deployment doc and it
  was previously just a stub for this. Covers the `VITE_API_URL`/GHCR
  package-visibility one-time setup, `/DATA/nosh/` directory creation,
  `.env` from the new [.env.prod.example](../.env.prod.example), first
  boot order, the manual migration step, health check, and update/rollback.

**Why:** These were the four concrete items in the Deployment backlog
group. Building and actually running the images/Compose file locally (this
sandbox has Docker available, unlike when the MVP backend/frontend groups
were built) caught two real issues that a read-through wouldn't have: the
`VITE_API_URL` build-time-vs-runtime distinction above, and a missing
`manifest.webmanifest` MIME type.

**Alternatives considered:** `pnpm deploy` for the backend runtime stage
(rejected for now — genuinely the more idiomatic pnpm-for-Docker pattern,
but still labeled experimental; revisit if a future pnpm release stabilizes
it); baking a single hardcoded `VITE_API_URL` into the Dockerfile instead of
threading it through as a CI variable (rejected — the maintainer's actual
Tailscale hostname isn't something to guess at or hardcode into a file
that's committed to a public repo); a self-hosted GitHub Actions runner on
the homelab box instead of publish-to-registry-then-poll (rejected — already
decided against in the 2026-08-05 CD entry above, for the same reason: no
inbound credentials/access from GitHub to the homelab).

## 2026-08-08: Design polish follow-ups {#2026-08-08-design-polish-follow-ups}

**Decision:** Closed the four items in the "Design polish (post-restyle
follow-ups)" backlog group — see [backlog.md](backlog.md#completed)'s
2026-08-08 entry for the full list. Two implementation
choices are worth recording here since they generalize beyond this one PR:

**Toasts share one provider, not a per-page mechanism.** `ToastProvider`
(`frontend/src/toast/`) is mounted once at the app root (outside
`AuthProvider`, inside `BrowserRouter`), exposing `useToast()` to any
descendant. The alternative — a local `error`/`setError` + inline banner per
page, which the codebase already does for *load* errors (`errorBannerClass`)
— was rejected specifically for these three cases (recipe delete, image
upload/delete) because the message needs to survive a navigation
(`deleteRecipe` navigates to `/` on success but the failure path stays on
the same page, so an inline banner would've worked there too, but image
upload/delete failures happen on the same page anyway) — the deciding factor
was consistency: one mechanism for "something failed, here's a dismissible
notice" rather than two (inline banners for load failures, toasts for
action failures) that a future contributor has to learn the difference
between.

**PWA icons were rasterized via a real browser canvas, not an image library.**
No system (ImageMagick, rsvg-convert, Inkscape, Python+cairosvg) was
available to convert the brand SVG to the required PNG sizes, and adding an
image-processing dependency (`sharp`, etc.) to the frontend `package.json`
for a one-time asset-generation task would violate the "don't introduce
unnecessary dependencies" rule in [../CLAUDE.md](../CLAUDE.md) — the
resulting PNGs don't need to be regenerated by the build, they're committed
static assets. Instead: a throwaway HTML page loaded the SVG into an
`<img>`, drew it to a `<canvas>` at each target size, and `POST`ed each
`canvas.toDataURL()` result to a one-off local Node server that decoded and
wrote the PNG to disk — done this way (rather than copying the long base64
strings by hand) specifically because an earlier attempt at manual
copy-paste risked silent transcription truncation in a string thousands of
characters long, which would have produced a corrupt image that still
"looked" plausible in a diff. None of this tooling is committed; only the
four resulting PNGs and the updated `icon.svg`/`vite.config.ts` are.

**Alternatives considered:** an inline error banner reused from the load-error
pattern instead of a new toast component (rejected above); a maskable icon
reusing the same rounded-corner artwork as the "any" icon (rejected — maskable
icons are safe-zone content on a full-bleed square with no pre-baked corner
rounding, since the OS applies its own mask shape; reusing the rounded asset
would risk the OS's circular/squircle mask clipping into the rounded
corners already baked into the image).

## 2026-08-11: Recipe import from URLs — Gemini (free tier), JSON-LD fast path, cheerio

Implements the URL half of the
[2026-08-05 recipe-import decision](#2026-08-05-recipe-import-via-cloud-llm-post-mvp),
and narrows it: that entry left the provider open ("e.g. Anthropic/OpenAI")
and treated schema.org parsing as a possible fast path. Both are now settled.

**Provider: Google Gemini (Flash tier), not Anthropic or OpenAI.** The
deciding constraint was that Nosh should cost nothing to run — it's a
self-hosted, subscription-free app, so a feature that requires a paid API
subscription undercuts the point of the project. Gemini's free tier is the
only one of the three that is a real, permanent, no-credit-card tier
(roughly 250–1,500 requests/day on the Flash models as of August 2026),
which is far more headroom than a single-user homelab app will ever use.
OpenAI's free tier is effectively unusable for this (3 requests/minute,
GPT-3.5 only, a deposit required in practice) and Anthropic has no permanent
free API tier at all — only starter credits, which run out. This is a
cost decision, not a capability one; the extraction task (structured data out
of cleaned page text) is well within what a Flash-class model does reliably.

The client is a ~100-line `fetch` wrapper
(`backend/src/llm/geminiClient.ts`), not the `@google/genai` SDK — the call
is a single POST with a JSON body, and the rest of the backend has no
HTTP-client dependency either. It's exposed as one injected function type
(`GeminiExtractFn = (pageText, sourceUrl) => Promise<unknown>`), so swapping
providers later means writing one file with the same signature and changing
one line in `index.ts`. No provider registry or config-driven selection was
built for a second provider that doesn't exist yet.

**Two-stage extraction: schema.org JSON-LD first, Gemini only as fallback.**
Most recipe sites publish a schema.org `Recipe` JSON-LD block, which is
exact structured data — parsing it is faster, free, and more accurate than
asking a model to re-derive the same fields from prose. Gemini is called only
when that block is missing or too thin to use (no title, or no
ingredients/steps). Either path's output goes through the same `recipeSchema`
the recipe routes already use, so there's one validation boundary rather than
two.

**`cheerio` added as a dependency, against the default "no unnecessary
dependencies" rule.** Regex-based HTML handling was the alternative and was
rejected: both the JSON-LD block selection and the page-text cleanup are
cases where regex is genuinely unreliable on real-world markup (inconsistent
attribute order, malformed nesting, `</script>`-like strings inside inline
JS), and a parsing bug here fails *silently* as a bad extraction rather than
loudly as an error. Before adding it: ~27M weekly npm downloads, actively
maintained (1.2.0 released within the past year), no known vulnerabilities in
current versions per Snyk, and a small safe surface — pure parsing/traversal
on `parse5`/`htmlparser2`, no network access and no script execution (unlike
`jsdom`, which is heavier and unnecessary since nothing here needs to run
page scripts). Worth re-checking at upgrade time rather than treating as
settled forever.

**`source_url` column added now, not deferred.** It's nullable on `recipes`,
set only by the import path, and shown as an "Imported from …" link on the
detail page. Built in this pass rather than a follow-up because the future
Reels/TikTok import will need exactly the same column, and adding it while
the import path was already being touched was cheaper than a second
migration later.

**Deliberately not built in this pass:** Instagram Reels/TikTok import (the
remaining half of the original decision — different, much more fragile
fetching); auto-importing the source page's photo (the existing "save the
recipe before adding photos" constraint applies to imported recipes too, and
lifting it means a second outbound-fetch path with its own content-type/size
validation); and DNS-resolution-based SSRF hardening — the route ships with
scheme and local-hostname checks only, which is proportionate for a
single-trusted-user, Tailscale-only app but would not be if Nosh were ever
exposed publicly.

## 2026-08-11: Import tags come from a fixed vocabulary, not the site's keywords

**Decision:** Imported recipes are tagged only from a fixed vocabulary of
recipe *attributes* — dietary suitability, nutrition profile, effort, meal
type (`backend/src/services/recipeTags.ts`, `TAG_VOCABULARY`). A site's
schema.org `keywords` field is ignored entirely.

**Why:** `keywords` is written for SEO, not for browsing. Importing BBC Good
Food's lasagne produced eleven tags including "Angela Boggiano" (the author),
"Beef Lasagne" (a restatement of the dish), "2 Of 5-A-Day", "Calcium" and
"Spring". Tags are only useful if they're comparable *across* recipes — a tag
that appears on exactly one recipe is noise in a filter list. The vocabulary
is modelled on how meal-kit services tag meals ("high protein", "quick",
"low calorie", "gluten free"), which is the kind of attribute worth filtering
a collection by.

**How each path gets them:**
- **JSON-LD path** — derived deterministically, with no LLM call, from data
  the page already publishes: `suitableForDiet` mapped onto the vocabulary,
  per-serving `nutrition` values against fixed thresholds (≤500 kcal → "low
  calorie", ≥25 g protein → "high protein", etc.), `recipeCategory` matched
  against known meal types only, and total time ≤30 min → "quick".
- **Gemini path** — the response schema constrains `tags` to a string `enum`
  of the vocabulary, and the prompt tells the model to classify from
  ingredients/method and return nothing rather than guess.
- Both paths then run through `filterToVocabulary()`, so nothing outside the
  list can reach the form regardless of what a model returns.

**Consequence, accepted:** pages that publish no nutrition or diet data yield
few tags or none. That's deliberate — the user reviews the pre-filled form
anyway and can add their own, and no tags is more useful than eleven wrong
ones. Thresholds are intentionally conservative for the same reason: a
wrong tag is worse than a missing one.

**Alternatives considered:** keeping `keywords` but filtering it against a
blocklist (rejected — the junk is open-ended: author names, campaign labels,
seasons, nutrients; a blocklist would never converge); always calling the LLM
purely to generate tags, including on the JSON-LD fast path (rejected — spends
free-tier quota on every import to improve one field, when nutrition data
already answers it deterministically for the sites that publish it).

## 2026-08-11: Ingredient lines are split into quantity/unit/name on import

**Decision:** Free-text ingredient lines are parsed into the form's
`quantity`/`unit`/`name` fields by
`backend/src/services/ingredientLine.ts`, applied to the output of *both*
extraction paths.

**Why:** schema.org's `recipeIngredient` is a flat array of strings
("2 cloves garlic (finely minced)"), so without parsing, every imported
ingredient landed wholesale in `name` and the Qty/Unit columns imported
empty — the user would have to re-split every line by hand, which defeats
the point of importing. The LLM is asked to split them itself, but returns
whole lines often enough that the same normalization is applied to its output
too (only where both `quantity` and `unit` came back null, so genuinely-split
ingredients are never second-guessed).

**Why a units allowlist rather than "first word after the number":** in
"2 medium sweet potatoes" the unit is genuinely absent — treating "medium"
as one would be worse than leaving it in the name. Size adjectives are
deliberately excluded from the list; container/natural units that recipes do
measure in ("cloves", "rashers", "cans", "sprigs") are included. Anything
the parser can't confidently split is left whole, since a wrong split is
harder to spot and fix than an unsplit line.

## 2026-08-11: Gemini model pinned to gemini-3.6-flash (and why the model id needs revisiting)

**Decision:** The import client calls `gemini-3.6-flash` explicitly, not the
`gemini-flash-latest` alias.

**Why:** A pinned version means a Google-side model rollover can't silently
change extraction quality underneath us. The alias would drift.

**The gotcha that prompted this:** the client was first written against
`gemini-2.5-flash`, which the model list still returns — but calling it with a
newly-created API key fails with a 404 and "no longer available to new users".
Google retires models for *new* keys while keeping them working for existing
ones, so a model id that works for one developer can 404 for another. If
import starts returning 502/422 with a Gemini error, check
`GET https://generativelanguage.googleapis.com/v1beta/models?key=…` for what
the key can actually call, and bump `GEMINI_MODEL`.

**Also handled:** current Gemini models are reasoning models and return their
internal thinking as extra response parts alongside the answer. The client
filters out parts marked `thought: true` and concatenates the rest, rather
than assuming the answer is `parts[0].text`.

## 2026-08-11: Import tags are capped and de-duplicated by implication

**Decision:** `filterToVocabulary()` drops tags implied by a stronger one
(vegan ⇒ vegetarian, pescatarian) and caps the result at 5.

**Why:** With only a prompt instruction, the model tagged everything
technically true — a guacamole recipe came back with nine tags including
"vegan", "vegetarian" *and* "pescatarian", plus "nut free" and both "snack"
and "side". A recipe described by a dozen attributes isn't described at all;
past a handful, tags stop being a useful way to tell recipes apart. The
prompt now asks for at most four, most-characteristic tags, but prompts are
guidance rather than a guarantee, so the implication pruning and the cap are
enforced in code. With both in place the same recipe imports as
"vegan, gluten free, quick, snack".

## 2026-08-11: /import streams NDJSON progress instead of returning one JSON object

**Decision:** `POST /import` responds with newline-delimited JSON — a
`{"type":"progress","stage":…}` line per phase, then either a `result` or an
`error` line — rather than a single JSON body. The frontend reads it with
`response.body.getReader()` and shows the current stage.

**Why:** the two extraction paths differ by more than an order of magnitude
in duration, and only the server knows which one is running. Measured on real
pages: a JSON-LD import finishes in ~0.5s, while a page needing the LLM
spends ~7.6s *inside the model call alone*. A single "Fetching recipe…"
spinner covering both leaves the user unable to tell a fast import from a
hung one. Now the UI says "Reading the page's recipe data…" or "No recipe
data on this page — asking the AI to read it. This can take a few seconds…",
which also quietly teaches that the AI is a fallback, not the default path.

**Consequence, accepted:** once the first byte is written the HTTP status is
committed, so extraction failures are reported *in-band*
(`{"type":"error","status":502,…}`) rather than as the response status. The
status each failure would have had is carried in the message, and the client
turns it back into the same `ApiError(status, message)` the rest of the API
throws — so callers and error copy are unchanged. Request-level rejections
that happen *before* streaming starts (401 unauthenticated, 400 malformed
body) are still real HTTP statuses.

**Alternatives considered:** Server-Sent Events (rejected — `EventSource`
can't issue a POST, so it would have meant either a GET with the URL in the
query string or the same manual stream reading anyway, with extra framing);
inferring the stage client-side from elapsed time (rejected — it would be a
guess presented as fact, and a slow site on the fast path would be
mislabelled as an AI call); a separate "does this page need the LLM?"
pre-flight endpoint (rejected — doubles the page fetch to answer something
the extraction already knows).

## 2026-08-12: Post-implementation review fixes (backend security/correctness, frontend correctness/a11y)

**Context:** before opening the PR, a security review and two independent
code reviews (backend, frontend) were run against the import feature. Several
real defects surfaced; this entry records the ones worth explaining rather
than leaving as bare diffs.

**Sanitize before validating, not after.** `recipeSchema.safeParse` was being
applied directly to raw LLM/JSON-LD output, and the schema is intentionally
strict (`.min(1)` strings, `.positive()` servings). In practice Gemini
routinely returns `""` instead of `null` on a nullable field, and pages
publish "Serves 0" — both failed the *whole* import over one stray field, and
discarded the failure reason in the process (replaced with the misleading
"No recipe could be found on that page", even though one had been found).
`filterToVocabulary`/`normalizeIngredients` existed to clean up exactly this
kind of near-miss but ran after the parse had already rejected it, making
them unreachable for their own reason to exist. Fixed: a `sanitizeCandidate`
step now coerces near-misses (empty strings → null, non-positive numbers →
null, empty ingredient/step entries dropped) *before* validation, and a
`console.warn` of the actual zod issues replaces the silent discard.

**SSRF guard hardened, and closed against redirects.** The original guard
compared `url.hostname` against four literal strings. Verified gaps: `"::1"`
never matched (WHATWG keeps IPv6 hosts bracketed, `"[::1]"`), no private
range (`10/8`, `172.16/12`, `192.168/16`, `169.254/16` — including the cloud
metadata address) was blocked at all, and `fetch`'s default `redirect:
"follow"` meant even a perfect hostname check could be defeated by any public
page 302-ing to an internal address. Now `isBlockedHost` checks real CIDR
ranges via `node:net`'s `isIP`, and `fetchHtml` sets `redirect: "manual"`,
re-validating every hop (capped at 5) so a redirect can't reach anywhere a
direct URL couldn't. This remains a Tailscale-only-app-appropriate guard, not
full SSRF hardening — DNS-resolution-based checking (a hostname that
*resolves* to a private address still isn't caught) is still deferred, per
the original 2026-08-11 entry.

**Gemini: header auth, preserved error bodies, quota distinguished from "no
recipe".** The API key moved from `?key=` (which ends up in proxy/error logs)
to the documented `x-goog-api-key` header. A non-2xx response's body — where
Google puts the actual reason (expired key, exhausted quota, unknown model
id) — was being discarded in favor of a bare status code; it's now logged
server-side. 429/5xx responses now throw a distinct `GeminiUnavailableError`
→ 503 "try again shortly", instead of surfacing as a 422 "no recipe found",
which was actively misleading.

**Prompt injection boundary.** The page's text was concatenated directly onto
the model instructions. Real impact was already low — structured output,
enum-locked tags, `filterToVocabulary` re-checking, `sourceUrl` set
server-side not by the model, and the user reviewing everything before
save — but the untrusted content is now fenced in an explicit `<page-text>`
block with a one-line "treat as data, not instructions" note, which costs
nothing and removes the class of problem.

**`sourceUrl` restricted to http(s).** zod 4's bare `z.url()` accepts
`javascript:` and `data:` schemes. Not exploitable as shipped — React 19
blocks `javascript:` hrefs — but `sourceUrl` is renderer as an `<a href>` and
is a body field on `POST/PUT /recipes`, so it's one React-version bump away
from being live. Now `z.url({ protocol: /^https?$/ })`.

**Frontend: three real bugs, not just polish.**
1. *Mid-import navigation.* Leaving the import page before the ~20s request
   settles used to still navigate wherever the response landed once it
   resolved, yanking the user out of whatever they'd moved to. Now an
   `AbortController` is aborted on unmount (and on a new "Cancel" button),
   and the `.then`/`.catch` check `signal.aborted` before acting.
2. *Duplicate recipe on Back.* `/recipes/new` and `/recipes/:id/edit` render
   the same `RecipeFormPage` component at the same route-tree position, so
   React Router reconciles instead of remounting on navigation between them.
   After importing and saving, browser Back landed back on `/recipes/new`
   with every field still populated and `loading` still `false` — clicking
   Save again created a second recipe. Fixed with `{ replace: true }` on the
   post-save navigate (Back now skips the create form entirely) and a `key`
   per route in `App.tsx` so the two modes — and different recipe ids under
   `/edit` — always remount.
3. *Stream reader never released on the expected error path.* The 422 "no
   recipe found" response is the *normal* failure case, and it throws out of
   the NDJSON line handler without releasing the reader — `reader.cancel()`
   alone doesn't synchronously free the lock; `releaseLock()` does. Fixed in
   a `finally`, alongside treating an unrecognized message type as "ignore"
   rather than "assume it's an error with an undefined status/message".

**React 19 provider syntax.** `<Context.Provider value={…}>` is the pre-19
form; React 19 renders the context object itself as the provider. Updated
`AuthProvider` and `ToastProvider` to `<Context value={…}>`.

**Also fixed:** ISO 8601 duration parsing dropped times with a seconds
component or a day prefix (both real, e.g. "PT1H30M15S", "P0DT1H0M") instead
of just ignoring the extra part; `AutoGrowTextarea` didn't re-measure on
resize (now backed by `field-sizing-content` with a `ResizeObserver`
fallback for Safari); `RecipeDetailPage` parsed `sourceUrl` with `new URL()`
directly in render, which would blank the whole page on a malformed stored
value; toast auto-dismiss timers weren't cleared on unmount; the streaming
route now aborts the underlying fetch/Gemini call when the client
disconnects (`req.on("close")`), rather than finishing into a dead socket
and, on the AI path, spending quota for nothing.

## 2026-08-12: Windows frontend dev container issue — actually root-caused and fixed

**Decision:** Supersedes the 2026-08-06 and 2026-08-08 entries below (kept
for history, not deleted per this doc's convention). The frontend container
*is* reliably reachable on Windows via plain `docker compose up` — the
Windows/WSL2 port-forwarding layer was never actually at fault. The real bug
was in `frontend/Dockerfile.dev`'s `CMD ["pnpm", "dev", "--", "--host"]`:
that extra `--` doesn't get stripped by `pnpm`'s shorthand `pnpm <script>`
form the way it does with `pnpm run <script> -- <args>`, so Vite received a
literal `--` positional argument followed by `--host` as a second
positional — neither parsed as the `--host` flag. Vite silently fell back to
binding `::1`/loopback only, which Docker's port-forwarding (on any
platform, not just Windows) cannot deliver external traffic to. Fixed by
dropping the redundant `--`: `CMD ["pnpm", "dev", "--host"]`.

**Why it looked like a Windows/WSL2 networking bug:** the browser's *first*
request (the document) and a few already-`Cache-Control`/service-worker-cached
assets (the PWA's `devOptions.enabled: true` precaches the app shell) kept
succeeding, since those never actually needed a live connection to the
loopback-bound Vite process — only requests that genuinely required the dev
server (`@vite/client`, `main.tsx`, HMR) failed, with Firefox reporting that
as `NS_ERROR_NET_RESET` rather than a clean connection-refused. That
partial-failure pattern read as network flakiness, not a misconfigured bind
address, and the 2026-08-06 investigation's evidence (Express on `:3001`
worked, Vite on `:5173` didn't) was consistent with *either* explanation —
it just happened to point at the wrong one.

**Why the fix wasn't found sooner:** the original investigation tested
Docker Desktop restarts, stale `wslrelay.exe` processes, and host port
remapping — all environment-layer fixes — without checking what address the
process inside the container was actually bound to. `docker compose logs`
would have shown it immediately: Vite's own startup banner prints
`➜ Network: use --host to expose` when `--host` isn't active, versus
`➜ Network: http://<container-ip>:5173/` when it is.

**Status:** Fixed and verified live — `docker compose up`, no separate
`pnpm --filter frontend dev` step, module scripts all load, login and the
recipe list work end-to-end in a real browser. `docs/dev-commands.md`'s
Windows workaround section is removed accordingly.

## 2026-08-12: Instagram Reels/TikTok import — yt-dlp + Gemini Flash-Lite

**Decision:** The remaining half of the 2026-08-05 LLM-import decision is
built: `yt-dlp` fetches a Reel/TikTok's video and caption, and both go to
Gemini in one multimodal call. `yt-dlp` is installed from Alpine's own
package repo (`apk add yt-dlp`, which pulls in Python + ffmpeg as
dependencies) rather than upstream's standalone PyInstaller binary, which is
glibc-built and unreliable on musl-based Alpine — confirmed by testing the
binary directly in a throwaway `node:22-alpine` container before committing
to the approach.

**Why not caption/oEmbed-only (no video download):** tried it, in effect — a
real test Reel's caption had the full ingredient list but *no steps at
all*; only watching the video recovered them (oven temp, timing, technique).
A metadata-only approach would work for some creators and produce a
title-and-ingredients-only recipe for others, silently, which is worse than
the current all-or-nothing failure mode.

**Why not a hand-rolled scraper:** same reasoning as the `cheerio` JSON-LD
parser one layer down — Instagram/TikTok's page structure and anti-bot
measures change often enough that a hand-rolled fetch would fail silently
and need constant chasing. `yt-dlp` is maintained specifically to track
those changes across a huge number of sites.

**Video delivery: stdout capture, not a temp file.** `yt-dlp -o -` streams
the video straight to a `Buffer` (`--merge-output-format mp4` forces a
single container so the caller never has to sniff the format). Verified this
produces byte-identical output to the file-based approach before switching —
simpler code, no temp-directory cleanup, and it splits cleanly into two
independently fakeable functions (metadata call, video call) for tests
without ever shelling out for real.

**Caps: 3 minutes, 18MB, `height<=480`.** Checked via metadata *before*
downloading any video bytes, so an over-long clip is rejected without
spending bandwidth on it. 18MB leaves headroom under Gemini's inline-data
request-size ceiling once base64 overhead (~33%) and the prompt are
accounted for — the real Reel tested was already 13.9MB at this resolution,
so this is tighter than it looks for a multi-minute clip; File API support
(no size ceiling in the same way) would be needed to relax it, deliberately
not built now.

**Model split, and why Flash-Lite for video specifically:** `GEMINI_TEXT_MODEL`
and `GEMINI_VIDEO_MODEL` are separate, both overridable via env var (no
longer a hardcoded constant — the second time in one day the pinned model
needed reconsidering). Defaults: `gemini-3.6-flash` for text,
`gemini-3.5-flash-lite` for video. Chosen after hitting the free tier's
daily request cap on Flash mid-development and running the *same* real
video through both models side by side: Flash-Lite matched or slightly
exceeded Flash on step recovery (8 granular steps vs. 6, same substance),
correctly left `servings`/`prepTimeMinutes` null rather than guessing a
plausible-sounding value the way Flash did, ran in ~15s vs. ~52s, and gets a
25x daily quota (500 vs. 20) — video's per-request token cost (~6,000+
tokens just for a short clip) makes that quota difference matter far more
than a model-tier difference that didn't show up in output quality on this
test.

**ToS trade-off, acknowledged not resolved:** downloading video via an
unofficial tool is against both platforms' terms, one step further than
parsing a page's own published markup (the URL-import path). Accepted for
the same reason as the rest of this app's posture — single-user,
self-hosted, Tailscale-only — but worth being explicit that this is a
different risk category than schema.org parsing, not just a bigger version
of it.

**Status:** Verified live end-to-end against a real Instagram Reel,
including a caption with no steps at all — see
[architecture.md](architecture.md#recipe-import-instagram-reels--tiktok).
**Not verified against a real TikTok URL** — same extractor and pipeline,
but only Instagram was actually exercised before shipping. Revisit and
confirm before relying on the TikTok path.

## 2026-08-12: Neither dev server was live-reloading on Windows — polling fixes both

**Decision:** Both `frontend/vite.config.ts` (`server.watch.usePolling`) and
`docker-compose.yml`'s backend service (`CHOKIDAR_USEPOLLING=true`,
`CHOKIDAR_INTERVAL=300`) now force polling-based file watching. Neither dev
server was actually picking up source edits made while the containers were
already running — confirmed for both by editing a file and watching for a
reload that never came (`docker compose logs` showed no `[vite] hmr update`
or `[tsx] change in ...` line), then confirming the fix by repeating the
same test until the reload appeared.

**Why this had gone unnoticed:** most edits during this session were
verified via one-shot `docker compose exec ... pnpm build/test` commands,
which read files fresh at invocation and would pass regardless of whether
the long-running dev server had reloaded. The gap only became visible when
testing a change through the actual browser/running app after a stretch of
edits with no container rebuild in between — the UI kept showing stale
code. The same root cause as the 2026-08-12 entry above (Docker Desktop's
Windows bind mount doesn't reliably deliver filesystem change *events* into
the container, even though file *content* syncs immediately and correctly)
— just hitting a different mechanism this time: chokidar's native watcher
instead of Vite's own port binding. Polling doesn't depend on those events
at all; it just re-stats files on an interval, which works over any bind
mount regardless of whether events propagate.

**Why not investigate further:** this is a well-documented, well-understood
Docker Desktop Windows/WSL2 limitation (not specific to this app), and
polling is the standard, officially-recommended remedy for exactly this
case — not worth root-causing further for a single developer's local setup,
consistent with how the earlier `--host` investigation was scoped.

**Status:** Fixed and verified for both services. Worth remembering:
**any code change made without an explicit rebuild during this session's
earlier work should be treated as unverified against the live running
app** if it wasn't also covered by a one-shot `pnpm test`/`build` — those
never lied, but a manual browser check in between two edits might have been
looking at stale code. Nothing found to actually be wrong when spot-checked
after the fix, but this is why "verified live" claims earlier in this file
are trustworthy only to the extent they were paired with a rebuild or came
before the gap between rebuilds grew long.

## 2026-08-13: Recipe photo auto-import — post-save fetch, not staged uploads

**Decision:** The backlog item deferred from the 2026-08-11 URL-import work
("recipe photos currently require an already-saved recipe id") is resolved
by discovering the image URL during `/import` and attaching it via a *new*
step that runs right after the normal save, rather than by loosening the
"recipe must exist" constraint on image uploads. Concretely: `/import`'s
NDJSON result now carries an `imageUrl` alongside the recipe (schema.org
`image` for JSON-LD, an `og:image`/`twitter:image` meta tag as the shared
fallback for both the incomplete-JSON-LD and Gemini-fallback cases, and
`yt-dlp`'s own `thumbnail` field for Reels/TikTok — no extra request in that
last case, since the metadata call already happens for duration/caption).
Once the user saves through the existing `POST /recipes` and a real id comes
back, the frontend calls a new `POST /recipes/:id/images/from-url` with that
URL, which fetches the bytes server-side and writes them through the same
`addRecipeImage` path a manual upload uses.

**Why not stage the upload before the recipe exists:** considered adding a
draft/orphaned-image table adopted at save time, which would let images
attach in the same request as the recipe data. Rejected — it needs an
abandoned-upload cleanup job (imports that are never saved would otherwise
leak files indefinitely) for no real benefit over a second request, since
import already reviews-then-saves as two steps regardless of images.

**Why the fetch needs the same SSRF guard as the original page fetch:**
`imageUrl` travels back from the browser in the `from-url` request body —
it originated from the server's own page scrape, but nothing about that
request proves it wasn't tampered with by an authenticated user pointing it
at an internal address instead. `services/imageFromUrl.ts` reuses
`recipeExtraction.ts`'s `validateUrl` (now exported for this) rather than
re-implementing the blocked-host check, and re-validates on every manual
redirect hop the same way the page fetch does. Content-type is checked
against the same `IMAGE_MIME_EXTENSIONS` allowlist the manual multipart
upload enforces (moved into `imageFromUrl.ts` as the one shared definition,
since both directions of "what counts as an image this app will store" need
to agree), and size is capped at the same 5MB multer already enforces on a
manual upload — an auto-imported photo shouldn't be held to a looser
standard than one the user picks themselves.

**Why a failure here can't fail the save:** by the time this call runs, the
recipe is already committed — a 404, blocked host, unsupported type, or
oversized image only means "no photo", not "the save failed". The frontend
awaits the attach call so the user sees the photo immediately after landing
on the edit page when it succeeds, but on failure it swallows the error and
toasts "Couldn't import the photo — add one manually" via the existing
`useToast()`, the same non-blocking pattern used elsewhere (delete/upload
failures on the form itself).

**Status:** `pnpm lint`/`test`/`build` pass on both packages (190 backend +
59 frontend tests, including new coverage for JSON-LD/meta-tag image
extraction, yt-dlp thumbnail passthrough, the `from-url` fetch's redirect/
size/content-type handling, and the frontend's best-effort attach-and-toast
behavior). **Verified live end-to-end**: imported a real BBC Good Food page
(confirmed beforehand to have both a JSON-LD `ImageObject` and an
`og:image`), saved it, and watched the network trace confirm
`POST /recipes` → `POST /recipes/:id/images/from-url` → the edit page's
`GET /recipes/:id/images/:imageId` all succeed, with the photo actually
rendering in the form. **Not verified live: the yt-dlp-thumbnail and
Gemini-fallback-og:image paths** — covered by unit tests with fake
extractors, but no real Reels/TikTok or JSON-LD-less import was run through
this specific code path in this session; worth a spot-check before treating
those two sources as proven end-to-end.

## 2026-08-13: Frontend/backend dev container crash-loop on pnpm's deps-status check — fixed via `pnpm exec`, not the `.npmrc` route

**Decision:** Both `frontend/Dockerfile.dev` and `backend/Dockerfile.dev` now
run their dev command via `pnpm exec <binary> ...` (`pnpm exec vite --host`,
`pnpm exec tsx watch src/index.ts`) instead of `pnpm dev`/`pnpm <script>`.
The latter goes through `pnpm run`, which triggers a pre-script "dependency
status check" (`runDepsStatusCheck`, visible in pnpm's own stack trace) —
this check false-positives against the bind-mounted repo in this project's
dev containers, decides a reinstall is needed, and then tries to
interactively confirm purging `node_modules` with no TTY available,
crash-looping the container forever
(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). `pnpm exec` resolves and
runs the binary directly without going through that pre-script machinery,
sidestepping the false positive entirely rather than working around its
symptom.

**What actually confirmed the false positive:** a plain `pnpm install` run
by hand inside the same bind-mounted container reported "Already up to
date" instantly — so the lockfile genuinely does match what's installed.
`runDepsStatusCheck` is a separate, cruder check than `pnpm install`'s own
verification, and it disagreed with that ground truth specifically when a
bind mount was involved: the identical image, run with no bind mount at all
(`docker run` against the built image directly), started clean with no
check failure whatsoever. The exact mechanism inside `runDepsStatusCheck`
that gets fooled by a bind mount wasn't root-caused further (its comparison
isn't a simple file-mtime check — the recorded `lastValidatedTimestamp` in
`node_modules/.pnpm-workspace-state-v1.json` was already *older* than the
bind-mounted manifests, the opposite of what a naive mtime-staleness check
would need to misfire) — not worth chasing given `pnpm exec` avoids the
whole code path.

**Why not the fixes pnpm's own error message suggests
(`CI=true` / `confirmModulesPurge: false`):** tried both. `CI=true` does
work, but only by making pnpm answer "yes" to the purge and run a full
reinstall — on *every single container start*, adding real startup latency
indefinitely, since the underlying false positive never gets resolved, just
auto-approved every time. `confirmModulesPurge: false` in a root `.npmrc`
had no effect at all (verified via `pnpm config get`, which didn't even
show pnpm picking it up in this context) and was removed again rather than
left in as dead configuration.

**A compounding trap hit while diagnosing this:** `docker compose up
--force-recreate` (without `-v`) does *not* discard a container's anonymous
volumes — so several early attempts to test a fix kept reusing a
`node_modules` volume that had been left in a partial/interrupted state by
earlier crash-loop attempts, making a real fix look like it hadn't worked.
`docker compose rm -f -s -v <service>` (or `down`, which removes the
container network but not named volumes like `postgres_data`) is needed to
get a genuinely fresh anonymous volume when recovering from this state —
worth remembering for any future dev-container debugging in this repo.

**Status:** Fixed and verified: both containers now start cleanly from a
completely fresh `docker compose down` + `up` (no `--force-recreate`
needed), stay up rather than crash-looping, and the frontend serves the
real app in a browser pointed at `localhost:5173`. Backend was already
unaffected in most manual tests during this session, but was switched to
the same `pnpm exec` pattern for consistency and to close off the same
failure mode before it has a chance to appear there too.

## 2026-08-19: Production white-screen fixed — `crypto.randomUUID()` needs a secure-context fallback

**Decision:** `frontend/src/pages/RecipeFormPage.tsx` called
`crypto.randomUUID()` directly to key ingredient/step rows. Reported live:
after a magic import finished, the form crashed to a white screen with
`crypto.randomUUID is not a function`. Root cause: that API is spec-restricted
to [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
(HTTPS or `localhost`), and the homelab is served over plain HTTP via
Tailscale MagicDNS (`http://homelab.tail43ff2b.ts.net:8080`) — a context the
browser treats as insecure, where the function simply doesn't exist. Local
dev never caught this because `localhost` itself counts as secure.

Fixed with `frontend/src/lib/id.ts`'s `generateId()`: uses
`crypto.randomUUID()` when present, otherwise builds a v4 UUID from
`crypto.getRandomValues()`, which carries no secure-context restriction. Safe
here because these ids are only used as React list keys, never sent to the
backend — the fallback's slightly different randomness source doesn't matter.

**Audited for the same class of bug elsewhere in the frontend:** no usage
found of `navigator.clipboard`, `navigator.share`, `navigator.geolocation`,
`navigator.mediaDevices`/`getUserMedia`, `navigator.credentials`/WebAuthn,
`Notification`, `PushManager`, or `crypto.subtle`. `vite-plugin-pwa`'s
`registerSW()` (`frontend/src/main.tsx`) is also secure-context-gated, but its
generated client guards on `"serviceWorker" in navigator`, so it fails silently
rather than crashing — meaning PWA install/offline-cache/auto-update-on-deploy
are quietly inert on the homelab's plain-HTTP origin today, not broken.

**Why this will keep recurring:** the
[2026-08-05 deployment decision](#2026-08-05-deployment-target-and-cd-mechanism)
above treats Tailscale-only access as the security boundary and deliberately
skips TLS termination, so the app is expected to stay on plain HTTP
long-term. Any future browser API gated to secure contexts will hit the same
wall. Check MDN's "secure contexts only" note before relying on a new one;
either add a fallback like this one or note the degradation explicitly if no
fallback exists. Revisit by putting a TLS-terminating reverse proxy in front
of the app if this recurs often enough to be worth the added complexity.

## 2026-08-19: Header consolidated into a `UserMenu` dropdown; app version shown via build-time commit SHA

**Decision:** Requested directly, now that the app is running in production:
a visible way to tell which build is deployed. Rather than a stray version
label bolted onto the header, the header's separate username/theme-toggle/
logout controls were consolidated into one `UserMenu` dropdown
(`frontend/src/components/UserMenu.tsx`) — click the username to open a menu
with theme toggle and log out as items, and the running build's short commit
hash in a muted footer. `ThemeToggle.tsx` was deleted; its logic moved
directly into `UserMenu`, its only remaining caller.

**Version = short git commit SHA, not a semver number.** There's no release
process or version-bump convention in this repo — `frontend/package.json`'s
`"version": "0.0.1"` has never been touched. The CI publish job
([ci.yml](../.github/workflows/ci.yml)) already tags every image with
`github.sha`, which is also what [deployment.md](deployment.md)'s rollback
runbook pins `TAG` to — so the commit hash is the one identifier that's
already meaningful and already tied to a real, pullable image. Threaded
through exactly like `VITE_API_URL` above: a Docker build arg
(`frontend/Dockerfile`), since Vite inlines `import.meta.env.VITE_*` at
`vite build` time and there's no runtime process in the nginx container to
read an env var from. CI passes the same `github.sha` it tags the image
with, so the version shown in the UI always matches a real, rollback-able
tag. Falls back to the literal string `"dev"` when the build arg isn't set
(local `pnpm dev`), since there's no commit to pin to there.

**`.glass-menu`, a higher-opacity glass variant, added for anchored
menus.** First pass reused the standard `.glass` panel; flagged directly as
"too transparent" once seen live. Standard `.glass` (55–65% opacity) is
tuned for the header (sits over the app's own fairly uniform surface) and for
backdrop-modal dialogs (`ConfirmDialog`/`ImportDialog`, which sit behind a
dimmed/blurred `<dialog>::backdrop`). A dropdown anchored under the header has
neither of those — it opens directly over ordinary page content, which can be
a photo-heavy recipe grid, with no scrim of its own — so the same opacity read
as illegible there. `.glass-menu` (`frontend/src/index.css`) keeps the same
blur/border/shadow treatment but raises background opacity to 92–94% in both
themes. See
[design-system.md#anchored-menus--popovers](design-system.md#anchored-menus--popovers)
for the full writeup and reuse guidance.

**Alternatives considered:** a plain text version string always visible in
the footer/header (rejected — adds permanent visual clutter for information
only useful when debugging a deploy); semver bumped by hand on each release
(rejected — would require introducing a release process this single-developer
homelab app has no other need for, purely to have something to display).

## 2026-08-19: SonarQube pass — 9 findings across 5 files

**Decision:** Resolved a SonarQube scan (5 files, 9 findings). Seven were
genuine, fixed in code; two (four findings, since each fired twice) were
investigated and confirmed as a known false-positive category, documented
rather than contorted around — same "verify, don't blindly restructure"
approach as the [2026-08-06 SonarQube pass](#2026-08-06-sonarqube-cleanup-deprecated-iconpype-imports-dockerfile-copy-finding)'s
Dockerfile finding.

**`imageFromUrl.ts`: cognitive complexity 21 → under 15.** `fetchImageFromUrl`
had a `for` loop, a `try`/`catch` with nested conditionals, and three more
sequential `if`s each with their own nested checks, all in one function body.
Split into three small helpers it now calls in sequence —
`performFetch` (the try/catch and error translation), `resolveRedirect` (the
3xx-handling branch), `extensionForContentType` (the content-type/extension
lookup) — which lowers the parent's own score without changing the actual
control flow or the total number of decisions in the module; cognitive
complexity is scored per function, and extracting nested branches into
named, single-purpose functions is the standard way to bring a function back
under the threshold, not a workaround specific to this one.

**`ingredientLine.ts`: two "super-linear regex" findings.** `NUMBER_PATTERN`
(`/^\d+(?:[.,]\d+)?/`, an optional group wrapping a second `\d+`) and the
mixed-number pattern (`/^(\d+ \d+\/\d+)/`, three `\d+` runs in one regex) both
have a quantified group containing another quantified sub-pattern — the
general shape static analyzers flag for backtracking risk, even when (as
here) the outer quantifier's bound of 0–1 makes actual exponential blowup
impossible. Fixed the same way `matchNumberPair` already handled an
analogous case (per its own existing comment, predating this pass): split
each into single-`\d+`-per-regex helpers (`matchNumber`, `matchFraction`,
`matchMixedNumber`) composed by hand via sequential `.exec()` calls instead
of one compound pattern. Same matching behavior, verified by the existing
18-case test suite passing unchanged.

**`socialVideo.ts`: two "Promise rejection reason should be an Error"
findings.** Both `runYtDlpText`/`runYtDlpBuffer` did
`reject(Object.assign(err, { stderr }))` — `err` is already an `Error`
(`child_process.execFile`'s callback error type), and `Object.assign`
mutates and returns that same reference, so this always rejected with a real
`Error` at runtime. The finding is a static-analysis limitation: the
rule can't trace that `Object.assign(err, ...)`'s return value is still
`err`'s own type. Fixed by mutating `err` in a separate statement and calling
`reject(err)` with the bare identifier — identical runtime behavior, but the
reject call's argument is now unambiguously typed as `Error` to any analyzer.

**`ConfirmDialog.tsx`/`ImportDialog.tsx`: four "non-interactive element with
a click handler" findings — investigated, confirmed false positive, not
changed.** Both dialogs detect a backdrop click by checking
`event.target === dialogRef.current` on the `<dialog>` element's own
`onClick` (the MDN-documented pattern for native `<dialog>` light-dismiss —
see each component's existing comment on why no separate backdrop element
exists). ARIA classifies explicit `role="dialog"`/`"alertdialog"` as
non-interactive "window" roles, so a generic JSX a11y checker (this
includes SonarQube's JS/TS rules, which mirror `eslint-plugin-jsx-a11y`)
sees "click handler on a non-interactive element with no keyboard listener"
— but it has no way to know that Escape is already wired up via the native
`cancel` event in a `useEffect` elsewhere in the same component, or that a
visible, always-reachable Cancel/Close button provides full keyboard
dismissal. Backdrop-click is a supplementary mouse-only convenience on top
of an already fully keyboard-accessible modal, not the sole means of
dismissal the rule assumes is missing.

Restructuring around this (e.g. turning the clickable region into an actual
`<button>` wrapping/behind the panel) was considered and rejected: there is
no separate backdrop DOM node to move the handler to — native `<dialog>` +
`showModal()` renders the click-catching area as the dialog's own box (a
browser-generated `::backdrop` click is dispatched with the dialog element
itself as `event.target`) — so achieving this would mean inventing an
artificial nested-button backdrop purely to satisfy a linter, adding real
layout complexity (absolute positioning, z-index, duplicated in two files)
against CLAUDE.md's "prefer simple, maintainable solutions" for a case that
isn't actually inaccessible. Documented in each component with an inline
comment explaining the reasoning to future readers; these four findings
should be marked "Won't Fix"/"False Positive" directly in SonarQube, since
that's outside what a code change controls.

`pnpm lint`/`test`/`build` pass on both packages (190 backend + 67 frontend
tests, all pre-existing — no new tests needed, since none of these changes
alter observable behavior).

## 2026-08-19: Collections added as a first-class concept distinct from tags; tag browsing via a query param

**Decision:** Named, user-owned collections (many-to-many with recipes, no
description/cover photo/ordering) modeled structurally after
`tags`/`recipe_tags` but with their own `collections.user_id` and CRUD
identity (create/rename/delete); tag-based browsing implemented as an
optional `tag` query param on the existing `GET /recipes` and
`GET /recipes/search` endpoints, reached by clicking a tag chip on a recipe
card or the detail page rather than through a standalone "browse all tags"
list. An early pass added a filter-chip row above the recipe grid (backed by
a `GET /recipes/tags` endpoint listing the full vocabulary) — cut after a
live look at the running app read it as clutter, and the endpoint went with
it since nothing else needed it.

**Why collections aren't just another kind of tag.** Tags are attribute-like:
free-text, and implicitly created/destroyed as a side effect of editing a
recipe's tag list (`syncTags` deletes and re-links on every save — a tag has
no identity of its own beyond its name). A collection is explicitly named and
managed by the user (create it, rename it, delete it) independent of any one
recipe's edits, which needs the same direct ownership shape `recipes` already
has (`user_id`, `UNIQUE (user_id, name)` rather than tags' global-unique
name) — conflating the two would force tag-only semantics onto something the
user wants to curate.

**Why a query param, not a dedicated `/recipes/by-tag` endpoint.** The
feature explicitly needs to combine with the existing text search (a tag
chip filters within whatever's already been searched, and vice versa). A
separate endpoint would force the frontend to choose between three states —
plain list, search, tag-filtered — rather than two independently-optional
filters on the same two endpoints, and the "search AND tag" case would need
reimplementing wherever that third endpoint lived. The filter itself is an
`EXISTS` subquery against `recipe_tags`/`tags`, not a `JOIN` — a join would
duplicate a multiply-tagged recipe's row once per matching tag and disturb
`ORDER BY`/`ts_rank`.

**Why collection membership isn't part of `RecipeInput`.** Same category as
image upload: a side-effecting relationship that doesn't round-trip through
create/update, and only meaningful once a real recipe id exists. Kept off
`RecipeFormPage` entirely (not even for existing recipes) — it lives solely
on `RecipeDetailPage` via `RecipeCollectionsEditor`, so there's one place
membership is edited rather than two.

**Cascade behavior**, matching `recipe_tags`'s existing shape exactly: both
`recipe_collections` FKs (`recipe_id`, `collection_id`) cascade on delete, but
only that join table. Deleting a collection never deletes its recipes;
deleting a recipe never deletes other collections it wasn't the only member
of. A join table only ever cascades on its own two FKs — it has no reason to
reach through to the "other side" entity.

`pnpm lint`/`test`/`build` pass on both packages (205 backend + 84 frontend
tests, including new coverage for cross-user ownership checks on both the
collection side and the recipe side of adding/removing membership).

**Caught live, not by the test suite: `TagChip` needed both `preventDefault`
and `stopPropagation`.** `RecipeCard`'s tags render inside the card's own
`<Link>`, so the chip's click handler has to stop the click reaching that
`<Link>`. `stopPropagation()` alone looked sufficient — jsdom doesn't
simulate an anchor's native "follow this href" default action, so
`RecipeCard.test.tsx` passed either way — but a real browser does, and
`stopPropagation()` stops the *Link's own* `onClick` from running rather than
stopping navigation directly. That `onClick` is exactly what would have
called `preventDefault()` to cancel the anchor's default action; skip it and
the browser follows the href regardless. Live-clicking a tag chip on the
running app surfaced this immediately (it navigated to the recipe instead of
filtering); fixed by having `TagChip` call `preventDefault()` itself, the
same way `RecipeCard`'s remove-from-collection button already did. Left as a
reminder in this codebase (and worth remembering generally) that a
nested-interactive-element fix verified only against jsdom isn't verified at
all for this specific class of bug — it needs a real browser.

New migration (`1700000000009_create-collections`) also needed a manual
`pnpm migrate up` against the dev database — unlike the test suite (which
runs migrations itself via `setupTestDatabase()`), the dev backend container
doesn't auto-migrate on start, so the running homelab-style dev stack 500'd
on every collections endpoint until that was run by hand. Worth remembering
for the real homelab deploy too: a new migration needs an explicit migrate
step, it doesn't apply itself.

Verified live against the running dev stack end to end, after the fix above:
created/renamed/deleted a collection, added/removed recipes from the detail
page (both from the popover's existing-collections list and via the inline
"new collection" path), clicked a tag chip from a recipe card and confirmed
the list landed pre-filtered without also navigating to the recipe, combined
a tag filter with a text search, and confirmed deleting a recipe doesn't
touch its collections and deleting a collection doesn't touch its recipes.

**Post-implementation scope cut, from the same live look:** the original
plan also added a filter-chip row listing every tag above the recipe grid
(backed by a `GET /recipes/tags` endpoint). Seeing it running live, it read
as clutter and was removed — tag browsing now works only by clicking a tag
already shown on a recipe, not via a standalone "browse all tags" list. The
now-unused endpoint, repository function, and frontend `listTags`/
`TagFilterChips` were deleted along with it rather than left as dead code.

## 2026-08-26: Design direction replaced — "Cookbook Editorial" supersedes "Citrus Pop"

**Decision:** Replaced Citrus Pop (orange/teal, glassy, very-rounded,
springy — [decisions.md](decisions.md#2026-08-06-design-system-defined-citrus-pop-glassyrounded-motion-forward))
with "Cookbook Editorial": paper/ink neutrals, a deep sauce-red primary and
sage secondary, a serif display face (Fraunces) with a genuine italic, a new
monospace utility face (IBM Plex Mono) for printed-label-style metadata, a
sharp/hairline shape language instead of very-rounded, and no glass/blur or
gradient anywhere. Three directions were proposed (Cookbook Editorial,
"Kitchen Ticket" — kraft paper/stamp-red/condensed caps, "Modern Bistro" —
flat two-tone color/hard offset shadows/no serif) with ASCII-mockup previews
of the recipe card in each; Cookbook Editorial was picked directly.

**Scope, agreed before building:**
- **Token layer: global, immediately.** Color/type/radius/glass values in
  `frontend/src/index.css` and the shared `buttonClass`/`inputClass`/etc. in
  `styles.ts` were swapped outright (not renamed — `citrus-*`/`teal-*` keep
  their token names, now carrying different hues, since renaming every call
  site app-wide was a much larger, riskier change for no visual difference).
  Every page inherits the new palette/fonts/shape immediately, including
  ones this pass didn't otherwise touch (header, auth screens, recipe form,
  collections pages).
- **Structural rework: recipe list and recipe detail pages only**, plus the
  shared components changed to get there — `RecipeCard`/`RecipeCardSkeleton`
  and `TagChip`'s new `editorial` variant (added alongside the existing,
  unchanged `default` variant; the `overlay` variant was deleted, see
  below). Because `CollectionDetailPage` also renders `RecipeCard` for
  its own "recipes in this collection" grid, that grid picked up the full
  structural treatment too, as a side effect of component reuse rather than
  a deliberate pass over that page — its own chrome (header, create form,
  empty state) is untouched. Per the project owner's explicit instruction,
  no other page's *layout* was touched this pass — see
  [design-system.md](design-system.md)'s "Migration status" note and the
  updated Cards/Tags/Ingredient & step display/Detail page layout sections
  for exactly what changed structurally versus what's token-only.
- `.glass`/`.glass-menu` were re-skinned (opaque card-stock surface, no
  `backdrop-filter`) rather than removed, so every consumer (header,
  `ConfirmDialog`, `ImportDialog`, `UserMenu`, toasts, the collections
  popover) picked up the new flat treatment with zero code changes.
  `.glass-photo` was deleted outright — the detail page's photo-overlay
  pattern it existed for is retired (see below), and nothing else used it.

**Why:** Requested directly — dissatisfaction with the look/feel itself,
separate from (and after) the 2026-08-06 structural CRUD-feel fixes, which
had already addressed layout without changing that verdict. Confirmed via a
direct question before building: the complaint was "still feels generic,"
not just color/type, which is why this pass leans on real structural
signature moves on the two in-scope pages (an index-style ingredient list,
large serif step numerals, a first-step drop cap, a masthead layout) rather
than a token-only reskin — a token-only pass already failed once to fix a
"still CRUD" complaint, see the 2026-08-06 critical-review entry.

**Notable trade-offs/decisions made along the way:**
- **Danger color deliberately separated from the new primary.** Citrus
  Pop's danger-500 only had to differ from *orange*; now that citrus-500 is
  itself a red, danger-500 was pulled toward a cooler raspberry/wine
  (hue ~340°) specifically to avoid "delete reads as a darker brand color"
  — see [design-system.md#color](design-system.md#color--cookbook-editorial).
- **The detail page's photo-overlay info panel was retired**, not reskinned
  in place — title/meta/tags/actions now sit below the photo in normal
  flow on both the photo and no-photo branches (previously two different
  layouts). This incidentally removes the original collision risk the
  "title and buttons in one flex row" fix addressed (nothing floats over
  the image any more); that flex-row shape was kept anyway for the same
  long-title robustness, just via normal flow now.
- **The recipe description's italic serif "lede" is a documented exception**
  to "never use the display font below `display-md`" — see
  [design-system.md#typography](design-system.md#typography).
- **The login/signup screen's orange→pink gradient background was left
  as-is** — it's a hardcoded literal gradient in `AuthLayout.tsx`, not
  derived from the citrus tokens, so the token swap didn't touch it and it
  wasn't in scope to redesign by hand this pass. It now sits oddly next to
  the new sauce-red brand color; tracked in [backlog.md](backlog.md).

**Verification:** `pnpm lint`/`test`/`build` all pass (87 frontend tests,
all pre-existing — no test asserted on colors/classnames that changed).
Verified live against the real backend + seeded demo data via a headless
Playwright script (no project browser-automation skill existed yet for this
repo): recipe list and detail pages in both themes, a no-photo recipe, the
delete `ConfirmDialog` (confirms the glass-token reskin renders correctly
on a component this pass didn't edit), and the login screen (confirms the
global token swap doesn't break an out-of-scope page — a first full-page
screenshot looked washed-out, which turned out to be a compression artifact
of that particular screenshot, not a real rendering bug: computed styles
and a cropped, pixel-level screenshot both confirmed correct opaque-white/
dark-text rendering).

**Alternatives considered:** Keeping `.glass-photo` and `TagChip`'s `overlay`
variant for a possible future photo-overlay surface (rejected for both —
their designs were specific to Citrus Pop's now-retired overlay pattern, no
longer had any caller, and CLAUDE.md's standing rule is to delete
certainly-unused code rather than keep a compat shim "just in case"; a
future need should get a treatment designed for this direction's flat/
hairline language, not a resurrection of either). Renaming `citrus-*`/`teal-*` tokens to
neutral names now that they no longer mean "orange"/"teal" (rejected for
this pass — a mechanical rename across every file that references them is
a large, separate, low-value refactor; tracked in backlog.md instead of
bundled into a visual change).

## 2026-08-26: Cookbook Editorial rolled out to the rest of the app

**Decision:** Finished the migration the same-day entry above deliberately
left incomplete — gave the header, auth screens, recipe form, and
collections pages the structural pass that was previously scoped out:

- `AuthLayout`'s hardcoded Citrus Pop gradient background (`linear-gradient
  (135deg, #FF7A1A 0%, #FF3D81 100%)`, inline in the component, so the
  global token swap couldn't have touched it) replaced with the same
  `bg-surface-page` every other screen uses. Cookbook Editorial has no
  gradient/hero moment (see design-system.md#color), so this isn't a
  reskin of the gradient, it's removing it.
- The two remaining pill-shaped nav controls (`Layout`'s "Collections"
  link, `UserMenu`'s username trigger) moved from `rounded-full` to
  `rounded-md`, matching every button's move away from pills in the
  original pass.
- `CollectionsPage`, `CollectionDetailPage`, and `RecipeFormPage`'s page
  titles switched to the same italic-Fraunces masthead voice as the recipe
  list/detail pages (the first two also gained a hairline rule under the
  title; the list page added a mono item-count caption matching
  `RecipeListPage`'s).
- `RecipeFormSkeleton`'s loading bars dropped their leftover `rounded-full`
  to match `RecipeCardSkeleton`/`RecipeDetailSkeleton`'s sharper bars.

**Why now, and why not bundled into the original pass:** the project owner
asked directly to "tackle the items you added to the backlog to finish the
style transition" — a deliberate, explicit go-ahead for the wider-blast-
radius work the original pass had scoped out on its own initiative.

**Found along the way, fixed even though not originally backlogged:** a
grep for the old Citrus Pop hex values (done to make sure nothing was
missed before calling this finished) turned up two more hardcoded
remnants outside `frontend/src`: the PWA manifest's `theme_color`
(`#ff7a1a`) and `background_color` (`#fdfcfb`) in `vite.config.ts`, and the
SVG app icon/favicon `frontend/public/icon.svg`'s fill color — neither is
part of the token system so the global swap couldn't reach them either.
Both recolored to the new sauce-red/paper values. The raster PNG icon set
generated from that SVG (`icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`) was **not** regenerated —
that's an image-export step, not a text edit, and there's no script in the
repo that produced them originally; tracked in backlog.md rather than
attempted without the right tooling.

**Explicitly left as-is, on purpose:** the `citrus-*`/`teal-*` token rename
— still a separate, low-value refactor on its own merits, not something
"finishing the transition" requires (the colors are already correct; only
the token *names* are stale). `RecipeFormPage`'s section cards, inputs, and
buttons needed no changes at all — they were already fully token-driven
from the original pass (`sectionCardClass`, `inputClass`, `buttonClass`),
which is itself a confirmation that pass's "keep shared utilities, don't
rename/restructure them" approach paid off here.

**Verification:** `pnpm lint`/`test`/`build` all pass (89 frontend tests,
one unrelated flaky debounce-timing test re-ran clean in isolation).
Verified live, both themes: login and signup screens, the Collections list,
a collection's detail page, and the new-recipe form. One false alarm during
verification worth recording: a login-page screenshot taken immediately
after navigation looked washed-out/low-contrast, reproducing the same
symptom from the original pass's verification — this time confirmed
definitively as a screenshot-timing artifact, not a rendering bug: the
`.glass` card uses `animate-pop-in` (a 400ms fade/scale-in), and a
screenshot taken before that settles catches the card's `opacity` partway
through its animated value, fading everything inside it uniformly while
the (unanimated) page background renders correctly — confirmed by
re-capturing after a `waitForTimeout` past the animation's duration, which
rendered crisp and correctly contrasted every time.

## 2026-08-26: citrus and teal tokens renamed to sauce and sage

**Decision:** Renamed the design tokens themselves — `--color-citrus-*` →
`--color-sauce-*`, `--color-teal-*` → `--color-sage-*`, and every Tailwind
class referencing them (`bg-citrus-500` → `bg-sauce-500`, `text-teal-500` →
`text-sage-500`, etc.) across `frontend/src`. Also added `--color-sage-100`
(`#DBE0CE`) — the palette had a `100` tint for the primary family
(`citrus-100`/now `sauce-100`) but not the secondary one, and one real spot
(`TagChip`'s default-variant hover fill) had been silently relying on
Tailwind's own built-in `teal-100` swatch as an unintended fallback.

**Why now, reversing the original pass's call:** both the original
2026-08-26 entry and its same-day structural follow-up explicitly kept the
old names, reasoning that "renaming every call site app-wide is a much
larger, riskier change than reskinning the token" bundled into an
already-large visual change. Requested directly once that change had shipped
and been verified stable — with the bigger, riskier work (colors, structure,
every page) already done and confirmed working, the rename became exactly
the small, mechanical, low-risk cleanup the earlier entries described it as
being *in isolation*, just not worth bundling in at the time.

**How, to keep a mechanical rename mechanical:** a literal find-and-replace
of the token-name substrings (`citrus-` → `sauce-`, `teal-` → `sage-`)
across every `.tsx`/`.ts`/`.css` file that referenced them, verified by grep
before and after. The one deliberate exclusion: `decisions.md`'s and
`design-system.md`'s historical mentions of **"Citrus Pop"** (the old
design direction's proper name, e.g. "supersedes Citrus Pop") were left
untouched — that's a name in prose, not a token, and per this file's own
"don't edit history" rule the old design's name doesn't change just because
its tokens got renamed out from under it. `design-system.md`'s current
(non-historical) sections were updated to the new names, including two
spots whose surrounding sentence had explicitly explained *why the rename
wasn't happening* — those got rewritten, not just substituted, since a
find-and-replace would have left them self-contradictory (see that doc's
Color section).

**Found and fixed along the way, not part of the original ask:** two
pre-existing bugs in the styles being renamed, both the same class of issue
already caught once before in this app (`buttonClass`'s secondary variant,
fixed in the original 2026-08-26 pass) — a class referencing a shade that
was never defined in the theme, silently falling back to Tailwind's own
default color of the same family name instead of this app's palette:
- `TagChip`'s default variant used `hover:bg-teal-100` (now `sage-100`,
  added as a real token above, closing the gap rather than routing around
  it).
- `TagInput`'s remove-tag button used `text-teal-600 hover:text-teal-800
  dark:hover:text-teal-100` — three more undefined shades. Rather than
  inventing yet more one-off tokens, this one was fixed to match the
  convention already used by every other remove/× control in the app
  (`RecipeFormPage`'s `removeButtonClass`, `RecipeCollectionsEditor`'s chip
  remove button): base `sage-700`/`dark:sage-300` (both real, matching the
  chip's own text color), hover to `danger-500` in both themes — consistent
  with the rest of the app instead of a fourth ad hoc sage shade.

**Verification:** `pnpm lint`/`test`/`build` all pass (89 frontend tests).
Since this changed only token/class *names*, not values, the rendered
output should be pixel-identical to before — confirmed by re-capturing the
recipe list and detail pages live and comparing against the prior pass's
screenshots.

## 2026-08-28: Collections redesigned as a nested, mandatory hierarchy; becomes the home page {#2026-08-28-collections-redesigned-as-a-nested-mandatory-hierarchy-becomes-the-home-page}

**Decision:** Collections are no longer a flat, optional, many-to-many
grouping — they're a nested, filesystem-like hierarchy (`collections.
parent_id`, self-referencing, unlimited depth), and every recipe belongs to
exactly one collection, always (`recipes.collection_id`, `NOT NULL`,
replacing the `recipe_collections` join table outright). The collections tree
becomes the app's home page (`/`); the recipe list moves to `/recipes`,
reachable via a new "All recipes" nav link (replacing the old single
"Collections" link, now redundant since the logo goes home). This
**explicitly supersedes the 2026-08-19 entry above** on every point where
they now disagree:

- That entry's claim "deleting a collection never deletes its recipes;
  deleting a recipe never deletes other collections it wasn't the only member
  of" is **reversed**. Deleting a collection now cascades destructively —
  every sub-collection and every recipe anywhere in its subtree is deleted
  too, matching a literal "delete the folder and everything in it," chosen
  directly over promoting contents to the parent or blocking a non-empty
  delete.
- Collections are no longer "structurally identical to tags" — tags stay
  exactly as they were (optional, many-to-many, global vocabulary); a
  collection is now a mandatory, to-one, per-user hierarchy. The two concepts
  diverge further than the original entry's framing anticipated.
- "Collection membership isn't part of `RecipeInput`" still holds for
  *editing* a recipe (`updateRecipe` never touches `collection_id` — moving a
  recipe is a separate action, `PATCH /recipes/:id/collection`), but no
  longer holds for *creating* one: `POST /recipes` now accepts an optional
  `collectionId`, resolved to the caller's auto-created "Other" collection
  when omitted (`ensureDefaultCollection`), since a recipe can no longer be
  created with zero collections to backfill later.

**Why exactly one collection, filesystem-style, not "one-or-more, never
zero."** Requested directly, framed explicitly as wanting recipes "stored in
some sort of file structure" — a recipe is a file, a collection is a folder,
and a file lives in exactly one folder at a time, moved rather than
multiply-filed. A hybrid "still many-to-many, just never empty" model was
considered and rejected: it would have kept the old chips-and-popover
membership UI's shape while contradicting the "file structure" mental model
directly, for no requested benefit.

**Why two partial unique indexes instead of one `UNIQUE(user_id, parent_id,
name)`.** Postgres treats `NULL <> NULL` in a unique constraint, so a single
constraint on `(user_id, parent_id, name)` would not stop two root-level
collections (`parent_id IS NULL`) from both being named "Other" — two
different rows, both NULL in that column, no conflict detected.
`collections_root_sibling_name_idx` (`WHERE parent_id IS NULL`) and
`collections_child_sibling_name_idx` (`WHERE parent_id IS NOT NULL`) enforce
sibling-name-uniqueness for the two cases separately, which is the standard
fix for this exact gotcha.

**Why `ON DELETE CASCADE` at the database level, with file cleanup done by
the route beforehand rather than after.** Letting Postgres cascade the row
deletion (`collections.parent_id` and `recipes.collection_id` both cascade)
means a whole subtree — collections, recipes, ingredients, steps, images
rows, tags links — is removed correctly in one statement, with no risk of
missing a level in application code. The one thing a DB cascade can't do is
touch the filesystem, so `getCollectionSubtreeImagePaths` (a recursive CTE)
collects every image file path in the subtree *before* the delete runs — the
rows won't exist to query afterward — and the route unlinks them from disk
afterward, best-effort, the same pattern the existing single-recipe delete
already used.

**Migration data-loss rule — and why it isn't actually lossy.** Existing
recipes with zero prior collection memberships get the new "Other"
collection; recipes with exactly one keep it; recipes that were in *more
than one* (allowed under the old many-to-many model) keep only the **lowest
collection id** among their old memberships as `recipes.collection_id` —
the new model has no column to hold more than one. The migration was
initially written (and this entry initially claimed) that the rest are
"silently dropped... only seed/demo data existed at migration time, so this
had no real-world impact." **That claim was wrong and was never actually
checked** — [deployment.md](deployment.md) records Nosh as live in
production since 2026-08-19, with `SEED_DEMO_DATA` off there, meaning
production has had nine days of whatever real collections the project owner
actually created, entirely unverified for multi-membership recipes before
this migration was first written. Caught when asked directly "have you
thought about migrations... how do we account for this" — the honest answer
at that point was "the mechanism to *run* a migration on redeploy was
accounted for, its safety on real existing data was not." Fixed properly
rather than just checking production first: the migration now creates
`recipe_collections_archive_1700000000010`, a full snapshot of the
many-to-many table taken before anything is collapsed, so no membership
data is actually destroyed regardless of what production turns out to
contain. `down()` restores the exact original multi-membership state from
this archive (falling back to reconstructing one membership per recipe from
`recipes.collection_id` only if the archive was deliberately cleaned up
first), which was verified directly: rolling a seeded two-collection recipe
forward and back through the migration in an isolated scratch database
reproduced the original two rows exactly, not a collapsed one. A
`RAISE NOTICE` reporting the affected count was also added but turned out to
be a dead end worth recording — Postgres does emit it (confirmed via raw
`psql`), but `node-pg-migrate`'s CLI, which `pnpm migrate up` and every
documented deploy step actually run, never listens for the `NOTICE` event,
so it's silently swallowed there. Left in as a harmless best-effort (visible
if this file is ever run directly through `psql`), but the archive table —
not the notice — is the real, verified safety net; **the deploy runbook
should query it for any `recipe_id` with more than one archived row before
trusting the migration ran clean.**

**Reparenting existing collections is in scope, not deferred.** A
collection's parent can be changed after creation (folded into
`PUT /collections/:id` alongside rename, as one "edit collection" action,
rather than a second endpoint), guarded by a recursive-CTE cycle check
(`wouldCreateCycle`) that rejects moving a collection underneath its own
descendant. Requested directly over deferring it — a folder hierarchy that
can only be shaped once at creation time undercuts the "file structure"
framing this whole redesign is built around.

**Alternatives considered:** promoting a deleted collection's contents to its
parent, or blocking deletion while it's non-empty (both rejected — the
project owner explicitly chose the literal, destructive "delete the folder
and everything in it" semantics); a `collectionId` field on `RecipeInput`
shared by create and update (rejected — would let a full-replace `PUT` on a
recipe's other fields silently relocate it if the field were ever
omitted/defaulted on the client; keeping `updateRecipe` structurally unable
to touch `collection_id` closes that class of bug at the type level, not just
by convention); deferring collection reparenting to a later pass (rejected,
see above).

`pnpm lint`/`test`/`build` pass on both packages (frontend and backend test
suites both green, including new coverage for nesting, sibling-name
uniqueness across different parents, cycle rejection on reparent,
cascade-delete behavior, and the default-collection fallback on recipe
creation). New migration (`1700000000010_nest-collections`) applied by hand
against the dev database via `pnpm migrate up` — same manual step the
2026-08-19 collections migration needed, the dev backend container still
doesn't auto-migrate on start.

**Verified live, and caught a real bug the test suite missed.** A headless
Playwright script (`chromium.launch()`, no test runner) drove the actual dev
stack end-to-end against seeded demo data: home page → nested collection
creation → moving a recipe via the picker (breadcrumb updates) → "All
recipes" staying collection-agnostic → deleting a collection with nested
contents. That last step surfaced a genuine bug: `CollectionsPage`'s
`confirmDelete` called `deleteCollection` then `navigate()`, but never
`reloadAll()` — deleting a **nested** collection happens to self-correct
(navigating to its parent changes the `:id` param, which `getCollectionContents`
already depends on and refetches), but deleting a **root-level** collection
navigates to `/`, where the home view renders purely from `allCollections`,
which nothing had invalidated. The result: after deleting a root-level
collection, the home page kept showing it, stale, until some unrelated
action happened to call `reloadAll()`. Every one of the 9 unit tests written
for this feature passed regardless, because none of them exercised a
root-level delete specifically — the existing delete test used a nested
collection, whose parent-navigation path happens to hide the bug. Fixed by
calling `reloadAll()` in `confirmDelete`'s success handler before navigating,
and a new regression test (`CollectionsPage.test.tsx`, "deletes a root-level
collection and reflects that on the home page it navigates back to") pins
down the specific case the rest of the suite couldn't reach. Re-verified live
after the fix: full walkthrough passes end-to-end, including confirming the
deleted collection's old URL now 404s.

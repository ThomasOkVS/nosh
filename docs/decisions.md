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

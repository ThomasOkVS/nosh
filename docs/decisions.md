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

## 2026-08-05: Region — Belgium

**Decision:** Default units, currency, and future supermarket integrations
target Belgium (metric units, EUR, chains like Colruyt and Albert Heijn), kept
flexible enough to extend to neighboring EU countries later.

**Why:** Matches where the project owner actually shops; stated as the primary
region during scoping.

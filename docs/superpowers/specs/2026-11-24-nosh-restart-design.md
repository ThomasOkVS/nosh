# nosh restart — design

**Date:** 2026-11-24 · **Status:** draft, awaiting owner approval
**Inputs:** [handover](../../restart/2026-11-24-handover.md) ·
[style log](../../restart/style-log.md) · current code on `main`
(to become `legacy-v1`)

This document is the design for rewriting nosh from scratch. It is the
*project* design: why, what, in what order, on what stack, and with what look.
It is not the feature spec. Feature behaviour gets its own spec
(see §8, Spec extraction), produced from the current app before anything is
wiped.

How to read the labels:

- **Decided**: the owner confirmed it. Don't reopen.
- **Proposed**: put to the owner, not yet confirmed. It is the default until the
  owner says otherwise (see §12).
- **My call**: settled by the author because it doesn't change what gets
  built. The owner can override.

---

## 1. Intent

nosh is a self-hosted, subscription-free recipe manager for one person (the
owner), in Dutch and English, used mostly on an iPhone as an installed PWA.
It started as a beginner project to learn React, Node and AI-assisted
development. The owner has since grown as an AI developer, and the models have
got better.

The goal, in the owner's words: **"a better app that is easier to work on and
uses the latest flows I've learnt."**

- **Better app** means chiefly the UI/UX. The current one "feels clunky and
  unprofessional". A new visual style has already been designed and locked
  (§7).
- **Easier to work on** means easier for the owner *and AI agents*: a smaller,
  conventional codebase, tests as the spec, and lean docs.
- **Latest flows** means superpowers end to end (brainstorm → spec → plan →
  red-green TDD → review), one feature group at a time.

**Learning React/Node is no longer a goal.** Tech is chosen on merit for the
app and for how reliably agents can work in it.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Feature parity with today's nosh, minus dead weight (§5), redesigned in the
   locked style.
2. All existing data carried over (recipes, photos, collections, tags, users,
   preferences), except meal-plan data.
3. A codebase an agent can pick up cold: one language, one deployable,
   conventional libraries, behaviour pinned down by tests written from
   acceptance criteria.
4. The security hardening the current app has earned stays, as explicit
   requirements (§9).

**Non-goals (for the first release)**

- New features. The backlog (notes and ratings, cook mode, grocery lists,
  nutrition, Belgian supermarket integration, Dutch-aware search,
  volume↔weight conversion, locale decimals, CSP header) stays in the backlog.
  These come after cutover, each through its own superpowers cycle.
- Multi-user product work. Accounts stay for parity, but nosh is single-user
  in practice.
- SSR, SEO and public pages. nosh is private.
- Porting the old code. The old code is a source of *requirements*, not of
  implementation.

**Anti-goals** (would make it a failure even if it technically works)

- **The meal planner comes back** in any form (UI, routes, tables). It is
  dropped.
- **It looks like the old app**, or like a generic shadcn template. The style
  log wins over the old `docs/design-system.md` and over suggestions from
  generic design tooling such as the `frontend-design` plugin.
- **It recreates the old docs sprawl** (a 2,800-line decisions log,
  mentor-style CLAUDE.md). The new repo starts lean (§10).
- **Data is lost or silently changed** in migration. A recipe that existed
  before cutover must be findable, with its photo, in the same collection,
  after cutover.
- **Security regresses**: a guard that exists today is missing tomorrow.
- **Newest-library-itis.** Where two libraries would do, the boring, popular
  one wins.

## 3. Constraints

- **Hosting:** the owner's homelab. Docker via Dockge, behind Caddy, at
  `https://nosh.itsthomassito.com`. Images come from GHCR and are pulled by
  Watchtower. Data is bind-mounted under `/DATA/nosh/` so the Kopia backup
  covers it.
- **Today's topology is two containers** (nginx frontend + Express backend),
  with `TRUSTED_PROXIES` pinned to nginx's fixed IP. The new app is **one
  container**, so it joins Caddy's `proxy` network directly and **the trusted
  proxy becomes Caddy**. Client-IP handling, origin checks and rate limits all
  depend on getting this right.
- **Same-origin `/api`**, no CORS. The browser only ever talks to one origin.
  The allowed-origins list feeds the CSRF/origin check.
- **yt-dlp must ship in the image** (Reels/TikTok import).
- **External services:** Gemini (one server-side API key; per-user model
  choice), Web Push with VAPID keys. The VAPID keys and origin are reused so
  existing push subscriptions keep working.
- **Dev machine is Windows.** Known quirk: the `shadcn` CLI fails to invoke
  pnpm here. **Builder prerequisite:** fix it before scaffolding (try
  `npx shadcn@latest` from PowerShell, a different pnpm install method, or
  setting `npm_config_user_agent`). The style prototype worked around it by
  fetching components straight from
  `https://ui.shadcn.com/r/styles/base-nova/<name>.json`.
- **Existing users log in by username, and password hashes are argon2**
  (`users.username` is unique, `users.email` also exists and is unique). The
  owner must be able to log in after cutover with their current password. See
  §6 Auth.
- **Single user, so a few minutes of downtime at cutover is fine.**

## 4. Approaches

**Decided: Shape 1. One container: a React SPA served by a Hono API.**

| Approach | Trade-off | Outcome |
|---|---|---|
| **Shape 1: React + TS SPA (Vite, TanStack Router/Query) served by a Hono API, one container** | Simplest deployable. One language end to end with shared zod schemas and Hono's typed RPC client. No SSR, which a private single-user app doesn't need. | **Picked** |
| React Router v7 framework mode | SSR not needed. Couples routing, data loading and the service worker, which makes the PWA harder. | Rejected |
| Next.js | Vercel/RSC complexity for no gain on a self-hosted private app. | Rejected |
| Non-TS backend (Go or Python) | Two languages lose shared types. Go is the credible alternative if the backend ever separates. | Rejected |

**Why React + TypeScript at all, now that learning isn't the point:** AI models
are measurably more reliable on popular stacks ("Matthew effect", ICLR 2026,
arXiv 2509.23261). TypeScript is #1 on GitHub (Octoverse 2025). The AI app
builders (Lovable, v0, Bolt) have standardised on React + TS + Tailwind +
shadcn. The principle carried forward: **prefer boring, popular libraries over
the newest ones.**

## 5. Scope of the first release

**Decided: parity minus dead weight.** Everything nosh does today, redesigned,
except the weekly meal planner.

Today's features, with their fate:

| Area | What it does today | First release |
|---|---|---|
| Accounts | Username/password login; signup gated by an env flag | Keep (Better Auth, *proposed*, §6) |
| Recipes | Title, ingredients (quantity/unit/name), steps, photo, tags, servings, prep/cook time, source URL | Keep |
| Scaling & units | Scale servings; metric/US and °C/°F conversion; "keep spoons" | Keep |
| Collections | Nested, mandatory hierarchy; the home page; recipes may live at Home | Keep |
| Tags | Fixed vocabulary on import, capped and de-duplicated; tag browsing | Keep |
| Search | Postgres full-text search (`english` config) | Keep (Dutch-aware search stays in backlog) |
| Import | Gemini import from URL (JSON-LD fast path), Instagram Reels and TikTok (yt-dlp); server-side jobs with progress; photo fetched after save | Keep |
| Translation | Auto-translate and convert units of imports to the user's preferences | Keep |
| Settings | Recipe language, unit system, temperature unit, keep spoons, Gemini model choice, self-counted usage estimate | Keep |
| PWA & push | Installable on iPhone; Web Push "import done" notification | Keep |
| Meal planner | Weekly calendar of planned recipes | **Drop.** No UI, data not migrated |

Any other feature may be struck during spec review. Each one gets an explicit
keep/drop line in the extracted spec (§8).

## 6. The stack and how the parts fit

**Decided (Shape 1):**

- **Frontend:** React + TypeScript SPA, Vite, TanStack Router + TanStack Query,
  Tailwind, shadcn/ui (Base UI primitives, `base-nova` style), Motion. PWA,
  installable on iPhone.
- **Backend:** Hono. It serves the API *and* the built SPA, so there is one
  deployable. Shared zod schemas plus Hono's typed RPC client give end-to-end
  types.
- **Data:** PostgreSQL (kept), Drizzle ORM + Drizzle migrations.
- **Jobs:** Postgres-backed queue (pg-boss) for imports.
- **Tests:** Vitest (unit/integration) + Playwright (`@playwright/test`, e2e).

**My calls** (the builder can change these without changing what gets built):

- **Repo layout:** a pnpm workspace with `app/` (SPA), `server/` (Hono) and
  `shared/` (zod schemas, units logic, ingredient-line parsing). The units
  package keeps being a pure, separately tested module. *Reason:* the typed RPC
  client wants the server's route types importable from the SPA, and pure logic
  is easiest to test on its own. A single package with folders is also fine if
  the builder finds the workspace adds friction.
- **Node 22 LTS** runtime (`@hono/node-server`), not Bun or Deno. *Reason:*
  boring and popular; pg-boss, argon2 and yt-dlp spawning are all well-trodden
  on Node.
- **Photos stay on local disk** under a bind-mounted uploads directory, served
  through an authenticated route (as today). No object storage.
- **Progress for import jobs:** the client polls the job via TanStack Query
  (or uses SSE). It does not need to keep today's NDJSON stream. The behaviour
  that matters is "you see progress, and you get a push when it's done even if
  you left the app".
- **Search:** Postgres full-text search, same behaviour as today. The
  text-search config is a single constant so Dutch-aware search is a later,
  small change.

### Auth

**Proposed:** keep accounts (parity) using **Better Auth** with its Drizzle
adapter instead of hand-rolled sessions.

**Constraint the builder must verify before planning auth:** existing users log
in with a **username** and their passwords are **argon2** hashes. Better Auth
defaults to email login and its own password hasher. The plan has to show,
with a test, that the owner can log in after import with their current
username and password. The likely route is Better Auth's username plugin plus
its custom `password.hash` / `password.verify` options backed by argon2. If
that can't work cleanly, fall back to hand-rolled sessions (as today) and say
so. Don't force a password reset. Session cookie requirements are in §9.

## 7. Visual style (decided, locked)

Designed over seven fork-and-pick rounds with a throwaway prototype (see the
[style log](../../restart/style-log.md) for every round). This section is
normative for all UI work.

| Aspect | Choice |
|---|---|
| Base | shadcn/ui (Base UI primitives, `base-nova` style) + Motion. No Kokonut UI. No chart library. |
| Recipe page | **Magazine cover:** full-bleed photo with parallax, headline card sliding over it. A **floating bottom pill** switches Ingredients / Method (icon + label, ink active pill that springs between options). The top of the page stays clean. The app nav is hidden on the recipe page; the pill takes its slot. |
| Fonts | **DM Serif Display** for headings (weight 400 only, never faux-bold) + **DM Sans** for body and UI |
| Colour (P4, light) | Chalk paper `oklch(0.985 0.004 90)`, white cards, ink `oklch(0.2 0.01 260)` for text, buttons and the active pill, mustard `oklch(0.6 0.13 75)` for small highlights (kicker label, step numbers), bright mustard `oklch(0.86 0.15 88)` for accent and focus. Tomato red is retired. |
| Density | Balanced: Tailwind's default spacing unit (0.25rem) |
| Motion | Spring pills (stiffness ~420, damping ~34), soft ease-out reveals `[0.22, 1, 0.36, 1]`, cover parallax, number roll when servings change |
| Library | Kicker count, big display title, rounded search, springy tag chips, 2×2 collection tiles, 2-column recipe cards (4:5 photo, or a letter placeholder) |
| App nav | Floating bottom pill in the same style as the recipe tabs, plus a round mustard "+" (new recipe / import). Settings is an icon top-right. Replaces the old header search and user menu. |

The prototype lives at `.superpowers/style-spike/` in the owner's main
checkout (git-ignored, throwaway, *reference only*, not product code). Run it
with `pnpm --dir .superpowers/style-spike dev` → `http://localhost:5199`
(`?round=1..7`; round 7 shows the library).

**Proposed, navigation with the planner gone:** a library-only app. The bottom
pill shrinks to **Library + mustard "+"**, settings stays top-right. With a
single destination the pill could arguably collapse to just the "+". Final
shape to confirm (§12).

**Proposed, dark mode:** derive it from P4. My proposal: ink becomes the paper
(a warm near-black around `oklch(0.18 0.01 260)`), cards one step lighter
(`oklch(0.23 0.01 260)`), chalk becomes the text, the active pill turns
chalk-on-ink inverted, and both mustards stay as they are (bright mustard
already reads well on dark). It follows the system setting. Check contrast
(WCAG AA) on the final values.

**Rule for UI work:** the style log and this section win over the old
`docs/design-system.md` (Citrus Pop / Cookbook Editorial; superseded) and
over any generic design-plugin suggestion.

## 8. Project order

**Proposed:**

1. **This design doc.** Approved by the owner.
2. **Spec extraction.** Parallel agents, one per area: auth, recipes,
   collections, search, import, units/scaling/translation, settings,
   PWA/push, security hardening. Each reads the current code, tests and
   `docs/decisions.md` (54 ADRs, the main source of the *why*). Each produces
   testable **acceptance criteria** (the *what*), the **rationale** (the
   *why*) and a **keep/drop line per feature**. It captures what nosh does, not
   how it's built. The owner reviews and approves the spec.
   **Gate: nothing is wiped until the owner approves the spec.**
3. **Archive and wipe.** Tag current `main` as `legacy-v1`, keep a `legacy`
   branch for lookups, clear `main` (decided). The approved spec and this
   design survive the wipe.
4. **Build**, one superpowers cycle (plan → red-green TDD → review) per feature
   group, in this order: skeleton + auth → recipes → collections → search →
   units and scaling → import jobs → PWA and push → settings.
5. **Data migration and cutover** (§11).

**What gets planned next:** once this design is approved, the first plan
(`superpowers:writing-plans`) covers **step 2, spec extraction, only**:
agent briefs per area, the spec layout, the review gate, then the
archive-and-wipe step. Build plans are written one feature group at a time,
*after* the spec is approved, so they can cite criterion IDs. Nobody writes
a whole-project task plan up front.

**Proposed, spec on disk:** one file per area under
`docs/superpowers/specs/nosh-v2/` (e.g. `auth.md`, `recipes.md`), plus an
`index.md` that lists the areas and the keep/drop verdicts. Each criterion has
a stable ID (e.g. `REC-07`) so tests and plans can cite it.

**Proposed, tests:** rewrite tests from the acceptance criteria. Port only the
pure-logic tests directly (units conversion, quantity/temperature formatting,
ingredient-line parsing), since those encode hard-won edge cases and don't
depend on the old architecture.

**Skeleton (my call, what build step "skeleton + auth" means):** the one-container
build serving the SPA from Hono; Drizzle wired with a first migration; health
endpoint; Vitest and Playwright running in CI; Dockerfile with yt-dlp; the
style tokens (fonts, P4 colours, motion constants) in place; the app shell
with the bottom pill; and login working end to end. Deploying the skeleton
alongside the old app (on its own subdomain or port behind Caddy) as early as
possible is encouraged, so the real topology is exercised before cutover.

## 9. Security requirements (carried over)

**Proposed as explicit requirements** (each becomes acceptance criteria in the
security spec area):

- **SSRF guard** on every server-side fetch of a user-supplied or third-party
  URL: URL import (page and photo fetch), yt-dlp, and Web Push endpoints. Block
  private, loopback, link-local and metadata addresses, including after
  redirects and DNS resolution.
- **Session cookie** named with the `__Host-` prefix (Secure, Path=/, no
  Domain), HttpOnly, SameSite.
- **Origin check** on state-changing requests against the configured allowed
  origins.
- **Rate limits** on login, signup and import, keyed by client IP. The client IP
  comes from `X-Forwarded-For` **only** when the peer is the trusted proxy
  (Caddy, in the new topology).
- **Signup off by default** (env flag), as today.
- **Images served through an authenticated route**, never a public static
  mount.

The security spec area extracts the full list from the current code and ADRs.
The items above are the floor, not the ceiling.

## 10. Docs and agent setup in the new repo

**Proposed:** start lean.

- A short `CLAUDE.md`: stack, commands, "the spec is the source of truth,
  tests cite criterion IDs", "the style section of the design doc is
  normative", "always use worktrees". **No mentor/teaching section**, since
  learning is no longer a goal.
- This design doc and the extracted spec under `docs/superpowers/`.
- A short `docs/decisions.md`, **new**, starting with one entry pointing at this
  design. The old 54 ADRs live on in the `legacy` branch.
- A `docs/deployment.md` for the one-container topology, written when the
  skeleton deploys.
- The old `docs/` (architecture, design-system, backlog, handover runbooks) is
  not carried over. Open backlog items move to the new backlog.

## 11. Data migration and cutover

**Proposed:**

- A **one-time importer** (old schema → new), built test-first against a
  **sanitised dump of the real database**.
- **The new container runs alongside the old one on its own database.** Import,
  verify, switch Caddy. **Rollback = point Caddy back.** A few minutes of
  downtime is acceptable.

**What moves:**

| Old | New | Note |
|---|---|---|
| `users` (username, email, argon2 hash, preferences, import model) | users + Better Auth account rows | Owner must log in with their current password (§6) |
| `recipes`, `ingredients`, `steps`, `tags`, `recipe_tags` | equivalents | Order of ingredients and steps preserved |
| `recipe_images` (several per recipe, ordered by `position`) | equivalent, **all images kept in order** | Today's UI only ever shows the first image. The new UI uses the first as the cover. Whether a gallery is kept is a spec-review keep/drop line. The importer never drops images either way (my call) |
| `collections` (nested) + recipe placement, including recipes at Home | equivalents | Hierarchy and placement preserved exactly |
| Photo files under `/DATA/nosh/uploads` | the new app's uploads directory | Copied, not moved, so rollback still works |
| `push_subscriptions` | equivalent | Same origin and VAPID keys, so they keep working (my call) |
| `llm_usage` | equivalent | Feeds the usage estimate in settings (my call) |
| `meal_plan_entries` | **not migrated** | Planner dropped |
| `import_jobs` | **not migrated** | Transient history; nothing reads finished jobs (my call) |
| sessions | **not migrated** | Owner logs in once after cutover (my call) |
| `recipe_collections_archive_1700000000010` | **not migrated** | Leftover archive table from an old migration |

**Verification:** the importer reports counts per table, old vs new, and fails
loudly on any row it can't map. After import, a scripted check confirms every
old recipe ID maps to a new recipe with the same title, ingredient count, step
count, collection path and the same number of readable images.

**Search vectors:** regenerated in the new schema, not copied.

## 12. Awaiting the owner's confirmation

These are the defaults in this design. Confirm or change:

1. Project order (§8): design → spec → archive/wipe → build → migrate.
2. Spec extraction by parallel agents, with the wipe gated on spec approval (§8).
3. Build order (§8).
4. Migration and cutover approach (§11).
5. Security hardening as explicit requirements (§9).
6. Better Auth for accounts (§6), subject to the username/argon2 check.
7. Lean docs, no mentor section (§10).
8. Navigation shape: Library + "+" pill, settings top-right (§7).
9. Dark mode derived from P4 as sketched (§7).
10. Tests rewritten from criteria; only pure-logic tests ported (§8).
11. Spec on disk: one file per area with criterion IDs (§8).

## 13. Left to the builder

- Exact folder layout, file naming and module boundaries inside the stack above.
- Library choices *within* the decided stack (e.g. icon set, form library,
  zod-to-OpenAPI or not), following "boring and popular".
- The service-worker approach for the PWA (e.g. `vite-plugin-pwa`), provided
  install-on-iPhone and Web Push work.
- CI shape (GitHub Actions publishing to GHCR, as today, is the default).
- How progress is delivered to the client for import jobs (§6).
- Dark-mode exact values, within the direction in §7 and WCAG AA.

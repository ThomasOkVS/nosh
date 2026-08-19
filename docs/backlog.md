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

- [ ] Allow mobile users to close the app during import, and get a push notification once it's done
- [ ] View tokens left / model selector for magic import
- [ ] Auto translate imported recipes to the user's native language and preferred units of measure.
- [ ] Smart unit conversions and recipe scaling.
- [ ] Notes & ratings on recipes.
- [ ] Nutrition info via an external nutrition database.
- [ ] Active cooking mode (ingredients can be checked of, cooking steps can be checked off, other ideas?).
- [ ] Weekly meal planner.
- [ ] Grocery list generation from planned meals (depends on the meal
      planner above existing first).
- [ ] Grocery list integration with Belgian supermarkets (Colruyt, Albert
      Heijn, etc.) — depends on grocery list generation above existing
      first.
- [ ] Native-feeling mobile experience (MVP ships as a responsive PWA; this
      is a further step beyond that).

## Completed

- **2026-08-19** — Recipe organization: collections and tag-based browsing
  shipped. Collections are simple named lists (many-to-many with recipes, no
  description/cover/ordering) — a new `collections`/`recipe_collections`
  table pair modeled on `tags`/`recipe_tags` but with their own
  `user_id`/CRUD identity, managed via a new `/collections` router and a
  `RecipeCollectionsEditor` on the recipe detail page (add/remove/create,
  never through the recipe form itself). Tag-based browsing is an optional
  `tag` query param on `GET /recipes`/`GET /recipes/search` (an `EXISTS`
  subquery, combinable with text search), reached only by clicking a tag
  already shown on a recipe — an earlier pass also added a standalone
  filter-chip row above the recipe grid, but a live look at the running app
  showed it as clutter and it was cut, along with the `GET /recipes/tags`
  endpoint that only existed to feed it. Manual tag entry
  (`TagInput`)/the fixed import vocabulary are both unchanged, per scope
  agreed before starting. See
  [decisions.md](decisions.md#2026-08-19-collections-added-as-a-first-class-concept-distinct-from-tags-tag-browsing-via-a-query-param)
  for the collections-vs-tags reasoning and a real bug caught only by live
  browser verification (`TagChip` needed `preventDefault`, not just
  `stopPropagation`, to stop `RecipeCard`'s wrapping `Link` from navigating —
  jsdom doesn't simulate that enough for the test suite to have caught it).
  `pnpm lint`/`test`/`build` pass on both packages (205 backend + 84 frontend
  tests). Verified live end-to-end against the running dev stack: full
  collection CRUD, add/remove membership from both the popover's existing
  list and the inline "new collection" path, tag-chip-driven filtering
  (alone and combined with search), and confirmed deleting a recipe leaves
  its collections untouched and vice versa. Also had to run a manual
  `pnpm migrate up` against the dev database mid-session — the dev backend
  container doesn't auto-migrate on start, so the new migration wasn't
  applied until then; the same step will be needed on the real deploy.

  **Follow-up same day**, from live user feedback: `CollectionsPage`'s
  header/empty-state didn't match the rest of the app — the create form sat
  left-aligned below a plain title instead of the "title left, primary
  action right" row every other list page uses, and the empty state was a
  single line of text instead of the icon/heading/subtext pattern
  `RecipeListPage` established. Both fixed to match. Separately, the create
  and rename forms (`CollectionsPage`, `RecipeCollectionsEditor`,
  `CollectionDetailPage`) silently no-op on an empty/whitespace name with no
  toast or visual feedback — indistinguishable from "the button doesn't do
  anything" if clicked before typing — so their submit buttons are now
  `disabled` until there's real input, same as the pattern already used
  elsewhere for disabled states. (Also traced a separate red herring while
  investigating: a click-automation tool used for verification was
  intermittently unreliable against a non-composited browser tab and
  produced a few false "the button did nothing" readings of its own — real
  user clicks in an actual browser aren't affected by that.)
- **2026-08-19** — Resolved a 9-finding SonarQube scan (5 files): reduced
  `imageFromUrl.ts`'s `fetchImageFromUrl` cognitive complexity from 21 to
  under 15 by extracting three helper functions; rewrote two
  `ingredientLine.ts` regexes flagged for backtracking risk into
  single-`\d+`-per-pattern helpers composed by hand; fixed two
  `socialVideo.ts` `reject(Object.assign(err, ...))` calls to reject with the
  bare `err` identifier instead. The remaining four findings (`ConfirmDialog`/
  `ImportDialog`'s backdrop-click `onClick` on `<dialog>`) were investigated
  and confirmed a false positive for native `<dialog>` light-dismiss — see
  [decisions.md](decisions.md#2026-08-19-sonarqube-pass-9-findings-across-5-files)
  for why, and why they should be marked won't-fix in SonarQube directly
  rather than worked around in code. No behavior changes; `pnpm lint`/`test`/
  `build` pass on both packages (190 backend + 67 frontend tests, all
  pre-existing).
- **2026-08-19** — Header consolidated into a `UserMenu` dropdown (username
  click → theme toggle, log out, and the running build's short commit hash),
  replacing the separate always-visible username/toggle/logout controls
  (`ThemeToggle.tsx` deleted, folded into `UserMenu`). Version is threaded
  through as a build-time `VITE_APP_VERSION` arg set to the same `github.sha`
  CI already tags images with, so it always matches a real, rollback-able
  image tag — no semver process introduced. Needed a new higher-opacity
  `.glass-menu` variant after the first pass's standard `.glass` panel was
  flagged live as too transparent over the recipe grid behind it. See
  [decisions.md](decisions.md#2026-08-19-header-consolidated-into-a-usermenu-dropdown-app-version-shown-via-build-time-commit-sha)
  and [design-system.md#anchored-menus--popovers](design-system.md#anchored-menus--popovers).
  `pnpm lint`/`test`/`build` pass (67 frontend tests, including new
  `UserMenu` coverage). Verified live against the running dev server, both
  themes, desktop and mobile widths, and a real login → open menu → toggle
  theme → log out round trip.
- **2026-08-19** — Fixed a production white-screen crash reported live:
  `crypto.randomUUID()` (used to key ingredient/step rows in
  `RecipeFormPage.tsx`) is restricted to secure browser contexts and is
  `undefined` on the homelab's plain-HTTP Tailscale origin, even though it
  works fine under `localhost` in dev. Fixed with a `crypto.getRandomValues()`
  fallback (`frontend/src/lib/id.ts`, no secure-context restriction). Audited
  the rest of the frontend for the same class of bug — no other
  secure-context-only API in use; `vite-plugin-pwa`'s service worker
  registration is the one other instance, but it already fails silently
  rather than crashing. See
  [decisions.md](decisions.md#2026-08-19-production-white-screen-fixed-cryptorandomuuid-needs-a-secure-context-fallback).
  `pnpm lint`/`test`/`build` pass (61 frontend tests, including new
  `generateId` coverage).
- **2026-08-13** — Auto-import the source page's photo during URL import
  (deferred from the 2026-08-11 import work). The image URL is now
  discovered during `/import` itself — schema.org `image` for JSON-LD, an
  `og:image`/`twitter:image` meta tag as the shared fallback for the
  incomplete-JSON-LD and Gemini-fallback cases, and `yt-dlp`'s own
  `thumbnail` field for Reels/TikTok (no extra request) — and carried
  alongside the pre-filled recipe through the same router-state handoff.
  Rather than lifting the "recipe must exist before an image can attach to
  it" constraint, a new `POST /recipes/:id/images/from-url` fetches the
  bytes once the user saves and a real id exists; that fetch reuses
  `recipeExtraction.ts`'s SSRF guard and manual redirect re-validation,
  since the URL travels back from the browser in a request body. Best-effort
  from the frontend's point of view — the recipe is already saved by the
  time this runs, so a failure just toasts "Couldn't import the photo — add
  one manually" rather than failing the save. See
  [decisions.md](decisions.md#2026-08-13-recipe-photo-auto-import--post-save-fetch-not-staged-uploads)
  for the full reasoning, including why staged pre-save uploads were
  rejected. `pnpm lint`/`test`/`build` pass (190 backend + 59 frontend
  tests). **Verified live end-to-end** against a real BBC Good Food page
  (confirmed beforehand to have both a JSON-LD `ImageObject` and an
  `og:image`) — network trace confirmed the save → attach → re-fetch
  sequence, with the photo rendering in the edit form. **Not verified live:
  the yt-dlp-thumbnail and Gemini-fallback-og:image paths** — only covered
  by unit tests this session.
- **2026-08-12** — LLM-based recipe import from Instagram Reels/TikTok
  shipped (the remaining half of the original import backlog item; URL
  import shipped 2026-08-11). Same `/import` endpoint and `source_url`
  column, dispatching on hostname before doing anything else: `yt-dlp`
  fetches the video + caption, both go to Gemini in one multimodal call, and
  the result rejoins the same normalization pipeline URL import uses. A live
  side-by-side comparison after hitting the free tier's daily request cap on
  Flash led to using a separate, cheaper model for the video path
  specifically (`gemini-3.5-flash-lite`, 25x the daily quota, no quality
  loss on the one real video tested) — both models are now env-overridable
  rather than hardcoded. See
  [decisions.md](decisions.md#2026-08-12-instagram-reelstiktok-import--yt-dlp--gemini-flash-lite)
  for the full reasoning, including why oEmbed/caption-only extraction was
  ruled out (a real test Reel's caption had ingredients but zero steps —
  only the video had them) and the size/duration caps chosen. `pnpm
  lint`/`test`/`build` pass on both packages. **Verified live end-to-end
  against a real Instagram Reel** (import → pre-filled form, including the
  steps recovered purely from video → save → detail page's source link).
  **Not verified against a real TikTok URL** — same extractor and pipeline,
  but only Instagram was actually exercised; confirm before relying on that
  platform.
- **2026-08-12** — Fixed the Windows frontend dev container issue that had
  been worked around since 2026-08-06. Root cause was a `frontend/Dockerfile.dev`
  bug (`CMD ["pnpm", "dev", "--", "--host"]` — the extra `--` wasn't stripped
  by pnpm's shorthand form, so Vite never actually received `--host` and
  silently bound to loopback only), not the Windows/WSL2 Docker networking
  layer the original investigation suspected. `docker compose up` alone now
  works reliably; the `pnpm --filter frontend dev` workaround is no longer
  needed. See [decisions.md](decisions.md#2026-08-12-windows-frontend-dev-container-issue--actually-root-caused-and-fixed).
- **2026-08-11** — Recipe import from a URL shipped (the first half of the
  LLM-import backlog item; Reels/TikTok stays open above). `POST /import`
  takes a URL and returns an unsaved `RecipeInput` that pre-fills the
  existing create form — the user reviews/corrects it and saves through the
  normal `POST /recipes` path, so there's no second persistence path.
  Extraction is two-stage: schema.org JSON-LD parsed out of the page first
  (free, exact, and what most recipe sites publish), Google Gemini as the
  fallback only when that's missing or too thin. **Gemini specifically
  because it's the only major provider with a real permanent free tier** —
  the app is meant to cost nothing to run; see
  [decisions.md](decisions.md#2026-08-11-recipe-import-from-urls--gemini-free-tier-json-ld-fast-path-cheerio)
  for that comparison, plus the `cheerio` dependency justification (added
  deliberately against the default "no new deps" rule — regex HTML parsing
  fails *silently* as a bad extraction) and what was deferred. Also added the
  nullable `recipes.source_url` column end to end (migration → zod → repo →
  both API type files → an "Imported from …" link on the detail page), built
  now rather than later since the future Reels/TikTok work needs the same
  column. Two follow-up fixes came out of reviewing the first real imports:
  free-text ingredient lines are now split into quantity/unit/name (they were
  landing wholesale in `name`, leaving Qty/Unit empty), and tags are drawn
  from a fixed attribute vocabulary instead of the site's SEO keywords (which
  produced things like the author's name and the dish name) — see the two
  2026-08-11 entries in [decisions.md](decisions.md). Also made the recipe
  form's step/description textareas grow to fit their content
  (`components/AutoGrowTextarea.tsx`); at a fixed height, imported steps were
  clipped mid-sentence. The Gemini fallback is now **verified live** against a
  real key (imported Wikibooks Cookbook pages, which have recipes but no
  JSON-LD): this turned up that the originally-chosen `gemini-2.5-flash` 404s
  for newly-created API keys despite still appearing in the model list — now
  pinned to `gemini-3.6-flash`, with response parsing hardened for reasoning
  models' `thought` parts, and tag output capped/de-duplicated after the model
  proved happy to emit nine technically-true tags. See the two later
  2026-08-11 entries in [decisions.md](decisions.md), and
  [dev-commands.md](dev-commands.md) for how to exercise the LLM path.
  Finally, `/import` now streams NDJSON progress so the import page names the
  stage it's on — measured, a JSON-LD import finishes in ~0.5s while an
  LLM-backed one spends ~7.6s in the model call, and one undifferentiated
  spinner over both left no way to tell a slow import from a stuck one.
- **2026-08-11** — SonarQube pass (10 findings): the production frontend image
  now uses `nginxinc/nginx-unprivileged` so nginx doesn't run as root
  (container port moves 80 → 8080, in `nginx.conf` and
  `docker-compose.prod.yml`); both `Dockerfile.dev`s stopped `COPY . .`-ing
  the repo and copy only workspace manifests, since docker-compose bind-mounts
  the source at runtime anyway — which also stops a source edit invalidating
  the install layer; `ToastProvider`'s context value is memoized; zod's
  deprecated `z.string().url()` replaced with `z.url()`; and
  `ingredientLine.ts`'s quantity patterns are plain regex literals with
  bounded quantifiers instead of `RegExp`-constructed `String.raw` templates.
  Also added `.pnpm-store/` to `.gitignore`/`.dockerignore` — it had appeared
  untracked and would otherwise land in the build context. Verified by
  building and running both images: nginx master and workers all run as uid
  101, and SPA fallback routing, the `manifest+json` MIME type and both cache
  rules still work. The Gemini client is injected via `AppDeps.geminiExtract`, so tests
  never touch the network and the app boots fine without a key — only pages
  that actually need the fallback return 503. `pnpm lint`/`test`/`build` all
  pass (71 backend + 36 frontend tests). Verified live against the real
  backend: imported a BBC Good Food recipe end-to-end (JSON-LD path → form
  pre-filled with title/servings/times/15 ingredients/steps/tags → saved →
  detail page shows the source link), plus the failure paths (invalid URL,
  blocked localhost URL → 400, unreachable host → 502, no-JSON-LD page with
  no API key → 503). **Not verified live: the Gemini fallback itself** — no
  API key was available in this environment, so that path is only covered by
  tests with a fake client. Do one real keyed import against a site without
  JSON-LD before considering it fully proven. Hit one real-world snag worth
  knowing: several large recipe publishers (People Inc — allrecipes,
  seriouseats, simplyrecipes) reject the import fetch outright with a 402
  regardless of User-Agent, so import won't work on those.
- **2026-08-12** — Pre-PR review pass on the import feature: a security
  review plus two independent backend/frontend code reviews. Real fixes, not
  just cleanup — see the 2026-08-12 entry in
  [decisions.md](decisions.md#2026-08-12-post-implementation-review-fixes-backend-securitycorrectness-frontend-correctnessa11y)
  for the reasoning behind each: sanitization was running *after* schema
  validation, so a single near-miss field (an empty string where the model
  was told `null` was fine, "Serves 0") discarded an otherwise-good import
  entirely, silently; the SSRF guard didn't block private IP ranges or the
  cloud metadata address and didn't survive a redirect, now closed with real
  CIDR checks and manual redirect re-validation; the Gemini API key moved out
  of the query string into a header, and quota/outage errors (429/5xx) are
  now distinguished from "the page has no recipe"; `sourceUrl` is restricted
  to http(s) (zod's bare `url()` accepts `javascript:`); and three real
  frontend bugs — a late-resolving import could navigate the user away from
  wherever they'd since gone, saving an imported recipe and hitting Back
  could create a duplicate (React Router was reconciling instead of
  remounting between `/recipes/new` and `/recipes/:id/edit`), and the stream
  reader wasn't released on the (normal) "no recipe found" error path. Also
  moved `AuthProvider`/`ToastProvider` off the pre-React-19
  `<Context.Provider>` form. Verified: full lint/test/build (122 backend + 48
  frontend tests, including new regression tests for every fix above), plus
  live re-verification against the real backend and a real Gemini key —
  confirmed the blocked-host guard now rejects `192.168.1.1` (previously
  fetched), and both the JSON-LD and LLM paths still import correctly
  end-to-end.
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

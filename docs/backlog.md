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
- [ ] Auto translate imported recipes to the user's native language and preferred units of measure.
- [ ] Smart unit conversions and recipe scaling.
- [ ] Notes & ratings on recipes.
- [ ] Nutrition info via an external nutrition database.
- [ ] Active cooking mode (ingredients can be checked of, cooking steps can be checked off, other ideas?).
- [ ] Grocery list generation from planned meals (the weekly meal planner
      this depended on shipped 2026-08-28 — see Completed below).
- [ ] Grocery list integration with Belgian supermarkets (Colruyt, Albert
      Heijn, etc.) — depends on grocery list generation above existing
      first.
- [ ] Native-feeling mobile experience (MVP ships as a responsive PWA; this
      is a further step beyond that).

### Design system follow-ups (Cookbook Editorial, 2026-08-26)

- [ ] Regenerate the raster PWA icon set (`icon-192.png`, `icon-512.png`,
      `icon-maskable-512.png`, `apple-touch-icon.png`) from the updated
      source SVG — `frontend/public/icon.svg` and the PWA manifest's
      `theme_color`/`background_color` were recolored to the new sauce-red/
      paper palette, but the PNG fallbacks (used by iOS home-screen
      installs and platforms without SVG-favicon support) are still the old
      orange and weren't regenerated — that needs an image-export step, not
      just a code edit.

### Follow-ups

- [ ] Public HTTPS cutover, homelab side (2026-09-24): apply the `edge`
      network + `FRONTEND_ORIGINS`/`TRUSTED_PROXIES` on the box, *then* flip
      the `VITE_API_URL` repo variable to `/api`, then add the Caddy route —
      in that order, see [deployment.md](deployment.md#public-https-cutover).
      Afterwards, verify in a real browser on `https://nosh.itsthomassito.com`
      (login persists across reloads, photo upload, a Reel import's
      progress stages appear one by one, PWA installs and updates) — none of
      that could be checked before the domain existed.
- [ ] Once the tailnet origin is retired: switch the session cookie to
      `secure: true` and a `__Host-` name (e.g. `__Host-nosh.sid`, logs
      everyone out once), drop it from `FRONTEND_ORIGINS`, remove the
      backend's host port.
- [ ] Nice-to-have from the cutover handoff: a "Nosh moved to
      https://nosh.itsthomassito.com" banner on the old tailnet origin, for
      existing PWA installs.
- [ ] Nice-to-have: a `Content-Security-Policy` from the frontend's nginx
      (Caddy already sends `nosniff`, `Referrer-Policy`, `X-Robots-Tag` and
      HSTS on every host, so don't duplicate those).
- [ ] Now that the page is a secure context, consider Web Share / Clipboard
      / camera capture for recipe photos.

- [ ] Live-verify the unified library (2026-09-23) in a browser against the
      dev stack — merged without it at the project owner's request. Check:
      Home shows its own recipes; search inside a nested folder is scoped,
      "Search everywhere" widens it; header search from the meal-plan page;
      tag chips open `/?tag=`; New recipe / Import from inside a folder file
      into it; dragging a card onto the Home breadcrumb; `/recipes?q=x`
      redirect; both themes, desktop + phone widths (the header search wraps
      to its own row on phones).

## Completed

- **2026-09-24** — Readiness for public HTTPS at
  `https://nosh.itsthomassito.com`. Came from a homelab-side checklist that
  couldn't see this repo, so every item was audited against the code first.
  - **Topology.** Chose the frontend's nginx proxying `/api` over Caddy's
    `handle_path`, so the first merged build leaves the tailnet setup
    untouched and the cutover doesn't race Watchtower.
  - **Backend.** Added:
    - `FRONTEND_ORIGINS`, a list, with the old singular name as fallback;
    - an exact-IP `TRUSTED_PROXIES`;
    - an `Origin`/`Sec-Fetch-Site` CSRF check on unsafe methods;
    - a cookie with `secure: "auto"`, `SameSite=Lax`, `Path=/` and no
      `Domain`;
    - `ALLOW_SIGNUP`, off by default;
    - hand-written rate limits on login (per IP and per account), signup,
      import and photo-from-URL.
  - **SSRF.** Closed the documented DNS gap with `services/safeFetch.ts`,
    which checks the resolved address inside the socket's own lookup. That
    beats both redirects and rebinding. Also added CGNAT and the other
    reserved ranges, and restricted yt-dlp with `--ies default,-generic`.
  - **Smaller fixes:**
    - magic-byte checks on uploads;
    - no leaked socket errors;
    - JSON 404s and 400s;
    - `NODE_ENV=production`;
    - a PWA `navigateFallbackDenylist` for `/api/`;
    - `sha-<7>` image tags;
    - a PR job that builds both images and runs `nginx -t`.
  - **Verification.** 94 new backend tests and 3 frontend tests. Also a
    29-check Docker end-to-end run of the real images in a copy of the box's
    network layout: a stand-in Caddy at `172.28.255.2`, an intruder
    container, and the old direct `:3101` path. No migrations. Merge and the
    homelab-side steps are still pending; see Follow-ups.

- **2026-09-24** — Magic import model selector and tokens-left view shipped
  as a new **Settings** page (`/settings`, from the user menu), not a picker
  in the import dialog — the owner redirected mid-build to "a magic
  configuration section in the settings menu, don't ask every time." Each
  user saves a preferred Gemini model (`users.import_model`, `NULL` =
  Automatic, i.e. the existing text/video defaults) from an env-configured
  allowlist (`GEMINI_MODELS=id=dailyLimit,…`, validated on write and on
  every import since the id lands in Gemini's URL). "Tokens left" became an
  **estimated requests-left per model** plus tokens used today: Gemini has
  no quota-remaining API, so Nosh counts every request Google answers in a
  new `llm_usage` table (one row per Pacific-time quota day per model —
  global, not per-user, because Google's limits are per project) via an
  `onUsage` hook on the Gemini client. New migration
  `1700000000013_magic-import-settings` (renumbered from `012` after
  merging main, whose unified-library work had taken that slot) — **run
  `pnpm migrate up` on deploy**. See
  [decisions.md](decisions.md#2026-09-24-magic-import-settings).
  `pnpm lint`/`test`/`build` pass on both packages after merging main
  (backend 251 tests, frontend 147). **Verified live** against this worktree's own servers and a
  separate dev database (the parallel `unified-library` worktree's Docker
  stack was left untouched): a saved model choice reached the real Gemini
  endpoint and the request was counted against it; the page was checked in
  both themes at desktop and phone widths. **Not verified with a real API
  key** (none available), so real `usageMetadata` token counts are
  unit-tested only.
- **2026-09-23** — Library unified; the separate "All recipes" page is gone.
  Home (`/`) and every collection (`/collections/:id`) are one folder view:
  sub-collections, then the recipes *directly* inside. Home can now hold
  recipes itself (`recipes.collection_id` nullable, `NULL` = Home), replacing
  the auto-created "Other" collection. A single search box in the header
  searches the current folder and everything beneath it (recursive-CTE
  `within` filter on `GET /recipes`/`/recipes/search`), with a "Search
  everywhere" link and each result captioned with its folder path; from
  non-library pages it searches the whole library. Every folder has New
  recipe / Import buttons that file straight into it (import carries the
  folder through `ImportProvider`). `/recipes` redirects to `/` keeping
  `?q`/`?tag`; `GET /collections/:id/recipes` was removed as unused. Scope
  (Home as a place, direct-contents browsing, folder-scoped search) was
  confirmed with the project owner before building; the migration's "Other"
  rule was revised mid-way after the real dev data showed an "Other" with a
  sub-collection (recipes move to Home, folder deleted only if empty). See
  [decisions.md](decisions.md#2026-09-23-library-unified-recipes-may-live-at-home).
  `pnpm lint`/`test`/`build` pass (backend: 229 tests, run in the dev
  container against Postgres, incl. new `collection`/`within`/move-to-Home
  coverage; frontend: 142 tests, incl. new `LibrarySearch`,
  `collectionTree`, form pre-fill, import-folder handoff and `/recipes`
  redirect coverage). Migration applied to the dev DB and round-tripped
  down/up. **Not verified live in a browser** — tracked above under
  Follow-ups. Done in a worktree (`.claude/worktrees/unified-library`) per
  the owner's standing request.
- **2026-08-28** — Weekly meal planner shipped: a single ongoing per-user
  calendar, not a `meal_plans` entity users create/name/switch between — one
  new table, `meal_plan_entries(user_id, planned_on, recipe_id)` with
  `UNIQUE(user_id, planned_on)`, one recipe per day, Monday-start weeks.
  Scope (one recipe per day, single calendar, Monday start) was confirmed
  directly with the project owner via three questions before any code was
  written, per [CLAUDE.md](../CLAUDE.md)'s rule against building ahead of
  the roadmap. New backend: `GET /meal-plan?start&end` (range-based, not
  `?week=`, so the next roadmap item — grocery list generation — can query
  the same endpoint unchanged), `PUT /meal-plan/:date` (idempotent
  set-or-replace via `ON CONFLICT`), `DELETE /meal-plan/:date`. New
  frontend: `MealPlanPage` (a 7-column week grid, URL-seeded `?week=`,
  prev/next navigation, a today-highlight, a skeleton for the initial load
  per [design-system.md](design-system.md#loading-states)), a new
  `RecipePickerDialog` modal (search-and-pick, following `ConfirmDialog`'s
  native-`<dialog>` conventions — there was no existing recipe-search
  combobox to reuse), and a hand-rolled `lib/week.ts` (no date library was
  or is a dependency, per CLAUDE.md's "no unnecessary dependencies" rule).
  `recipe_id` is `NOT NULL` with `ON DELETE CASCADE`, not a nullable
  `SET NULL` — an entry carries no data beyond "which recipe, which day," so
  a deleted recipe just empties its day rather than leaving an orphaned
  null-recipe row. See
  [decisions.md](decisions.md#2026-08-28-weekly-meal-planner) for the full
  reasoning, including the DATE-serialization gotcha this feature's the
  first to hit (`pg` parses `DATE` at local midnight; naive serialization
  shifts it a day on any host east of UTC — fixed with an explicit
  `planned_on::text` cast in every query) and why `GET` is range-based
  rather than week-based. `pnpm lint`/`test`/`build` pass on both packages
  (backend: 222 tests, including 9 new router tests for the upsert-replace
  path, cross-user isolation, range validation, and the CASCADE-on-delete
  behavior; frontend: 121 tests, including 15 new for `lib/week.ts` covering
  DST-transition weeks and local-vs-UTC date construction, plus new
  `MealPlanPage`/`RecipePickerDialog` coverage). One pre-existing, unrelated
  frontend test (`RecipeListPage`'s URL-search-sync test) was already
  failing before this work started, confirmed by re-running it against an
  unmodified checkout — left untouched, out of scope for this change.
  **Verified live** end-to-end against the running dev stack with seeded
  demo data, both themes, desktop and mobile widths: assigning a recipe to a
  day, replacing it with a different one on the same day (the UPSERT
  branch, not a fresh insert), clearing a day, prev/next navigation with the
  URL's `?week=` round-tripping (a direct reload at a `?week=…` URL restores
  that week, not today's), the today-highlight landing on the correct day,
  a recipe assigned specifically to a Monday rendering under the Monday
  column (the concrete check that would catch a day-shift regression), and
  deleting a recipe with a planned entry emptying its day on the meal-plan
  page. Partway through this session moved into a dedicated git worktree
  (`.claude/worktrees/weekly-meal-planner`, branch
  `feat/weekly-meal-planner`) at the project owner's request; the dev
  Docker stack was stopped and restarted from the worktree directory,
  reusing the same named Postgres/uploads volumes, so live verification ran
  against the worktree's own files without losing seeded demo data.
- **2026-08-28** — Collections redesigned from a flat, optional,
  many-to-many grouping into a nested, mandatory hierarchy, and made the
  app's home page. Collections can now contain sub-collections (unlimited
  depth, `collections.parent_id`); every recipe belongs to exactly one
  collection, always (`recipes.collection_id NOT NULL`, replacing the
  `recipe_collections` join table), defaulting to an auto-created "Other"
  collection when none is chosen. The collections tree is now `/`; the
  recipe list moved to `/recipes`, reachable via a new "All recipes" nav
  link. Deleting a collection now cascades destructively to its
  sub-collections and their recipes (including uploaded photos, cleaned up
  from disk) — a real behavior change from the old "delete never touches
  recipes" model, chosen directly by the project owner. Reparenting an
  existing collection is supported (guarded by a cycle check), not deferred.
  `RecipeCollectionsEditor` (chips + multi-add popover) was replaced by
  `RecipeCollectionPicker` (single-select "move to…", since a recipe can no
  longer have zero or multiple collections); `CollectionsPage` and
  `CollectionDetailPage` were collapsed into one component that renders both
  home (`/`) and any collection's folder view (`/collections/:id`). See
  [decisions.md](decisions.md#2026-08-28-collections-redesigned-as-a-nested-mandatory-hierarchy-becomes-the-home-page)
  for the full reasoning, including the two-partial-unique-indexes fix for a
  Postgres NULL-uniqueness gotcha and the migration's acknowledged
  data-loss rule for recipes that were previously in more than one
  collection. `pnpm lint`/`test`/`build` pass on both packages (backend:
  213 tests, including new coverage for nesting, cycle rejection, cascade
  delete, and default-collection fallback; frontend: 87 tests). New
  migration (`1700000000010_nest-collections`) applied against the dev
  database via `pnpm migrate up`. **Verified live** via a headless
  Playwright script against the real running dev stack + seeded demo data:
  home page, nested collection creation, moving a recipe via the picker,
  the "All recipes" page staying collection-agnostic, and a cascading
  delete with nested contents — which caught a real bug (home page showing
  a stale, already-deleted root-level collection because `confirmDelete`
  never reloaded `allCollections`, only `getCollectionContents`), fixed,
  and re-verified. See
  [decisions.md](decisions.md#2026-08-28-collections-redesigned-as-a-nested-mandatory-hierarchy-becomes-the-home-page)
  for the full story and the new regression test it prompted.
- **2026-08-26 (second follow-up)** — Renamed the `citrus-*`/`teal-*` design
  tokens to `sauce-*`/`sage-*` (and every class referencing them) now that
  the color/structure change they belong to has shipped and been verified
  stable — previously deferred as "a separate, low-value refactor on its
  own merits," requested directly once the bigger, riskier work was done.
  Also fixed two pre-existing bugs of the same kind already caught once in
  the original pass: `TagChip`'s default-variant hover and `TagInput`'s
  remove-tag button both referenced shades that were never defined in the
  theme (`teal-100`/`-600`/`-800`), silently falling back to Tailwind's own
  built-in `teal` swatch. Added a real `sage-100` token to close the first
  gap (the primary/sauce family already had a `100` tint, the secondary one
  didn't); the second was aligned with the remove/× convention already used
  elsewhere in the app (hover to `danger-500`) instead of inventing a
  fourth one-off shade. See
  [decisions.md](decisions.md#2026-08-26-citrus-and-teal-tokens-renamed-to-sauce-and-sage)
  for the full reasoning, including why "Citrus Pop" (the old direction's
  *name*, in historical doc entries) was deliberately left alone while its
  *tokens* were renamed. `pnpm lint`/`test`/`build` pass (89 frontend
  tests). **Verified live** — since only names changed, not values, output
  should be pixel-identical to the prior pass; confirmed by re-capturing
  the recipe list and detail pages.
- **2026-08-26 (same-day follow-up)** — Finished rolling Cookbook Editorial
  out to the rest of the app: `AuthLayout`'s hardcoded Citrus Pop
  orange→pink gradient background replaced with the paper page background
  used everywhere else (its `.glass` card and title were already
  token-driven, just needed the gradient itself gone and the title
  italicized to match); the header's two pill-shaped nav controls
  (`Layout`'s "Collections" link, `UserMenu`'s trigger) squared off to
  `radius-md` along with everything else that dropped pill shapes; page
  titles on `CollectionsPage`, `CollectionDetailPage`, and `RecipeFormPage`
  restyled to the same italic-Fraunces masthead treatment as the recipe
  list/detail pages (`CollectionsPage`/`CollectionDetailPage` also gained a
  hairline rule and, on the list, a mono item-count caption); and
  `RecipeFormSkeleton`'s loading bars had their leftover `rounded-full`
  dropped to match the sharper skeleton style already applied elsewhere.
  Also caught two stray Citrus Pop remnants a hex-value grep turned up that
  weren't part of the original scope: the PWA manifest's `theme_color`/
  `background_color` (`vite.config.ts`) and the SVG app icon/favicon
  (`frontend/public/icon.svg`) were still the old orange — both recolored;
  the raster PNG icon set generated from that SVG wasn't (tracked above,
  needs an image-export step). The recipe form's own section
  cards/inputs/buttons needed no changes — they already fully inherited the
  new look via the shared `sectionCardClass`/`inputClass`/`buttonClass`
  utilities from the original pass. See
  [decisions.md](decisions.md#2026-08-26-cookbook-editorial-rolled-out-to-the-rest-of-the-app)
  for the reasoning. `pnpm lint`/`test`/`build` pass (89 frontend tests).
  **Verified live**, both themes: login/signup (confirmed the gradient is
  gone and the entrance-animated card still renders correctly — a
  screenshot taken mid-animation looked washed out on first pass, purely a
  script-timing artifact, resolved by waiting for `animate-pop-in` to
  settle before capturing), Collections, a collection's detail page, and
  the new-recipe form.
- **2026-08-26** — New design direction, "Cookbook Editorial", replaces
  "Citrus Pop": paper/ink palette with a sauce-red primary and sage
  secondary, Fraunces (serif, italic) + IBM Plex Mono (new, printed-label
  metadata) alongside unchanged Inter, sharp/hairline shapes instead of
  very-rounded, glass/blur and the gradient dropped app-wide. Token layer
  (`index.css`, `styles.ts`) swapped globally per the project owner's
  direction, so every page picked up the new colors/fonts/shape
  immediately; structural rework (index-style ingredient list, large serif
  step numerals with a first-step drop cap, a masthead detail layout
  replacing the old photo-overlay panel, a new `TagChip` `editorial`
  variant) was scoped to the recipe list and detail pages only, per
  explicit instruction. See
  [decisions.md](decisions.md#2026-08-26-design-direction-replaced-cookbook-editorial-supersedes-citrus-pop)
  for the full reasoning and [design-system.md](design-system.md) for the
  updated Color/Typography/Shape/Elevation/Cards/Tags/Detail-page-layout
  sections. `pnpm lint`/`test`/`build` all pass (87 frontend tests, all
  pre-existing). **Verified live** against the real backend + seeded demo
  data via a headless-browser script (both themes, a no-photo recipe, the
  delete confirmation dialog, and the login screen — the last two to check
  the global glass/token change didn't break pages this pass didn't edit
  directly). Follow-up structural work on the rest of the app is tracked
  above under "Design system follow-ups."
- **2026-08-26** — Web Interface Guidelines review of `frontend/src` (accessibility/forms/state) fixed: every form input now carries a real `name` (and `autoComplete`, a live token where one applies, otherwise `"off"`), including the recipe form's dynamically-repeated ingredient/step rows, scoped to each row's stable id rather than its index; every previously placeholder-only field (ingredient Qty/Unit/Name, the collection create/rename inputs) got a real `sr-only` `<label>`; login/signup/recipe-form submit errors now move focus to their banner the moment they're set (`AuthLayout`, `RecipeFormPage`) instead of appearing silently; deleting a recipe photo now goes through `ConfirmDialog` like every other delete in the app, instead of firing on a single click; the recipe list's search query is now mirrored into the URL (`?q=…`) alongside the tag filter that was already there, so a search is shareable/refresh-safe; and the "Grandma's Sunday Ragù" placeholder's straight apostrophe was fixed to match the rest of the app's curly-quote copy (design-system.md's own copy of that example string had the same typo, fixed too). See [design-system.md#forms](design-system.md#forms) for the two new form conventions (`name`/label requirements, focus-follows-the-error) this pass established. **Deliberately not changed**, both reviewed and rejected as fixes: `prefers-reduced-motion` support (the app's [existing documented decision](design-system.md#reduced-motion--explicit-trade-off) is to ignore it) and list virtualization (no list in the app is anywhere near the guideline's 50-item threshold at personal-recipe-collection scale, and it would mean a new dependency for no real benefit — see [../CLAUDE.md](../CLAUDE.md)'s "don't introduce unnecessary dependencies"). `pnpm lint`/`test` pass on the frontend package, including new coverage for the photo-delete confirmation and the URL-synced search query. **Not verified live** — this was a code-level review/fix pass, not exercised against the running dev server.
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

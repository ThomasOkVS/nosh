# nosh v2 spec

The behaviour of the current nosh app, extracted into one Markdown file per
area in the fixed format of [`_template.md`](_template.md). It feeds the
restart; see [the restart design](../2026-11-24-nosh-restart-design.md) for
the stack, scope and project order.

## Areas

| File | Prefix | Purpose | Status |
|---|---|---|---|
| `auth.md` | AUTH | Signup, login, sessions, route protection, app shell, account entries (username, log out, version) | reviewed |
| `recipes.md` | REC | Recipe CRUD, ingredients, steps, tags, images, detail and form pages | reviewed |
| `collections.md` | COL | Nested collections, breadcrumbs, moving and dragging recipes | reviewed |
| `search.md` | SRCH | Full-text library search | reviewed |
| `units.md` | UNIT | Scaling, unit conversion, recipe language, ingredient parsing, preferences | reviewed |
| `import.md` | IMP | Magic import from URLs and social video, import jobs, LLM use | reviewed |
| `settings.md` | SET | Settings page, LLM model choice, usage estimate, recipe preferences | reviewed |
| `pwa-push.md` | PWA | Installable PWA, service worker, light/dark appearance, web push notifications | reviewed |
| `security.md` | SEC | Origin check, rate limiting, error handling, SSRF guard, env config | reviewed |

"Reviewed" means the consistency pass is done and the owner has answered every
question (below). The spec still waits for the owner's approval (design §8 gate).

## Owner decisions (2026-11-24)

The owner answered every question with "Accept all defaults". Each criterion
that a decision changed carries a `Decision: owner 2026-11-24, index Q<n>`
line naming what v1 did. Each area's Rationale lists its decisions.

1. Login accepts any stored non-empty username; the format rules apply to sign-up only. AUTH-10, AUTH-23.
2. Usernames are case-insensitive for uniqueness and login; the importer stops on a case collision. AUTH-06, AUTH-07, AUTH-23.
3. Imports stay stored converted to the owner's units (lossy, as today). No change (UNIT-35).
4. Every photo is migrated and kept; the UI shows one cover (v1's first photo), and a new photo becomes the cover. Replacing the cover asks first, then the new photo becomes the cover and the old one is deleted; the swap is never blocked by the 20-photo cap; other v1 photos stay stored but are never shown or promoted, so removing the cover leaves no photo. Applier choice, owner to confirm: setting a cover on a recipe with none is not blocked by the cap either. REC-14, REC-15, REC-17, REC-18, REC-21, REC-33, REC-34, REC-39.
5. Tags are case-insensitive, stored lower-case and merged on migration. REC-07, REC-10, REC-35, SRCH-21.
6. Per-user caps stay; import starts are also capped at 30 per client IP per hour. SEC-16, SEC-59, IMP-06.
7. Production refuses to start without a session secret. SEC-57.
8. Every response carries `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`; CSP stays in the backlog. SEC-60 (new).
9. The Settings screen gets an Account section (username, "Log out", version at the bottom) and a Notifications toggle; the "Notify me" prompt stays in the import screen; the dark/light override is dropped; search stays on the library screen. AUTH-21, SET-30 (new), PWA-28 (AUTH-22, SRCH-05, SET-28 stay struck).
10. Deleting a folder deletes everything inside it, with the count warning, as today. No change (COL-15, COL-16).
11. Drag and drop stays for desktop; recipe cards in the folder view get a move action that works on touch. COL-25 (new).
12. Caps: title 200 characters, collection name 100, 100 ingredients, 100 steps, 30 tags, 20 photos per recipe; the tag field stops at 30; an imported draft over a cap opens in the form, which refuses to save until it is within (applier choice). REC-03, REC-14, REC-15, REC-28, REC-35, COL-09, IMP-23.
13. HEIC/HEIF photos are accepted on upload and converted to JPEG. REC-14, REC-33, SEC-25.
14. Search matching stays as today; accents and partial words go to the backlog. No change (SRCH-16, SRCH-17).
15. A duplicate sibling folder name gives 409 "A collection with that name already exists here", shown in the form. COL-10.
16. The create form takes a photo, and saving lands on the recipe page; a photo chosen on the form beats the imported one, which is shown as the form's preview (preview: applier choice, owner to confirm). REC-30, REC-33, REC-36, IMP-45.
17. A prep or cook time of 0 is refused (form and API); a stored 0 is carried over as none; import clean-up turns a 0 into none. REC-03, REC-28, REC-29, IMP-21.
18. Photo upload errors show the server's reason. REC-33.
19. Sign-up asks for username and password only; email stays an optional stored field for imported accounts. AUTH-01, AUTH-04 (struck), AUTH-06, AUTH-07, AUTH-20, AUTH-23.
20. After login the owner returns to the full path, query and hash. AUTH-16.
21. Every AI rejection shows one plain import error message. IMP-24.
22. Only the newest finished import is announced on launch, as today. No change (IMP-43).
23. One model picker with Automatic, as today. No change.
24. New icons in the P4 style at cutover. PWA-02, PWA-03.
25. "tot" counts as a range word in ingredient lines. UNIT-41.
26. Chalk paper is the theme and background colour, the same in the manifest and the page head. PWA-04.
27. The session lasts a fixed week, as today. No change (AUTH-12).
28. The AI usage estimate stays on Settings, shared across users. No change (SET-08 to SET-13).
29. Notification wording and the failed-import target stay as today. No change (PWA-20, PWA-21).
30. The language setting does not translate stored recipes on display, and a scale is not remembered. No change (UNIT-19, UNIT-30).
31. Rename and move stay one form; "Library" for the screen title and nav, "Home" for crumbs, selectors and captions. No change.
32. Equally ranked search results are ordered newest first. SRCH-18.
33. A running import resumes after a restart if the job queue makes it free, otherwise it fails with the "interrupted" message; the same URL may be imported twice. IMP-01, IMP-36.
34. The yt-dlp guard stays inside the app; the login limit stays 20 per IP per 15 minutes. No behaviour change (SEC-17, SEC-43 to SEC-48).
35. Duplicating a recipe is out of scope for the first release. No change.

Group E notes, no change: import from pasted text, a photo or a screenshot
stays in the backlog (design §2); Dutch word forms in search stay in the
backlog (design §2, §5); who sends the "import done" notification is a job
queue detail (PWA-20 to PWA-23 hold either way); the builder checks how Caddy
handles `X-Forwarded-For` when the skeleton is deployed (SEC-13).

## Owner verdicts (2026-11-24)

The Features rows that were left to the owner, with the verdict now in each
area file.

| Area | Feature | Verdict | Question |
|---|---|---|---|
| AUTH | Email address on the account | keep (optional stored field; not asked on sign-up) | 19 |
| AUTH | Case-sensitive usernames | drop (case-insensitive) | 2 |
| REC | Image gallery (multiple images per recipe) | drop (all photos migrated; one cover, replaced after a confirmation; other v1 photos hidden) | 4 |
| REC | Tag names normalised to one case | keep (lower-case on save, merged on migration) | 5 |
| REC | HEIC/HEIF photos | keep (accepted, converted to JPEG) | 13 |
| COL | Delete collection deletes everything inside it | keep (with the count warning) | 10 |
| COL | Drag a recipe card onto a folder or crumb | keep (desktop; touch move from the folder view, COL-25) | 11 |
| SRCH | Accent-insensitive and partial-word matching | drop (backlog, with Dutch-aware search) | 14 |
| UNIT | Convert-and-store on import (lossy) | keep | 3 |
| IMP | Cap of 30 import starts per hour per user | keep (plus 30 per client IP, SEC-59) | 6 |
| IMP | Only the newest pending import is restored on launch | keep | 22 |
| IMP | Raw AI provider wording in some failure messages | drop (one plain message) | 21 |
| SET | Separate text-model and video-model pickers | drop (one picker) | 23 |
| PWA | Icons | keep (new P4-style icons) | 24 |
| PWA | Theme and background colour from the new palette | keep (chalk paper) | 26 |
| SEC | Session secret required in production | keep (SEC-57) | 7 |
| SEC | Basic response-hardening headers | keep (SEC-60) | 8 |

## Shared behaviours

Behaviours that more than one area describes. The agreed rule is the one that
matches today's code (or the decided design, where the design changes it).
The consistency pass fixed the losing side where two areas disagreed.

| Behaviour | Areas | Agreed rule |
|---|---|---|
| Recipes at Home | COL, SRCH, REC | COL-03 is the single rule: a recipe is at Home exactly when it has no collection; browsing a folder shows only its direct contents, newest first; a search or tag filter covers the folder and everything below it (at Home, the whole library). REC-10, REC-11, SRCH-07, SRCH-08, SRCH-25 and SRCH-26 apply it; editing never moves a recipe (REC-12, COL-17). |
| Tag vocabulary | IMP, REC, SRCH | Imports choose tags only from the fixed English vocabulary, lower-case, at most 5 (IMP-10, IMP-22). Tags typed by hand are free-form but stored trimmed and lower-cased, and a duplicate in any letter case is ignored (REC-07, REC-35); the tag filter ignores letter case (REC-10, SRCH-21). Both kinds share one tag table; v1 tags that differ only in case are merged on migration (owner, Q5). |
| Translate and convert: on import versus on display | IMP, UNIT, SET | On import: extract and tag, translate (structured-data path only, when a recipe language is set and the recipe is not already in it), convert units last, and store the converted draft (IMP-25, UNIT-35); the settings in force when the import starts are used (IMP-07, SET-29). On display: every recipe is converted to the current unit preferences on every view and never written back; the recipe language only picks the label of a unit that conversion introduces (UNIT-31, UNIT-19). The preferences themselves are SET-21 to SET-26 (UNIT-33 and UNIT-34 restate the API). Fixed: IMP-30 now says the label follows the recipe-language setting, as UNIT-19 and the code do, not "a Dutch recipe". |
| Image fetch after import | IMP, REC, SEC | The draft carries a photo address (IMP-16, IMP-17), shown as the form's photo preview (REC-36, IMP-45); after the owner saves the form, the photo is attached by a separate best-effort request (REC-18, REC-36, IMP-45); a photo the owner chose on the form, or removing the preview, takes precedence (REC-33, REC-36, IMP-45); a failure leaves the recipe saved and shows "Couldn't import the photo — add one manually". The fetch is SSRF-guarded with re-checked redirects (SEC-31 to SEC-39), bounded to 10 s and 5 MB (SEC-41), and limited to 60 per user per hour (SEC-22). Fixed: SEC-25 said a fetched photo with the wrong bytes gets 400; the code answers 422, as REC-19 says. |
| Push after import | IMP, PWA | Every subscribed device is notified when a job ends in done or error, never when cancelled (IMP-37, PWA-20, PWA-21): "Recipe ready" opens the review form, "Import failed" opens the library, which restores the failed job. Endpoint allowlist and cleanup are PWA-15 to PWA-23 (and SEC-49, SEC-50). A notification failure never changes the import's result. |
| Push "notify me" toggle | PWA, SET, AUTH, IMP | PWA owns the toggle and its states (PWA-26 to PWA-30); the import screen's opt-in is IMP-44 and PWA-28. Outside the import screen it lives on the Settings screen (SET-30; owner, Q9). |
| User menu entries and app navigation | AUTH, PWA, SET, SRCH, design §7 | Design §7 replaces the header (logo, search box, user menu) with a bottom nav pill (Library + "+") and a settings icon top-right. Home and Settings are one step away wherever the nav shows (AUTH-24). The Settings screen holds an Account section with the username, "Log out" and the version at the bottom, and the Notifications toggle (AUTH-21, SET-30; owner, Q9). Search is on the library screen only (SRCH-01). Dropped: the dropdown itself (AUTH-22 struck), search from every page (SRCH-05 struck) and the manual dark/light override (PWA-32: follows the device). |
| Per-user model choice and usage | SET, IMP | The model is a per-user saved choice from a server allowlist, Automatic by default; a saved model that left the list counts as Automatic (SET-02 to SET-07, IMP-07). Every AI request that reached the provider is counted per model, shared by all users, per Pacific day, and counting never fails an import (SET-08 to SET-10, IMP-46). No disagreement found. |
| Rate limits | SEC, AUTH, IMP | SEC-16 holds the one table: login 20 per IP per 15 min, login failures 10 per account per 15 min, signup 5 per IP per hour, import starts 30 per user per hour and 30 per client IP per hour (SEC-59; owner, Q6), photo from URL 60 per user per hour; fixed windows, 429 with `Retry-After`. AUTH-09 and IMP-06 refer to it; an invalid import start still counts (SEC-21). |
| Sign-up switch | AUTH, SEC | Off unless the setting is exactly `true`; when off, the API answers 403 "Sign-ups are disabled on this server" and creates nothing (AUTH-02, SEC-15, SEC-58). No disagreement found. |
| Session cookie and fresh session | AUTH, SEC | `__Host-` prefix, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, one week, never issued over plain HTTP; a new session id on login and sign-up (AUTH-11, AUTH-12, SEC-07 to SEC-12). SEC owns the detail. No disagreement found. |
| Failed-login delay and enumeration | AUTH, SEC | One 401 "Invalid username or password" for both failures, about a second's delay, equal work for unknown usernames (AUTH-09, SEC-19). No disagreement found. |
| URL guard on import | IMP, SEC | Blocked literals answer 400 "This URL cannot be imported" before a job exists (IMP-03, SEC-34, SEC-35); a name that resolves inward fails the job with the same message and status 400 (IMP-03, SEC-36); every redirect hop is re-checked (IMP-15, SEC-39); yt-dlp goes through the same guard and fails closed with 503 (IMP-19, SEC-43, SEC-48). Fixed: SEC-48 now cites the yt-dlp guard tests that IMP lists under Tests not carried. |
| Photo storage and serving | REC, SEC | Photos are checked by content, stored under random names, and served only through an owner-checked route (REC-14, REC-16, SEC-24, SEC-25); deleting a recipe or a folder removes the files too (REC-13, COL-15). A recipe shows one cover; a new photo replaces it as one step after a confirmation, and hidden v1 photos are never shown or promoted (REC-15, REC-33; owner, Q4). |
| Theme colour | PWA, style log | Chalk paper from the P4 palette is the theme and background colour, the same in the manifest and the page head (PWA-04; owner, Q26). |
| Length limits | REC, COL | Recipe title at most 200 characters, at most 100 ingredients, 100 steps, 30 tags and 20 photos per recipe (REC-03, REC-14, REC-15, REC-28, REC-35); collection name at most 100 characters (COL-09). Replacing or setting the cover is never refused by the photo cap (REC-15). An imported draft over a cap is not a failed import; the form refuses to save it until it is within (IMP-23, REC-28). Owner, Q12. |

## Set aside

Paths and ADR headings claimed by no area, each with a reason.

- `backend/src/routes/mealPlan.ts` — planner dropped (design §5)
- `backend/src/routes/mealPlan.test.ts` — planner dropped (design §5)
- `backend/src/validation/mealPlan.ts` — planner dropped (design §5)
- `backend/src/repositories/mealPlan.ts` — planner dropped (design §5)
- `backend/migrations/1700000000011_create-meal-plan-entries.js` — planner dropped (design §5)
- `frontend/src/api/mealPlan.ts` — planner dropped (design §5)
- `frontend/src/pages/MealPlanPage.tsx` — planner dropped (design §5)
- `frontend/src/pages/MealPlanPage.test.tsx` — planner dropped (design §5)
- `frontend/src/components/RecipePickerDialog.tsx` — planner dropped (design §5)
- `frontend/src/components/RecipePickerDialog.test.tsx` — planner dropped (design §5)
- `frontend/src/lib/week.ts` — planner dropped (design §5)
- `frontend/src/lib/week.test.ts` — planner dropped (design §5)
- ADR: 2026-08-28: Weekly meal planner — single ongoing calendar, date-keyed entries, CASCADE on recipe delete — planner dropped (design §5)
- `backend/src/db/pool.ts` — plumbing: database connection setup; no user-visible behaviour
- `backend/src/db/transaction.ts` — plumbing: transaction helper; the all-or-nothing effects it gives are stated in the criteria that need them (for example COL-15, REC-12)
- `backend/src/db/seed.ts` — dev-only demo data; dropped (SEC Features, "Demo-data seeding flag")
- `backend/src/index.ts` — plumbing: process start-up; the boot-time checks are SEC-51 to SEC-58
- `backend/src/test/*` — test helpers, no behaviour of their own
- `backend/src/types/express-session.d.ts` — type declaration, no behaviour
- `frontend/src/api/client.ts` — plumbing: request helper; error shapes are SEC-26 to SEC-29 and each area's error criteria
- `frontend/src/api/types.ts` — type declarations, no behaviour
- `frontend/src/hooks/useAsync.ts` — plumbing: loading and error state helper; loading and error states are criteria per screen (REC-25, COL-24, SET-27)
- `frontend/src/toast/*` — the generic transient-message mechanism (stacked, dismissable, auto-hiding after a few seconds, with an optional action button). Every message users rely on is a criterion in the area that raises it: COL-08, COL-12, COL-16, COL-18, COL-20, REC-24, REC-33, REC-34, REC-36, SET-17, SET-26, IMP-41, IMP-42. The new UI's notification component (design §7) decides timing and look.
- `frontend/src/styles.ts` — old design system (Cookbook Editorial), superseded by the restart design §7
- `frontend/src/index.css` — old design system, superseded by the restart design §7
- `frontend/src/vite-env.d.ts` — type declaration, no behaviour
- `frontend/src/test/*` — test helpers, no behaviour of their own
- ADR: 2026-08-05: Tech stack — React/Tailwind + Node.js/TypeScript + PostgreSQL — superseded by the restart design
- ADR: 2026-08-05: MVP scope is manual CRUD only — superseded by the restart design
- ADR: 2026-08-05: Deployment target and CD mechanism — superseded by the restart design
- ADR: 2026-08-05: Backups deprioritized for v1 — superseded by the restart design
- ADR: 2026-08-06: Project setup tooling choices — superseded by the restart design
- ADR: 2026-08-06: Demo data seed script, dev-only — superseded by the restart design
- ADR: 2026-08-06: Frontend dev container unreliable on Windows — run frontend outside Docker locally — superseded by the restart design
- ADR: 2026-08-08: Windows frontend dev container issue reconfirmed, root cause still WSL2/Docker Desktop networking — superseded by the restart design
- ADR: 2026-08-06: Design system defined — "Citrus Pop", glassy/rounded, motion-forward — superseded by the restart design
- ADR: 2026-08-06: Critical design review — token layer wasn't enough, structure still read as CRUD — superseded by the restart design
- ADR: 2026-08-06: SonarQube cleanup — deprecated icon/type imports, Dockerfile COPY finding — superseded by the restart design
- ADR: 2026-08-12: Windows frontend dev container issue — actually root-caused and fixed — superseded by the restart design
- ADR: 2026-08-12: Neither dev server was live-reloading on Windows — polling fixes both — superseded by the restart design
- ADR: 2026-08-13: Frontend/backend dev container crash-loop on pnpm's deps-status check — fixed via `pnpm exec`, not the `.npmrc` route — superseded by the restart design
- ADR: 2026-08-19: SonarQube pass — 9 findings across 5 files — superseded by the restart design
- ADR: 2026-08-26: Design direction replaced — "Cookbook Editorial" supersedes "Citrus Pop" — superseded by the restart design
- ADR: 2026-08-26: Cookbook Editorial rolled out to the rest of the app — superseded by the restart design
- ADR: 2026-08-26: citrus and teal tokens renamed to sauce and sage — superseded by the restart design

## How to check

`node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`

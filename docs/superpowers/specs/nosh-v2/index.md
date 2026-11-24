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

"Reviewed" means the consistency and coverage pass is done. The spec still
waits for the owner's answers below and the owner's approval (design §8 gate).

## Open questions for the owner

Most important first. Each item has a default; "accept all defaults except
N, M" is a complete answer. Links go to the area question with the full
context.

### A. Affects the data import and cutover

1. **Old usernames with a dot.** Accounts that had no username were backfilled as `john.doe_3`, and login refuses dots with a 400, so such an account would be locked out after cutover. Does yours look like that? Default: login accepts any stored username; the format rules apply to sign-up only. [AUTH Q1](auth.md#open-questions-for-the-owner)
2. **Case-insensitive usernames.** `Alice` and `alice` are two accounts today. Default: case-insensitive for uniqueness and login; the importer checks for collisions first. [AUTH Q2](auth.md#open-questions-for-the-owner)
3. **Lossy unit conversion on import.** Imports are stored already converted to your units; the source amounts are not kept. Default: keep as today; keeping the source line text is a later option. [UNIT Q1](units.md#open-questions-for-the-owner)
4. **Several photos per recipe.** Recipes can hold several photos, but the UI only uses the first. Default: migrate every photo, ship one replaceable cover photo, revisit a gallery later. [REC Q1](recipes.md#open-questions-for-the-owner)
5. **Tag case.** "Soup" and "soup" are two tags today, and the tag filter matches exact names. Default: tags are case-insensitive; lower-case on save and merge on migration. [REC Q2](recipes.md#open-questions-for-the-owner), [SRCH Q3](search.md#open-questions-for-the-owner)

### B. Security and limits

6. **Rate-limit key for import and photo-from-URL.** Today these are capped per logged-in user (30 imports, 60 photo fetches an hour); design §9 says import is limited per client IP. Default: keep the per-user caps and add the per-IP import limit from design §9. [SEC Q1](security.md#open-questions-for-the-owner), [IMP Q2](import.md#open-questions-for-the-owner)
7. **Session secret in production.** Today a built-in development secret is used if none is set. Default: refuse to start in production without one (SEC-57). [SEC Q2](security.md#open-questions-for-the-owner)
8. **Response-hardening headers.** Default: add `X-Content-Type-Options: nosniff` and `Referrer-Policy` now; CSP stays in the backlog. [SEC Q4](security.md#open-questions-for-the-owner)

### C. Behaviour changes or new placement

9. **Where the user menu's entries go.** Design §7 removes the header user menu, which holds your username, "Log out", the app version, the notifications toggle and a dark/light override. Default: an Account section on the Settings screen (username, "Log out", version at the bottom) and a Notifications toggle there too; keep the "Notify me" prompt in the import screen; drop the dark/light override because dark mode follows the device (design §7). [PWA Q3](pwa-push.md#open-questions-for-the-owner), [AUTH Q6](auth.md#open-questions-for-the-owner), [SET Q3](settings.md#open-questions-for-the-owner)
10. **Deleting a folder deletes everything inside it.** Default: keep, with the count warning. [COL Q1](collections.md#open-questions-for-the-owner)
11. **Drag and drop on iPhone.** Dragging recipes onto folders works with a mouse only. Default: keep it for desktop and make sure the move control is reachable from the folder view on touch. [COL Q3](collections.md#open-questions-for-the-owner)
12. **Length and count limits.** Nothing has a cap today. Default: title 200 characters, collection name 100, 100 ingredients, 100 steps, 30 tags and 20 photos per recipe. [REC Q6](recipes.md#open-questions-for-the-owner), [COL Q4](collections.md#open-questions-for-the-owner)
13. **iPhone photos (HEIC).** Rejected today. Default: accept them and convert to JPEG on upload. [REC Q3](recipes.md#open-questions-for-the-owner)
14. **Accents and half-typed words in search.** Today "creme" does not find "crème" and "choc" does not find "chocolate". Default: keep today's matching for the first release and put both in the backlog next to Dutch-aware search (design §2, §6). [SRCH Q2](search.md#open-questions-for-the-owner)
15. **Duplicate folder name under the same parent.** Gives a generic 500 today. Default: 409 with "A collection with that name already exists here", shown in the form. [COL Q2](collections.md#open-questions-for-the-owner)
16. **After saving a new recipe.** You land on its edit form, to add photos. Default: the create form takes a photo directly and you land on the recipe page. [REC Q4](recipes.md#open-questions-for-the-owner)
17. **Zero prep or cook time.** It can be saved but is never shown. Default: refuse 0 in the form. [REC Q5](recipes.md#open-questions-for-the-owner)
18. **Photo upload errors.** Every failure says "Failed to upload image". Default: show the server's reason (wrong type, too large). [REC Q7](recipes.md#open-questions-for-the-owner)
19. **Email on sign-up.** Stored and unique, never used. Default: keep it as a stored field for imported accounts; the new sign-up form asks for username and password only. [AUTH Q3](auth.md#open-questions-for-the-owner)
20. **Return to the page you asked for after login.** Only the path survives today. Default: keep the full path, query and hash. [AUTH Q5](auth.md#open-questions-for-the-owner)
21. **AI provider wording in import errors** ("Gemini returned 400"). Default: replace it with one plain message. [IMP Q4](import.md#open-questions-for-the-owner)
22. **Imports that finished while the app was closed.** Only the newest is announced on launch. Default: keep. [IMP Q5](import.md#open-questions-for-the-owner)
23. **One model picker or two** (web pages and videos). Default: one picker with Automatic. [SET Q2](settings.md#open-questions-for-the-owner)
24. **App icons.** Today's icons are old-brand art. Default: new icons in the P4 style at cutover (an installed iPhone app only refreshes its icon on reinstall). [PWA Q2](pwa-push.md#open-questions-for-the-owner)
25. **Dutch range word in ingredient lines.** "2 tot 3 el" is not split as a range. Default: accept "tot" like "to". [UNIT Q2](units.md#open-questions-for-the-owner)

### D. Confirm today's behaviour (default: keep as it is)

26. **Session length:** a fixed week from login. Default: keep. [AUTH Q4](auth.md#open-questions-for-the-owner)
27. **AI usage estimate:** keep it on the Settings screen, shared across users. Default: keep both. [SET Q1, Q4](settings.md#open-questions-for-the-owner)
28. **Notifications:** keep the wording "Recipe ready" and "Import failed"; a failed-import notification opens the library, which then shows the error. Default: keep both. [PWA Q4, Q5](pwa-push.md#open-questions-for-the-owner)
29. **Recipe language and scaling on display:** the language setting does not translate stored recipes on display, and a scale is not remembered per recipe. Default: keep both. [UNIT Q3, Q4](units.md#open-questions-for-the-owner)
30. **Folder screen:** rename and move stay one form; the screen title and nav say "Library" (design §7) while crumbs and captions call the root "Home". Default: keep. [COL Q5, Q6](collections.md#open-questions-for-the-owner)
31. **Search ties:** equally ranked results have no order. Default: newest first. [SRCH Q4](search.md#open-questions-for-the-owner)
32. **Imports and restarts:** a server restart may resume a running import or fail it with an "interrupted" message; the same URL may be imported twice. Default: resume if the job queue makes it free, otherwise fail; allow duplicates. [IMP Q3, Q6](import.md#open-questions-for-the-owner)
33. **yt-dlp guard and login limit:** keep the in-app guard in front of yt-dlp; keep 20 login attempts per IP per 15 minutes. Default: keep both. [SEC Q3, Q6](security.md#open-questions-for-the-owner)
34. **Duplicate a recipe:** not possible today. Default: out of scope for the first release. [REC Q8](recipes.md#open-questions-for-the-owner)

### E. No answer needed (notes)

- Import from pasted text, a photo or a screenshot does not exist today; design §2 keeps it in the backlog. [IMP Q1](import.md#open-questions-for-the-owner)
- Dutch word forms in search stay in the backlog (design §2, §5). [SRCH Q1](search.md#open-questions-for-the-owner)
- Theme and background colours come from the P4 palette; the paper colour was chosen for the OS chrome because the style log names none (PWA-04). Say so if you want ink. [PWA Q1](pwa-push.md#open-questions-for-the-owner)
- Who sends the "import done" notification is an implementation detail of the job queue; PWA-20 to PWA-23 must hold either way. [PWA Q6](pwa-push.md#open-questions-for-the-owner)
- Whether Caddy appends to or overwrites `X-Forwarded-For` is checked by the builder when the skeleton is deployed. [SEC Q5](security.md#open-questions-for-the-owner)

## `owner?` features

Every Features row whose verdict is `owner?`. Each is covered by a question
above.

| Area | Feature | Recommendation | Question |
|---|---|---|---|
| AUTH | Email address on the account | Keep it stored for imported accounts; sign-up asks for username and password only | 19 |
| AUTH | Case-sensitive usernames | Case-insensitive uniqueness and login | 2 |
| REC | Image gallery (multiple images per recipe) | Migrate all; ship one replaceable cover photo | 4 |
| REC | Tag names normalised to one case | Lower-case on save, merge on migration | 5 |
| REC | HEIC/HEIF photos | Accept and convert to JPEG | 13 |
| COL | Delete collection deletes everything inside it | Keep, with the count warning | 10 |
| COL | Drag a recipe card onto a folder or crumb | Keep for desktop; touch-friendly move from the folder view | 11 |
| SRCH | Accent-insensitive and partial-word matching | Backlog, with Dutch-aware search | 14 |
| UNIT | Convert-and-store on import (lossy) | Keep for parity | 3 |
| IMP | Cap of 30 import starts per hour per user | Keep per user and add the per-IP limit of design §9 | 6 |
| IMP | Only the newest pending import is restored on launch | Keep | 22 |
| IMP | Raw AI provider wording in some failure messages | Replace with one plain message | 21 |
| SET | Separate text-model and video-model pickers | One picker with Automatic | 23 |
| PWA | Icons | New icons in the P4 style | 24 |
| SEC | Session secret required in production | Refuse to start without one | 7 |
| SEC | Basic response-hardening headers | Add `nosniff` and `Referrer-Policy` | 8 |

## Shared behaviours

Behaviours that more than one area describes. The agreed rule is the one that
matches today's code (or the decided design, where the design changes it).
The consistency pass fixed the losing side where two areas disagreed.

| Behaviour | Areas | Agreed rule |
|---|---|---|
| Recipes at Home | COL, SRCH, REC | COL-03 is the single rule: a recipe is at Home exactly when it has no collection; browsing a folder shows only its direct contents, newest first; a search or tag filter covers the folder and everything below it (at Home, the whole library). REC-10, REC-11, SRCH-07, SRCH-08, SRCH-25 and SRCH-26 apply it; editing never moves a recipe (REC-12, COL-17). |
| Tag vocabulary | IMP, REC, SRCH | Imports choose tags only from the fixed English vocabulary, lower-case, at most 5 (IMP-10, IMP-22); tags typed by hand are free-form and stored as typed (REC-07, REC-35); the tag filter matches the exact name (SRCH-21). Both kinds share one tag table. Case handling is question 5. |
| Translate and convert: on import versus on display | IMP, UNIT, SET | On import: extract and tag, translate (structured-data path only, when a recipe language is set and the recipe is not already in it), convert units last, and store the converted draft (IMP-25, UNIT-35); the settings in force when the import starts are used (IMP-07, SET-29). On display: every recipe is converted to the current unit preferences on every view and never written back; the recipe language only picks the label of a unit that conversion introduces (UNIT-31, UNIT-19). The preferences themselves are SET-21 to SET-26 (UNIT-33 and UNIT-34 restate the API). Fixed: IMP-30 now says the label follows the recipe-language setting, as UNIT-19 and the code do, not "a Dutch recipe". |
| Image fetch after import | IMP, REC, SEC | The draft carries a photo address (IMP-16, IMP-17); after the owner saves the form, the photo is attached by a separate best-effort request (REC-18, REC-36, IMP-45); a failure leaves the recipe saved and shows "Couldn't import the photo — add one manually". The fetch is SSRF-guarded with re-checked redirects (SEC-31 to SEC-39), bounded to 10 s and 5 MB (SEC-41), and limited to 60 per user per hour (SEC-22). Fixed: SEC-25 said a fetched photo with the wrong bytes gets 400; the code answers 422, as REC-19 says. |
| Push after import | IMP, PWA | Every subscribed device is notified when a job ends in done or error, never when cancelled (IMP-37, PWA-20, PWA-21): "Recipe ready" opens the review form, "Import failed" opens the library, which restores the failed job. Endpoint allowlist and cleanup are PWA-15 to PWA-23 (and SEC-49, SEC-50). A notification failure never changes the import's result. |
| Push "notify me" toggle | PWA, SET, AUTH, IMP | PWA owns the toggle and its states (PWA-26 to PWA-30); the import screen's opt-in is IMP-44 and PWA-28. Its home outside the import screen is question 9. Fixed: SET's `drop` row and SET-28 ("not on this page") became a `keep` row deferring to PWA and a struck criterion; AUTH's row defers to PWA. |
| User menu entries and app navigation | AUTH, PWA, SET, SRCH, design §7 | Design §7 replaces the header (logo, search box, user menu) with a bottom nav pill (Library + "+") and a settings icon top-right. Kept: one step to Home and Settings from every signed-in screen (AUTH-24), the username, "Log out" and version (AUTH-14, AUTH-21), the notifications toggle (PWA-27 to PWA-30), search on the library screen (SRCH-01). Dropped: the dropdown itself (AUTH-22 struck), search from every page (SRCH-05 struck) and the manual dark/light override (PWA-32: follows the device). Placement is question 9. |
| Per-user model choice and usage | SET, IMP | The model is a per-user saved choice from a server allowlist, Automatic by default; a saved model that left the list counts as Automatic (SET-02 to SET-07, IMP-07). Every AI request that reached the provider is counted per model, shared by all users, per Pacific day, and counting never fails an import (SET-08 to SET-10, IMP-46). No disagreement found. |
| Rate limits | SEC, AUTH, IMP | SEC-16 holds the one table: login 20 per IP per 15 min, login failures 10 per account per 15 min, signup 5 per IP per hour, import starts 30 per user per hour, photo from URL 60 per user per hour; fixed windows, 429 with `Retry-After`. AUTH-09 and IMP-06 refer to it. Fixed: IMP-06 said "in the last hour" (a sliding window); it now uses SEC-16's fixed window and notes that an invalid start still counts (SEC-21). The per-user versus per-IP key for import is question 6. |
| Sign-up switch | AUTH, SEC | Off unless the setting is exactly `true`; when off, the API answers 403 "Sign-ups are disabled on this server" and creates nothing (AUTH-02, SEC-15, SEC-58). No disagreement found. |
| Session cookie and fresh session | AUTH, SEC | `__Host-` prefix, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, one week, never issued over plain HTTP; a new session id on login and sign-up (AUTH-11, AUTH-12, SEC-07 to SEC-12). SEC owns the detail. No disagreement found. |
| Failed-login delay and enumeration | AUTH, SEC | One 401 "Invalid username or password" for both failures, about a second's delay, equal work for unknown usernames (AUTH-09, SEC-19). No disagreement found. |
| URL guard on import | IMP, SEC | Blocked literals answer 400 "This URL cannot be imported" before a job exists (IMP-03, SEC-34, SEC-35); a name that resolves inward fails the job with the same message and status 400 (IMP-03, SEC-36); every redirect hop is re-checked (IMP-15, SEC-39); yt-dlp goes through the same guard and fails closed with 503 (IMP-19, SEC-43, SEC-48). Fixed: SEC-48 now cites the yt-dlp guard tests that IMP lists under Tests not carried. |
| Photo storage and serving | REC, SEC | Photos are checked by content, stored under random names, and served only through an owner-checked route (REC-14, REC-16, SEC-24, SEC-25); deleting a recipe or a folder removes the files too (REC-13, COL-15). |
| Theme colour | PWA, style log | Resolved against the locked P4 palette: the manifest's background and theme colours are chalk paper; the page head uses chalk paper for light and the dark-mode paper for dark (PWA-04). The style log names no OS-chrome colour, so this is a call made in this pass. |
| Length limits | REC, COL | None today in either area; one set of caps is question 12. |

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
- `frontend/src/main.tsx` — plumbing: app start-up; the service worker registration it does is PWA-06
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

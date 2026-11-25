# Recipes group: design

**Date:** 2026-11-25 · **Status:** draft for the owner's review (builder-checked)
**Inputs:** [restart design](2026-11-24-nosh-restart-design.md) (§7 look, §8
order) · [recipes spec](nosh-v2/recipes.md) (REC) ·
[security spec](nosh-v2/security.md) (SEC) ·
[deploy handover](../../restart/2026-11-24-deploy-handover.md)

Labels: **Owner** = decided by the owner in the brainstorm on 2026-11-25.
**My call** = settled by the author because it doesn't change what gets built;
the owner or the builder can override.

## 1. Intent

The recipes group is the first real feature on the live v2. The owner can
create, view, edit and delete recipes with a cover photo, browse them in the
library, and a new account no longer lands on a bare "Your recipes will
appear here" screen (owner, 2026-11-24: "the empty state looks really bad").
It is built to design §7 and the style log, which win over generic shadcn
looks.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Recipe CRUD API and screens to the REC criteria listed as in scope in §4.
2. Photos: upload (JPEG, PNG, WEBP, HEIC converted to JPEG), one cover,
   owner-only image route, byte sniffing (REC-14 to REC-17, SEC-24, SEC-25).
3. A designed library empty state (owner: direction A, §6.4).
4. The shared SSRF fetch guard (SEC-31 to SEC-42) and attaching a photo from a
   URL (REC-18, REC-19, SEC-22), in a second PR (§3).
5. Two skeleton-review follow-ups: an app-wide 401 handler and clearing the
   query cache on logout (§6.6).

**Non-goals** (each belongs to a later group; **Owner**: "standalone core")

- Collections: the collection filters, the collection picker, moving, drag
  and drop, breadcrumbs (COL). Every recipe created now sits at Home.
- Scaling and units on the recipe page (UNIT). Amounts show as stored.
- The search box and full-text search (SRCH).
- Opening the form from an import, import jobs, the "+" import choice (IMP).

**Anti-goals**

- Temporary stand-in UI for later groups (a fake collection picker, a fake
  search box) that will be thrown away.
- Losing the shape v1 data needs: hidden v1 photos, positions and integer ids
  must fit without a later schema rewrite (design §11).
- Any server-side URL fetch going live before the host firewall covers v2's
  subnet.
- Looking like a generic shadcn template.

## 3. Constraints

- **Every merge to `main` is live, and migrated, the next morning**
  (Watchtower, 04:00). So:
  - **PR1, the core**, merges when it's review-clean.
  - **PR2, the SSRF guard and photo-from-URL**, merges only after v2's subnet
    `10.102.0.0/24` is in the box's `SANDBOX_NETS` (`/opt/HOST.md`, needs
    `sudo`) and the container's outbound network is checked (it is also on
    `proxy`). That is a production action: the owner's yes first. **Owner**
    agreed to this split.
- **Uploads persist already:** `deploy/compose.yml` mounts
  `/opt/nosh-v2/uploads` at `/data/uploads` (`UPLOADS_DIR`), owned by uid
  1000. No production change is needed for PR1.
- **Body limit:** `/api/*` has a 100 KiB JSON limit answering 413 (SEC-27).
  Photo upload needs 5 MB, and REC-14 wants an over-size file answered **400**
  with a message saying so, not 413. The upload route must be exempt from the
  global limit and enforce its own (§6.2).
- Strict TypeScript, lint- and test-clean commits, tests written red first
  and citing criterion IDs, worktree `.claude/worktrees/recipes`, branch
  `claude/recipes`. Push and PR need the owner's yes.

## 4. Criterion coverage

| Criterion | Where | Notes |
|---|---|---|
| REC-01 | PR1 (+PR2) | Every PR1 endpoint answers 401 without a session; the from-URL endpoint gets the same test in PR2. |
| REC-02 to REC-09 | PR1 | REC-02's "its collection" is `collectionId: null`. |
| REC-10 | PR1 partial | `tag=` only. `collection=` and `within=` are COL's. |
| REC-11 | PR1 | No id or `null` means Home. No collections exist yet, so any given id is 404 `Collection not found` and nothing is created. This is testable now. |
| REC-12, REC-13 | PR1 | |
| REC-14 to REC-17 | PR1 | |
| REC-18, REC-19 | PR2 | |
| REC-20 | PR1 partial | No scaling or unit conversion (UNIT). "Back to the library at the recipe's collection" means Home. |
| REC-21 to REC-25 | PR1 | REC-24 returns to Home. |
| REC-26 | deferred: UNIT | |
| REC-27 to REC-30 | PR1 | |
| REC-31 | deferred: COL | The form sends no `collectionId`. |
| REC-32 to REC-35 | PR1 | |
| REC-36, REC-37 | deferred: IMP | |
| REC-38 | PR1 partial | Dragging is COL's. The caption slot exists but nothing sets it yet. |
| REC-39 | PR1 | |
| REC-40 | PR1 partial | The recipe, form and card placeholders, plus the library empty state. The "no search results" state is SRCH's. |
| SEC-22 | PR2 | |
| SEC-24, SEC-25 | PR1 | |
| SEC-31 to SEC-34, SEC-37 to SEC-40, SEC-42 | PR2 | |
| SEC-35 | deferred: IMP | The import job route. |
| SEC-36 | PR2 partial | Refusal at connect time. The import job's error-status wording is IMP's. |
| SEC-41 | PR2 partial | The photo limits (10 s, 5 MB). The guard takes its limits from the caller, so the page limits (15 s, 2,000,000 bytes) come with IMP. |
| AUTH-12, AUTH-14, AUTH-16 | PR1 | The 401 handler and the cache clear on logout (§6.6). |

## 5. Approaches

Decided in the brainstorm (**Owner**: "go with your picks").

| Choice | Picked | Considered | Why |
|---|---|---|---|
| Ingredient and step storage | Child tables, one row each, with a position | A JSON column on `recipes` | Matches REC-02 and REC-05 (each row has an id and a position) and maps one-to-one from v1. JSON would need invented ids, and the search group would have to index inside JSON. |
| Form state | react-hook-form with `useFieldArray`, validated by zod | TanStack Form; plain React state | Boring and popular. Field arrays fit the ingredient and step rows. Plain state means hand-written row and error handling. |
| Photo sniffing and HEIC | `file-type` for magic bytes, `heic-convert` for HEIC to JPEG | sharp with a custom libheif build | sharp's prebuilt binaries can't decode HEVC-based HEIC. A custom native build is friction on Windows and in Docker. Both picks are pure JS or WASM. |
| Card-sized copies | Store a copy about 800 px wide per photo, made with sharp (prebuilt binaries) | Serve originals only; shrink in the browser before upload | **Owner** (after the builder check). Library cards on an iPhone would otherwise load originals of up to 5 MB each. Shrinking in the browser can't decode HEIC outside Safari. sharp's prebuilt binaries handle JPEG, PNG and WebP, and `heic-convert` runs first for HEIC. |
| Scope | Standalone core | Every REC criterion with temporary stand-ins | **Owner.** Less rework, and each later group owns its own criteria. |
| Delivery | Two PRs, the second gated on the firewall | One PR | **Owner.** The core doesn't wait on a `sudo` change on the box. |

## 6. The design

### 6.1 Data model (one Drizzle migration in PR1)

- `recipes`: `id` integer identity (REC-08 ids are positive whole numbers,
  unlike the uuid users), `user_id` uuid FK to `users` on delete cascade
  (REC-13), `title`, `description` nullable, `servings`,
  `prep_time_minutes` and `cook_time_minutes` nullable with a `> 0` check
  (REC-03), `source_url` nullable, `collection_id` integer nullable,
  `created_at`, `updated_at`.
  - `collection_id` has **no foreign key yet**. COL adds the
    `collections` table and the FK. **My call.**
- `ingredients`: `id`, `recipe_id` FK on delete cascade, `position`,
  `quantity` nullable, `unit` nullable, `name`.
- `steps`: `id`, `recipe_id` FK on delete cascade, `position`, `instruction`.
- `tags`: `id`, `name` unique, stored lower-case. **Shared across users**,
  as REC-07 says. Never deleted when unused.
- `recipe_tags`: `recipe_id` FK on delete cascade, `tag_id` FK, primary key on
  both.
- `recipe_images`: `id` integer identity, `recipe_id` FK on delete cascade,
  `file_name` (random, unguessable, with the stored type's extension),
  `content_type`, `card_file_name` (the card copy, §6.2), `position`,
  `is_cover` boolean, `created_at`.
  - `card_file_name` is nullable so the importer can fill it after copying
    the v1 files. The image route falls back to the original when it's
    missing. **My call.**
  - A partial unique index allows at most one cover per recipe.
  - The cover is **marked, never worked out from position** (REC-15), so
    hidden v1 photos keep their positions and are never promoted. **My call**
    (a flag rather than a `cover_image_id` column on `recipes`, which would
    make the two tables reference each other).
- Ingredient and step text has no length cap beyond REC-03.
- The importer group decides whether v1 ids are kept. Integer identity
  allows both; keeping them means resetting the sequence afterwards.

### 6.2 API (Hono, zod schemas in `shared/`)

| Method and path | Criteria |
|---|---|
| `GET /api/recipes?tag=` | REC-09, REC-10 (tag only) |
| `POST /api/recipes` | REC-02, REC-03, REC-04, REC-07, REC-11 |
| `GET /api/recipes/:id` | REC-08 |
| `PUT /api/recipes/:id` | REC-12 |
| `DELETE /api/recipes/:id` | REC-13 |
| `POST /api/recipes/:id/images` (multipart, one file) | REC-14, REC-15, SEC-25 |
| `GET /api/recipes/:id/images/:imageId` | REC-16, SEC-24 |
| `DELETE /api/recipes/:id/images/:imageId` | REC-17 |
| `POST /api/recipes/:id/images/from-url` (PR2) | REC-18, REC-19, SEC-22 |

- **Recipe shape:** the full recipe, with `images` listing every stored image
  (id, URL, position) and `coverImageId` (or `null`) saying which one is
  shown (REC-15). **My call.**
- **Errors:** 400 `{ "error": <message> }` (REC-03). Route-level answers use
  `c.json`, because `onError` turns any 4xx `HTTPException` into "Invalid
  request" (see `docs/decisions.md`).
- **Ownership:** a recipe that isn't the caller's is 404 `Recipe not found`
  on every route. It is checked before any file is read or written, and
  before any fetch (REC-18).
- **Upload limits:** the global `bodyLimit` skips the upload route. That
  route caps the body at 5 MB plus a small multipart margin, then checks:
  - the file is present (400 otherwise);
  - its size is at most 5 MB (400 with a "too large" message otherwise);
  - its declared type is allowed;
  - its sniffed type matches the declared type (`file-type`);
  - if it's HEIC or HEIF, it's converted to JPEG.

  Only then is the file written, together with its card copy: sharp resizes
  to about 800 px on the long side (never enlarging), applies the EXIF
  orientation, and saves it as WebP under its own random name. If the card
  copy fails, the upload fails and nothing is kept. **My call** (width and
  format). In one transaction, the new image becomes
  the cover and the old cover's row is deleted. The old cover's file is
  removed after the commit, along with its card copy (a missing file is
  fine), so a refused upload leaves the old cover in place (REC-15).
- **Card copies are served** by the same owner-checked route with
  `?size=card` (SEC-24 applies unchanged). Every file deletion in REC-13 and
  REC-17 also removes the card copy.
- **Image responses:** sent with their stored `Content-Type` and
  `Cache-Control: private, max-age=31536000, immutable`. A replaced cover has
  a new id and so a new URL. **My call.**
- **Delete:** deletes the rows, then the files, and tolerates files that are
  already missing (REC-13).
- **Tag writes:** upsert each lower-cased name, then replace the recipe's
  links. Duplicates in any letter case collapse to one (REC-07).

### 6.3 The SSRF guard (PR2)

- A generic `safeFetch(url, { timeoutMs, maxBytes, redirectLimit })` in
  `server/src/net/`. It pre-checks literals and schemes (SEC-34), then uses a
  custom DNS lookup on a fresh, non-reused agent per request. That lookup
  resolves once, refuses the whole name if any address is blocked, and
  connects only to the checked address (SEC-36 to SEC-38).
- Redirects are followed by hand and re-checked on every hop (SEC-39).
- Compressed bodies are decoded (SEC-42).
- Failures reach the user as generic messages, and the raw error goes only to
  the log (SEC-40).
- `undici` is the likely base, since it's Node's own fetch. Whether to use its
  `Agent` with `connect.lookup` or `node:http(s)` is left to the builder.
- Photo-from-URL builds on it: 10 s, 5 MB, JPEG/PNG/WEBP by response type
  and bytes, with the status mapping of REC-19.
- The rate limit of 60 per user per hour (SEC-22) reuses
  `server/src/http/rateLimit.ts`, keyed by user id, counted after the
  ownership check.

### 6.4 Screens

All screens use design §7, the style log and the existing tokens, in light and
dark.

- **Library (`/`, search param `tag`).**
  - The header row has "nosh" and the settings icon.
  - Below it: a "N recipes" kicker, then the "Library" display title.
  - Tag chips follow, built from the owner's own tags with "all" first. The
    active chip is the ink pill with the §7 spring.
  - Then 2-column recipe cards (REC-38): a 4:5 cover (the card copy) or a
    letter placeholder,
    the title in DM Serif, "Serves N · Prep N min · Cook N min" (each only
    when set), and the tags. Newest first.
  - There is no search box and there are no collection tiles; SRCH and COL
    add them.
  - The page fetches the full list once and filters by tag on the client, so
    the chips animate instantly. The API's `tag=` exists for REC-10 and later
    callers. **My call.**
  - There is no paging: one person's library is small enough. **My call.**
- **Empty state (owner: direction A, "Illustrated invite").**
  - A centred ink-and-mustard line drawing (a steaming pot, inline SVG drawn
    in token colours so it works in dark mode).
  - The serif headline **"Your library is empty"**. COL-05 fixes this
    wording, so the mockup's "Nothing cooking yet" gives way. **My call.**
  - One muted sentence ("Add a recipe you love and it'll live here, photo
    and all.") and an ink "Add your first recipe" button to the new form.
  - The tag chips are hidden while there are no recipes.
  - A tag filter that matches nothing shows "No recipes match" with a way
    back to "all".
- **"+" in the app nav** opens `/recipes/new` directly. IMP turns it into a
  choice later. **My call.**
- **Recipe page (`/recipes/$id`).**
  - The magazine cover: a full-bleed cover photo with parallax and the
    headline card sliding over it.
  - The headline card holds the tag kicker (mustard, each tag links to
    `/?tag=…`, REC-23), the title, the "Serves · Prep · Cook" line, the
    description, and "Imported from <host>" when there's a valid source URL
    (REC-22).
  - Round back (to the library) and ⋯ buttons float on the photo. The ⋯
    menu holds Edit and Delete.
  - With no photo, the cover is a shorter chalk-grey panel with the big serif
    first letter, matching the card placeholder (**owner**, from the
    mockup).
  - The app nav is hidden. The floating Ingredients / Method pill takes its
    slot.
  - Ingredients show as stored, numbered. Steps are numbered with mustard
    numbers. Empty lists are not shown (REC-20).
  - There is a loading skeleton shaped like the page (REC-25).
- **Delete (REC-24):** the confirm dialog (REC-39), then delete, then the
  library. A failure shows "Failed to delete recipe" in a toast.
- **Form (`/recipes/new` and `/recipes/$id/edit`, REC-27 to REC-35).**
  - Fields: title, description (auto-growing), servings, prep and cook, the
    ingredient rows (quantity, unit, name) and the step rows (auto-growing),
    the tag input, and the Photo section.
  - The form is keyed on the route, so no draft carries over (REC-32).
  - **Form schema:** the form has its own values schema (strings, as typed),
    and its submit transform produces the shared API schema. The transform
    trims, turns blanks into `null`, drops blank rows and refuses a typed
    "0" with a message. Both schemas use the same cap constants and messages
    from `shared/`. Over-cap values render in full and block save with a
    message naming the cap (REC-28).
  - **Save:**
    1. The button shows "Saving…".
    2. Create, or update.
    3. On the create form, if a photo was chosen, upload it.
    4. Go to the recipe page, replacing history after a create (REC-30).

    A failed photo upload after a create leaves the recipe saved, shows the
    server's reason, and still goes to the recipe page (REC-33).
  - **Edit form photo:** uploads at once. Replacing the cover asks "Replace
    this photo? The current one will be deleted." first (REC-33), and
    removing it asks "Remove this photo? This can't be undone." first
    (REC-34).
- **Shared components:**
  - The confirm dialog is shadcn AlertDialog on Base UI, with focus starting
    on Cancel (REC-39).
  - Toasts use shadcn's Sonner. **My call:** boring and popular, and the
    spec's index leaves timing and look to the new UI.

### 6.5 Images on the client

- Cover images load from the authenticated route with the session cookie,
  using a plain `<img>` (same origin).
- On the create form, the preview uses an object URL from the chosen file.
- Browsers other than Safari can't show HEIC, so a HEIC preview shows a
  neutral "Photo selected: <file name>" tile. **My call.**

### 6.6 Skeleton follow-ups

- **401 handler (AUTH-12, AUTH-16):** any API call answering 401 clears the
  cached session and sends the owner to login, carrying the current address
  back. It lives in the API client or in the Query cache's `onError`,
  whichever the builder finds cleaner. The login and session-check calls
  themselves are excluded.
- **Logout (AUTH-14):** clears the TanStack Query cache, so the next account
  never sees the previous one's recipes. From the skeleton's final review.

## 7. Testing

- **Server:** Vitest integration tests against the test database, one or more
  per criterion, red first, citing the IDs.
  - The image tests use small real JPEG, PNG, WEBP and HEIC fixtures plus a
    disguised HTML file.
  - The PR2 guard tests use a local DNS stub and local HTTP servers, as SEC-36
    to SEC-39 describe.
- **App:** Vitest with Testing Library and MSW, per screen criterion.
- **End to end:** one Playwright journey: empty state, create with a photo,
  view, edit, tag filter, delete back to the empty state.

## 8. Left to the builder

- File and module layout inside `server/`, `app/` and `shared/`.
- `undici` versus `node:http(s)` for the guard.
- The HEIC JPEG quality, and whether the stored original needs EXIF handling (check
  with a real iPhone photo).
- The exact illustration drawing, within the mockup's direction.
- The skeleton shapes.

## 9. Carry into the plan

- **An early spike:** convert a real iPhone HEIC with `heic-convert`, then
  make its card copy with sharp, inside the built Alpine Docker image, not
  only on Windows (memory, WASM loading, sharp's musl binary). The owner can
  supply a photo. Also record what Safari's file input really sends from the
  iPhone (HEIC or JPEG) and how big it is, against the 5 MB cap.
- **The v1 importer** must make card copies for the photos it carries over
  (design §11).
- **Mockups** (git-ignored, in the main checkout only):
  `C:\Users\Thoma\dev\nosh\.superpowers\brainstorm\1170-1795594147\content\empty-state.html`
  (direction A is the pick) and `screens.html` (library, recipe with and
  without a photo).
- **Add to `docs/decisions.md`:** the image model (cover flag, hidden v1
  photos, card copies), the libraries (`file-type`, `heic-convert`, sharp,
  react-hook-form, Sonner), the upload route's own body limit, and the two-PR firewall gate.
- **`docs/backlog.md`:** move "empty state" to Completed when PR1 merges.
  Keep the firewall item open until PR2's gate is done.

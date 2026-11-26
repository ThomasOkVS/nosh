# Decisions

Short records of decisions that shape nosh. Newest last.

The 55 ADRs of the v1 app are on the `legacy` branch (tag `legacy-v1`) in
`docs/decisions.md`. The v2 spec cites them where they still explain why.

## 2026-11-24: Restart nosh from scratch

**Decision:** rewrite nosh as a one-container app (React SPA served by a Hono
API, PostgreSQL, Drizzle, Better Auth), reaching feature parity minus the meal
planner, in the locked visual style. The v1 code is archived as tag
`legacy-v1` and branch `legacy`, and `main` is cleared.

**Why:** the v1 UI felt clunky, and the codebase and docs had grown hard for
the owner and AI agents to work on. Learning React/Node is no longer a goal.

**Details:** [restart design](superpowers/specs/2026-11-24-nosh-restart-design.md)
(stack §6, style §7, order §8, security §9, migration §11) and the approved
[nosh-v2 spec](superpowers/specs/nosh-v2/index.md).

## 2026-11-24: shadcn CLI works on Windows; use it for UI components

**Decision:** UI tasks add components with `npx shadcn@latest add <name>`, not
the manual fetch fallback. In a Vite app, `shadcn init -t vite -b base -p nova`
gives `style: "base-nova"` (Base UI); it needs Tailwind v4 and the `@/*` alias
configured first.

**Why:** the CLI spawned pnpm through a broken global `pnpm.cmd` shim. npm's
allow-scripts policy had blocked pnpm 12's `install.js`, which builds the
Windows launcher. Reinstalling with
`npm install -g --allow-scripts=pnpm pnpm@12.23.0` fixed it; `init` and `add`
then installed their dependencies without a spawn error.

## 2026-11-24: Auth implementation

**Decision:** hand-rolled sessions instead of Better Auth. `createAuthService`
stores users and sessions in our own Drizzle tables; passwords are argon2id
(`argon2`, v1 defaults); the stored session id is HMAC-SHA256 of the cookie
token with `SESSION_SECRET`.

**Why:** Better Auth 1.7.27 failed the contract tests in
`server/src/auth/service.contract.test.ts` using public options only. Sign-up
(`signUpEmail`, also used by the username plugin) rejects a missing email
(`[body.email] Invalid input`) and its user table makes `email` required, so
"AUTH-01 AUTH-23" cannot pass without a placeholder email, which the spec
rules out. Even with a placeholder, there is no injectable clock for
"AUTH-12", and the raw session token is stored in the session table.
Design §6 names hand-rolled sessions as the fallback.

**Details:** [skeleton + auth plan](superpowers/plans/2026-11-24-skeleton-auth.md), Task 1.

## 2026-11-24: Request bodies go through a validator; a SyntaxError is a bug

**Decision:** routes read JSON bodies only through `jsonBody(schema)`
(`server/src/http/validate.ts`, Hono's `validator("json")` plus zod). Malformed
JSON becomes `HTTPException(400)` there, so `onError` no longer turns every
`SyntaxError` into a quiet 400: any other `SyntaxError` answers 500 and is
logged. Auth answers (401, 403, 409, 429) use `c.json`, never
`HTTPException`, because `onError` maps every 4xx exception to "Invalid
request".

**Why:** the blanket `SyntaxError` branch hid real bugs (SEC-26, SEC-29).

## 2026-11-24: esbuild's install script stays off

**Decision:** `pnpm-workspace.yaml` lists `esbuild: false` under
`allowBuilds`; only `argon2` may run its install script.

**Why:** pnpm 12 fails `pnpm install --frozen-lockfile` with
`ERR_PNPM_IGNORED_BUILDS` while a build is neither allowed nor denied.
esbuild ships its platform binary as an optional dependency, so its
postinstall check is not needed.

## 2026-11-24: How `@nosh/shared` resolves

**Decision:** `shared/package.json` exports a `source` condition
(`src/index.ts`) and a `default` one (`dist/index.js`, types in `dist`).
tsc (`customConditions` in `tsconfig.base.json`), Vitest and Vite ask for
`source`, so they read the TypeScript directly. Plain Node and the Docker
image use the built `dist`; `server/tsconfig.build.json` clears the
condition so the server build checks against `dist` too. `pnpm dev` builds
shared first, and `pnpm build` builds it first as a workspace dependency.

**Why:** no build step in tests and type checks, while the running server
needs plain JavaScript.

## 2026-11-24: TypeScript stays on ^6

**Decision:** the root `typescript` dependency is pinned to `^6`.

**Why:** typescript-eslint rejects TypeScript 7. Revisit when it supports 7.

## 2026-11-24: v2 takes the v1 hostname now; deploy topology

**Decision:** v2 runs as the Dockge stack `/opt/nosh-v2` (one app container
plus its own Postgres 17) and serves `nosh.itsthomassito.com` from day one.
v1 is stopped, not removed, so the importer can read its data. Only the app
joins Caddy's `proxy` network, as `nosh-v2`; `TRUSTED_PROXIES` is Caddy's
pinned `172.28.255.2`. Data lives under `/opt/nosh-v2/`, not the plan's
`/DATA` (absent on the box; Kopia backs up `/opt`). The app carries the
Watchtower label, so merges to `main` deploy and migrate nightly.

**Why:** the owner is the only user and chose the real hostname over a
side-by-side name (v1's features are gone until the importer runs). Caddy
already had a pinned IP, so SEC-13 needed no proxy change. Caddy overwrites
`X-Forwarded-For` (no `trusted_proxies`), confirmed in v2's request log; the
rightmost-entry rule is right either way. Details: `docs/deployment.md`.

## 2026-11-25: The recipe image model

**Decision:** a recipe has one cover photo: the `recipe_images` row with
`is_cover`, enforced by a partial unique index (one cover per recipe). Hidden
v1 photos stay stored and are listed in the DTO's `images`, but are never
shown and never promoted; removing the cover leaves the recipe with no photo.
Each photo has a card copy (about 800 px on the long side, WebP, never
enlarged, EXIF orientation applied), served with `?size=card`. When
`card_file_name` is null, as it is for v1 rows, the original is served
instead. Files are stored under random 32-hex names and served only by the
names in the database; `store.path` refuses any name that isn't a plain
basename (defence for migrated rows).

**Why:** the library shows small cards on a phone, so a light copy matters,
yet migrated v1 rows must keep working before the importer makes their copies.

## 2026-11-25: Image libraries: file-type, heic-decode, sharp

**Decision:** `file-type` sniffs the bytes. HEIC goes through `heic-decode`,
not `heic-convert` (the builder ruled this today), then sharp writes the JPEG
at q90. sharp handles every other format and the card copies, using the
prebuilt `@img/sharp-*` binaries (`allowBuilds: sharp: false`). HEIC decodes
run one at a time. The 5 MB cap (REC-14) applies to the upload; a converted
HEIC may be larger. Docker numbers (musl image, the owner's 4.16 MB iPhone
HEIC): the first spike with heic-convert took RSS ~747 MB, ~13.5 s, JPEG
6.77 MB; the final heic-decode + sharp took RSS ~654 MB, ~7.5 s, JPEG
5.80 MB, card ~39 KB. The WASM decode still blocks the event loop for those
seconds; accepted for a single-user app. A worker thread is a possible later
improvement.

**Why:** heic-decode is the decoder heic-convert wraps. It lets the server
read width × height first and refuse anything over 60 MP without decoding it,
which closes a decompression bomb. It was also lighter and faster.

## 2026-11-26: Stored originals carry no EXIF or GPS

**Decision:** stored originals are re-encoded through sharp without metadata
(orientation is baked into the pixels first; the ICC colour profile is
kept), so GPS is never stored. HEIC
originals were already fresh JPEGs. This replaces the 2026-11-25 decision to
keep EXIF (SEC-24).

**Why:** this was the owner's decision. The cost is a light re-encode: JPEG
and WebP at quality 90, PNG lossless.

## 2026-11-25: react-hook-form, the zod resolver and Sonner

**Decision:** the recipe form uses react-hook-form with the zod resolver, and
toasts use Sonner. `zod` is also a direct dependency of `app/`, at the same
range as `shared/`. The form schema mirrors `recipeBody`, using
`RECIPE_LIMITS`, `RECIPE_MESSAGES` and `MAX_INT4`.

**Why:** pnpm's isolated `node_modules` requires the direct `zod` dependency;
mirroring `recipeBody` keeps the client and server rules in one place.

## 2026-11-25: The upload route has its own body limit

**Decision:** the global API body limit is 100 KiB (SEC-27). It is skipped
only for `POST /api/recipes/:id/images`, matched by an anchored path regex.
That route has its own `bodyLimit` of 5 MB + 64 KiB, which answers 400
"Image must be 5 MB or smaller" instead of 413. The limit runs before the
ownership check, so an oversize body sent to someone else's recipe gets 400,
not 404.

**Why:** a 400 with a message lets the form show the reason; a bare 413 would
not.

## 2026-11-25: Upload error copy

**Decision:** the messages are "No image file was sent", "Only JPEG, PNG, WEBP
or HEIC images are allowed", "The file's contents don't match its type",
"Image must be 5 MB or smaller", "That image is too large to process" and
"That image couldn't be read". The client shows "Failed to upload image" when
the server sent no message.

**Why:** REC-14 only says "a message saying which"; the wording is the plan's
choice.

## 2026-11-25: Integer bounds

**Decision:** `MAX_INT4` (2147483647) bounds the whole-number fields and path
ids. A path id above it answers 404 before any query. A tag upsert sorts the
names before inserting.

**Why:** an out-of-range id would otherwise reach Postgres and fail as a 500;
sorted inserts avoid deadlocks between concurrent saves.

## 2026-11-25: Library kicker under a tag filter

**Decision:** when a tag filter is on, the kicker reads "N of M", for example
"1 of 3": recipes shown of all recipes.

**Why:** the owner's decision.

## 2026-11-25: Recipes PR2 waits on the firewall

**Decision:** photo from URL and the SSRF guard (plan Tasks 13 to 16) merge
only after the host firewall covers `10.102.0.0/24` (Task 16).

**Why:** the server will fetch user-supplied URLs; the guard is not enough
while the container's network can still reach the host's internal ranges.

## 2026-11-26: Tags are at most 50 characters

**Decision:** a tag is at most 50 characters (`RECIPE_LIMITS.tagLength`). The
API refuses a longer one with 400 "Tags must be at most 50 characters"; the
tag field refuses to add it, shows that message and keeps the typed text.
Tags are also stored in Unicode NFC, so a decomposed and a precomposed
"crème" are one tag.

**Why:** with no cap, a long random tag overflowed the btree entry limit of
the unique index on `tags.name`, and the save failed as a 500.

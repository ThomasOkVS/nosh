# nosh restart: handover for Task 5, archive and wipe (2026-11-24)

Read this first in the next session. It replaces
[2026-11-24-execution-handover.md](2026-11-24-execution-handover.md) as the
starting point.

Suggested opener:

> Read `docs/restart/2026-11-24-task5-handover.md`, then run Task 5 of
> `docs/superpowers/plans/2026-11-24-nosh-spec-extraction.md`.

## Where things stand

| What | State |
|---|---|
| Spec | **Approved by the owner 2026-11-24.** [specs/nosh-v2/index.md](../superpowers/specs/nosh-v2/index.md): 9 areas, 330 criteria, `spec OK`. Merged into `main` with this file. |
| Plan Tasks 1–4 | Done. Reviewed per task and by a final whole-branch review; every finding fixed. |
| Plan Task 5 | **Not started.** Archive `main` as `legacy-v1` + `legacy`, then clear `main`. |
| Production | Untouched. v1 still runs on the homelab. |
| SDD ledger | Deleted with the worktree. The rulings that matter are listed below. |

## Before Task 5: the main checkout's uncommitted changes

The main checkout (`C:\Users\Thoma\dev\nosh`, on `main`) still has changes
from the brainstorm session. Task 5 keeps `.claude/settings.json`,
`.agents/**` and `skills-lock.json` and deletes almost everything else. The
wanted changes therefore need **their own small PR, merged before the wipe**,
or they won't be on the fresh `main`:

- `.claude/settings.json`: plugins, including `frontend-design` and
  `modern-web-guidance`.
- `.agents/skills/{shadcn,migrate-radix-to-base}/` and
  `.claude/skills/{shadcn,migrate-radix-to-base}/`, which are untracked.
- `skills-lock.json`, `.gitignore` (`.superpowers/`) and `.claude/launch.json`
  (the style-spike entry).

The two `Dockerfile.dev` edits are old-app files, so discard them: Task 5
deletes them anyway. Check `git status` in the main checkout, because the
list above may be out of date. Ask the owner which changes to keep.

## Task 5: what stops for the owner

The plan text is binding. Every one of these needs an explicit yes in chat
at that moment:

1. Pushing the `legacy-v1` tag and the `legacy` branch (Step 2).
2. Pushing `claude/restart-wipe` and opening its PR (Step 6). The owner
   merges.
3. Confirming production after the merge (Step 7).

Review focus 5 is the main risk. The wipe commit must also delete
`.github/workflows/ci.yml`, so that no new image is published: Watchtower on
the box would pull it. Before you wipe, verify that `legacy-v1`, `legacy` and
`origin/main` are all the same SHA.

## Homelab access (new)

- `ssh homelab` reaches the box that runs nosh. It uses key auth with no
  password, and the owner set it up on 2026-11-24.
- Today the nosh containers are `nosh-frontend-1`
  (`ghcr.io/thomasokvs/nosh-frontend:latest`), `nosh-backend-1`
  (`ghcr.io/thomasokvs/nosh-backend:latest`) and `nosh-postgres-1`
  (`postgres:17-alpine`). They sit behind `caddy`, and `watchtower` also runs
  on the box.
- Ask before each use, and stay read-only (`docker ps`, `docker inspect`).
- For Step 7, record the image digests **before** the wipe PR merges and
  compare them after:

  ```
  ssh homelab "docker inspect --format '{{.Name}} {{.Image}}' nosh-frontend-1 nosh-backend-1"
  ```

## Rulings made during spec extraction

These were decided on the owner's behalf while the plan ran. Each one
appears again in the spec's Rationale and Owner decisions, so a builder sees
it there:

- **R1:** paths in the spec are repo-relative.
- **R4:** a test file counts as covered only when its full repo-relative path
  appears in Acceptance criteria or in Tests not carried. The checker
  enforces this.
- **R9/R10:** an area cites another area's test file on `Cites:` lines
  without listing it in Sources, so only one area owns each test file.
  For example, SRCH and COL cite `backend/src/routes/recipes.test.ts`,
  which REC owns.
- **R11:** AUTH-22, SRCH-05 and SET-28 are struck. Design §7 replaces the
  header user menu and the header search, and §12 #8/#9 confirm it. The
  owner can still bring any of them back.
- **R12:** the theme colour was derived from the style log. The owner then
  chose chalk paper (Q26).
- **R13:** the import limit is per user **and** per IP, as design §9 asks
  (SEC-59).
- **R14:** the cover photo rule (Q4), which the owner confirmed.
- **R15:** the 20-photo cap is dropped, which the owner approved.

## Spec decisions that touch the next plan (skeleton + auth)

- **Login:** a username that already exists can always log in. The format
  rules apply to sign-up only (Q1).
- **Username case:** usernames are case-insensitive, and the importer stops
  when two v1 usernames differ only in case (Q2).
- **Sign-up form:** it asks for username and password only. An account may
  have no email, and the design §6 auth-library fit check must allow for
  that. See the AUTH Rationale (Q19).
- **Existing passwords:** argon2 hashes from v1 must keep working (AUTH-08).
- **Session secret:** production refuses to start without one (SEC-57).
- **Response headers:** add `nosniff` and `Referrer-Policy: same-origin`
  (Q8).
- **Trusted proxy:** the only trusted proxy is Caddy (SEC-13, SEC-14). Open
  note: check whether Caddy appends to `X-Forwarded-For` or overwrites it
  once the skeleton is deployed.

## After Task 5

The next plan is **skeleton + auth** (design §8). Write it with
`superpowers:writing-plans` from the approved AUTH and SEC criteria. Before
scaffolding, fix the shadcn CLI / pnpm problem on Windows (design §3).

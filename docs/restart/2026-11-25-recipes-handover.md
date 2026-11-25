# nosh restart: handover before building the recipes group (2026-11-25)

Start the next session here. This file replaces
[2026-11-24-deploy-handover.md](2026-11-24-deploy-handover.md).

## Where things stand

| What | State |
|---|---|
| Brainstorm | Done. Design [2026-11-25-recipes-design.md](../superpowers/specs/2026-11-25-recipes-design.md), **approved by the owner 2026-11-25**. |
| Plan | [2026-11-25-recipes.md](../superpowers/plans/2026-11-25-recipes.md): 16 tasks, reviewed, **no task started**. |
| Execution method | **Subagent-driven** (owner's choice): `superpowers:subagent-driven-development`, using the project's `nosh-dev` and `nosh-reviewer` agents. |
| Branch | `claude/recipes` in the worktree `.claude/worktrees/recipes`. It holds the design, the plan and this handover. Pushed to `origin/claude/recipes` (no PR yet). Continue in this worktree; don't make a new one. |
| Production | Unchanged since the skeleton deploy. v2 is live at `https://nosh.itsthomassito.com`. |

## What the owner decided (don't reopen)

- **Scope:** the standalone core. Collections, units and scaling, search, and
  import seeding stay with their own groups. Design §4 maps every criterion.
- **Empty state:** direction A, "Illustrated invite". Its headline is "Your
  library is empty" (COL-05 wording).
- **No-photo recipe page:** a chalk-grey panel with the big serif first
  letter.
- **Libraries:**
  - ingredients and steps in child tables;
  - react-hook-form with zod for the form;
  - `file-type` and `heic-convert` for photos, plus sharp for **card copies**
    (about 800 px WebP), which the owner chose after the builder check.
- **Two PRs:**
  - **PR1, the core (Tasks 1–12)** merges when it's review-clean.
  - **PR2, photo from a URL and the SSRF guard (Tasks 13–16)** merges only
    after the host firewall covers `10.102.0.0/24` (Task 16).

## Before dispatching Task 1 (the lead does these)

1. **Ask the owner for the HEIC fixture.** One photo of food from their
   iPhone, sent as the original HEIC, 5 MB or smaller, **taken with Location
   turned off** (it gets committed, and HEIC carries GPS data). Put it at
   `server/test/fixtures/images/photo.heic`.
2. **Start the dev database:** `docker compose -f compose.dev.yml up -d`
   (port 5433). Docker Desktop is needed for Task 1's image check.
3. Task 1 Step 7 is the lead's too: ask the owner what Safari's file picker
   sends from the iPhone (the type and size). If it's often over 5 MB, raise
   it with the owner before Task 6. The 5 MB cap is spec.

## Notes for the lead

- **Mockups** live only in the main checkout, which is git-ignored:
  `C:\Users\Thoma\dev\nosh\.superpowers\brainstorm\1170-1795594147\content\`
  (`empty-state.html`, option A; `screens.html`). Give those paths to the
  Task 8 and Task 9 implementers. Open them as files; the mockup server is
  stopped.
- **Owner steps a subagent can't do:** Task 1 Steps 1 and 7, the visual
  checks in Tasks 8–10 (the lead looks in the browser pane), the PR asks in
  Tasks 12 and 16, and every production step in Task 16.
- **After PR1 is approved by the owner:** open it, then turn on Auto-fix and
  auto-merge (merge commit) without asking again. Every merge to `main` is
  live, and migrated, the next morning (Watchtower, 04:00).
- **PR2** gets its own branch, `claude/recipes-url-photo`, cut from
  `claude/recipes` after Task 12.

## Still open from the deploy handover

None of these block the recipes work. Raise them with the owner when there's
a natural pause.

- **SEC-08 in production:** ask the owner to log in and reload. Note in
  `docs/deployment.md` whether they stay logged in.
- **CLAUDE.md line 13** still says "Better Auth". It should say hand-rolled
  sessions with argon2. CLAUDE.md is owner-governed, so ask first.
- **The Settings screen pill** has no active option. This is a design
  question for the owner.
- **`tsx` as a server devDependency** was refused, so `pnpm dev` doesn't
  watch the server.
- **Watchtower on `nosh-v2`:** revisit before the v1 import (it's in the
  backlog).

## Working rules

The same as before:

- Use worktrees only.
- Tests cite criterion IDs and are written red first.
- Design §7 and the style log win on look.
- Every push, PR and production action needs the owner's yes.
- `ssh homelab` works with key auth. Never read a `.env` value on the box.

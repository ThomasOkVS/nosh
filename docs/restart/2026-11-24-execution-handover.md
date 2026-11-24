# nosh restart: handover for executing the spec-extraction plan (2026-11-24)

> **Superseded** by [2026-11-24-task5-handover.md](2026-11-24-task5-handover.md).
> Tasks 1–4 are done and the spec is approved.

Read this first in the session that executes the plan. It replaces
[2026-11-24-handover.md](2026-11-24-handover.md) as the starting point. That
file is the brainstorm record and stays for history.

Suggested opener:

> Read `docs/restart/2026-11-24-execution-handover.md`, then execute
> `docs/superpowers/plans/2026-11-24-nosh-spec-extraction.md` with
> superpowers:subagent-driven-development.

## Where things stand

| What | State |
|---|---|
| Restart design | **Approved by the owner 2026-11-24.** [specs/2026-11-24-nosh-restart-design.md](../superpowers/specs/2026-11-24-nosh-restart-design.md) |
| Spec-extraction plan | Written and committed, **not started.** [plans/2026-11-24-nosh-spec-extraction.md](../superpowers/plans/2026-11-24-nosh-spec-extraction.md) |
| Execution method | **Subagent-driven** (owner's choice): `superpowers:subagent-driven-development` |
| Decision log / backlog | `docs/decisions.md` has the 2026-11-24 restart entry. `docs/backlog.md` has a "nosh restart (2026-11-24)" section. |
| Branch | Everything above is **merged into `main`** (2026-11-24), together with "legacy" banners on the old docs and a restart section at the top of `CLAUDE.md`. |
| SDD workspace | None yet. There's **no ledger.** Start fresh. |

**Where to run it:** a new worktree branched from `main`
(`.claude/worktrees/<name>`), never the main checkout.

**Old vs new in this repo:** see the top of `CLAUDE.md`. In short:
- **New (the restart):** `docs/restart/`, `docs/superpowers/`, the 2026-11-24
  entry in `docs/decisions.md`, and the "nosh restart" section in
  `docs/backlog.md`.
- **Legacy (v1):** everything else. That's the input to spec extraction, not
  guidance.

## Settled with the owner (don't reopen)

- Everything in the design doc, including all 11 proposals in its §12.
- **The interface is English only.** No i18n. Recipe content is Dutch or
  English.
- **The builder will get SSH to the homelab, but not yet.** This plan doesn't
  need it. Cutover (a later plan) does.
- Execution is subagent-driven.

## Pre-flight notes for the controller

These came from reading the plan once more before dispatching. Put them in the
ledger as rulings and hand the relevant ones to the implementers:

1. **Short paths in the plan must be expanded.** The Areas table and the
   expected Set aside list use shorthand: `routes/auth.ts`,
   `db/pool.ts`, `index.ts`, `test/*`, `public/*`, migrations `…0000`. In the
   spec files every path must be **repo-relative**, e.g.
   - `backend/src/routes/auth.ts`
   - `backend/src/db/pool.ts`
   - `backend/src/index.ts`
   - `backend/src/test/*` and `frontend/src/test/*`
   - `frontend/public/*`
   - `backend/migrations/1700000000000_create-users.js`

   Task 1 Step 6 (`[unknown-file]` must be empty for Set aside) catches
   mistakes.
2. **Task 2 runs nine subagents in parallel.** The SDD skill normally forbids
   parallel implementers. The plan mandates it on purpose: each agent writes
   only its own area file and doesn't commit. The controller commits once
   after the per-area checks. Then run **one task review covering all nine
   files**, not nine reviews.
3. **Task 2 is reading and judgment work, not transcription.** Use a mid/standard
   model for the area agents and a capable model for the Task 3 consistency
   pass. Task 1 (the checker, with its tests fully specified) can use a cheap
   or mid model.
4. **The restart ADR exemption** in the checker matches the heading
   `2026-11-24: nosh is restarted from scratch`. That's the exact text in
   `docs/decisions.md`.
5. **Things that stop for the owner** (everything else is a ruling in the
   ledger):
   - Task 4, the whole review gate. Owner answers in one message and must
     say "spec approved".
   - Every `git push`, tag push and PR.
   - All of Task 5. It runs only after the spec PR is merged into `main`.

## Main checkout: uncommitted state to know about

The main checkout (`C:\Users\Thoma\dev\nosh`, on `main`) still has changes
from the brainstorm session. This branch doesn't touch them:

- **Modified:** `.claude/launch.json` (style-spike entry), `.claude/settings.json`
  (plugins incl. `frontend-design`, `modern-web-guidance`), `.gitignore`
  (`.superpowers/`), `skills-lock.json`, `backend/Dockerfile.dev`,
  `frontend/Dockerfile.dev`.
- **Untracked:** `.agents/skills/{shadcn,migrate-radix-to-base}/` and
  `.claude/skills/{shadcn,migrate-radix-to-base}/`. (The untracked
  `docs/restart/` originals were removed when this branch was merged. The
  tracked copies are identical.)
- `.superpowers/style-spike/` is the git-ignored style prototype. Reference
  only.

The owner should decide what to commit or discard there. In particular, the
`.claude/settings.json` plugin changes and the shadcn skills are wanted for the
build, and Task 5's keep-list keeps `.agents/**`, `.claude/settings.json` and
`skills-lock.json`. So they need to land on `main` (their own small PR)
**before Task 5's wipe**, or they'll be missing from the fresh `main`. The two
`Dockerfile.dev` edits are old-app files. Task 5 deletes them anyway.

## After this plan

The next plan is **skeleton + auth** (design §8), written with
`superpowers:writing-plans` from the approved AUTH and SEC criteria. Before
scaffolding, fix the shadcn CLI / pnpm problem on Windows (design §3 has the
details).

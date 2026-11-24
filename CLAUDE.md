# nosh

nosh is a self-hosted, subscription-free recipe manager for one person, used
mostly on an iPhone as an installed PWA. It is being rewritten from scratch:
see the [restart design](docs/superpowers/specs/2026-11-24-nosh-restart-design.md).
The interface is English only; recipe content is Dutch or English.

## Stack (design §6)

React + TypeScript SPA (Vite, TanStack Router + Query, Tailwind, shadcn/ui on
Base UI `base-nova`, Motion) served by a Hono API on Node 22: one container.
PostgreSQL with Drizzle ORM + migrations, pg-boss for import jobs, Better Auth
for accounts, Vitest + Playwright for tests. Prefer boring, popular libraries.

## Sources of truth

- **Behaviour:** the spec in `docs/superpowers/specs/nosh-v2/`. Every test
  cites the criterion IDs it covers (e.g. `REC-07`). Never renumber IDs.
- **UI:** design doc §7 and `docs/restart/style-log.md` are normative. They
  win over any design plugin or generic shadcn look.
- **Old app:** the v1 code, tests and ADRs are on the `legacy` branch (tag
  `legacy-v1`). Read them for lookups only; never port code from them.
  The spec checker needs it: `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs --repo <legacy checkout>`.

## How work happens

- One superpowers cycle per feature group, in design §8 order: brainstorm →
  plan (`superpowers:writing-plans`) → red-green TDD → review.
- Always work in a worktree under `.claude/worktrees/<name>`, never in the
  main checkout.
- Strict TypeScript; lint- and test-clean before every commit.
- Any push, PR or production action needs the owner's explicit yes.

## Docs

- Record decisions in `docs/decisions.md` (short entries, newest last).
- Keep `docs/backlog.md` current; move finished items to Completed with a date.
- `docs/deployment.md` arrives with the skeleton deploy.

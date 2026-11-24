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

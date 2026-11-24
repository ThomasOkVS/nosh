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

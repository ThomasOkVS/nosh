# Skeleton + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-container nosh v2 skeleton (Hono on Node 22 serving the API
and the built Vite SPA, Drizzle + Postgres, CI, Dockerfile with yt-dlp, the
locked style tokens, the app shell) with login working end to end and the
auth-side security guards in place.

**Architecture:** A pnpm workspace with `server/` (Hono API that also serves
the built SPA), `app/` (React SPA) and `shared/` (zod schemas). All auth
behaviour sits behind one `AuthService` interface; the HTTP routes, cookie,
origin check, rate limits and failure delay are ours and never depend on
which implementation is behind the interface. Task 1 decides that
implementation (Better Auth or hand-rolled) by a contract test.

**Tech Stack:** Node 22, pnpm 12, TypeScript (strict), Hono +
`@hono/node-server`, Drizzle ORM + drizzle-kit, `postgres` (postgres.js),
`argon2`, zod, React 19, Vite, TanStack Router (file-based) + TanStack Query,
Tailwind v4, shadcn/ui (`base-nova`, Base UI), Motion, lucide-react,
`@fontsource`, Vitest, Testing Library, MSW, Playwright, ESLint
(typescript-eslint). Better Auth only if Task 1 keeps it.

**Spec:** [restart design](../specs/2026-11-24-nosh-restart-design.md)
(§3 constraints, §6 stack and auth, §7 style, §8 skeleton, §9 security),
[auth.md](../specs/nosh-v2/auth.md), [security.md](../specs/nosh-v2/security.md),
[style-log.md](../../restart/style-log.md), and the
[handover](../../restart/2026-11-24-skeleton-handover.md).

## Global Constraints

- Node 22 is the runtime: `"engines": { "node": ">=22" }`, CI and the
  Dockerfile pin Node 22. Local dev on a newer Node is fine.
- Root `package.json` has `"packageManager": "pnpm@12.23.0"`.
- Strict TypeScript everywhere. `pnpm lint`, `pnpm typecheck` and `pnpm test`
  are clean before every commit.
- Every test title or `describe` names the criterion IDs it covers, e.g.
  `it("AUTH-09 SEC-19: unknown username and wrong password get the same 401", …)`.
  Never renumber IDs.
- Interface is English only. No i18n library.
- Error bodies are always `{"error": "<message>"}` with the spec's exact
  wording. Success bodies for auth are `{"id": string, "username": string}`.
  No password, hash or email on the wire.
- Look: design §7 and the style log win over shadcn defaults and over any
  design plugin. Colours: chalk paper `oklch(0.985 0.004 90)`, cards white,
  ink `oklch(0.2 0.01 260)`, mustard `oklch(0.6 0.13 75)`, bright mustard
  `oklch(0.86 0.15 88)`. Fonts: DM Serif Display (weight 400 only, never
  faux-bold) + DM Sans. Spring `stiffness: 420, damping: 34`; reveal ease
  `[0.22, 1, 0.36, 1]`. Tailwind default spacing (0.25rem).
- Dark mode follows the system (PWA-32): paper `oklch(0.18 0.01 260)`, cards
  `oklch(0.23 0.01 260)`, chalk as text, active pill chalk-on-ink inverted,
  both mustards unchanged; text/background pairs meet WCAG AA.
- No legacy code is ported. The `legacy` branch is for lookups only.
- Images: CI publishes only `ghcr.io/thomasokvs/nosh`. Never
  `nosh-frontend` or `nosh-backend` (Watchtower would replace v1).
- Every push, PR, merge and production action needs the owner's yes at that
  moment. `ssh homelab` is read-only unless the owner says otherwise.
- Work happens in a worktree under `.claude/worktrees/<name>`.
- Environment variables (names are final, values never committed):
  `NODE_ENV`, `PORT` (dev default 3001), `DATABASE_URL`, `ALLOWED_ORIGINS`
  (dev default `http://localhost:5173`), `TRUSTED_PROXIES`, `SESSION_SECRET`,
  `ALLOW_SIGNUP`, `UPLOADS_DIR` (dev default `uploads`), `COMMIT_SHA`
  (build-time), `TEST_DATABASE_URL` (tests only).

## Criteria covered

**AUTH:** AUTH-01 to AUTH-21, AUTH-23, AUTH-24 (AUTH-04 and AUTH-22 are
struck). Two parts belong to later groups and are not tested here:
AUTH-23's "the import refuses case-colliding v1 usernames" (one-time
importer), and AUTH-24's import dialog and the "+" action (recipes and
import groups wire the "+"; the shell only renders it).

**SEC, by owning group:**

| Group | SEC IDs |
|---|---|
| Skeleton + auth (this plan) | SEC-01 to SEC-20, SEC-23 (health and 401 parts), SEC-26 to SEC-30, SEC-51 to SEC-54, SEC-56 to SEC-58, SEC-60 |
| Recipes | SEC-22, SEC-23 (image route), SEC-24, SEC-25, and the shared fetch guard SEC-31 to SEC-42 (photo from URL, REC-19, is the first server-side fetch) |
| Import jobs | SEC-21, SEC-43 to SEC-48, SEC-59 (import reuses the recipes fetch guard) |
| PWA and push | SEC-49, SEC-50, SEC-55 |

## Review Focus

1. **Return address after login (AUTH-16).** `/login?redirect=//evil.example`
   or `/\evil.example` or `https://evil.example` must land on `/`, never
   off-site. Only a value starting with a single `/` (not `//`, not `/\`) is
   used. Test owned by Task 8.
2. **`X-Forwarded-For` with several entries (SEC-13).** From the trusted
   proxy, `X-Forwarded-For: 6.6.6.6, 203.0.113.9` means the client is
   `203.0.113.9` (the entry Caddy appended, the rightmost), not the
   client-chosen first entry. Test owned by Task 3.
3. **SPA fallback vs JSON 404 (SEC-28, SEC-60).** `GET /recipes/abc` with
   `Accept: text/html` serves `index.html`; `GET /api/nope` (logged in) and
   `GET /assets/missing.js` answer JSON 404; static files and `index.html`
   carry the SEC-60 headers. Test owned by Task 5.
4. **Case-insensitive uniqueness under a race (AUTH-06, AUTH-23).** Enforced by
   a database unique index on `lower(username)`, so two concurrent sign-ups as
   `Alice` and `alice` cannot both succeed; the losing insert maps to 409.
   Test owned by Task 1.
5. **Production behind Caddy reporting `http` (SEC-09).** Login succeeds (200)
   but no `Set-Cookie` is sent, and the SPA then shows the login form again
   rather than looping. Server test owned by Task 4.

---

### Task 0: Toolchain fix and workspace bones

Design §3 and the handover require the Windows pnpm problem fixed before
anything is scaffolded. Diagnosis made while writing this plan: from Git
Bash `pnpm --version` prints `12.23.0`, but `cmd /c pnpm --version` fails
with `'"C:\Users\Thoma\AppData\Roaming\npm\\node_modules\pnpm\pnpm"' is not
recognized`. The global `pnpm.cmd` shim points at a file the installed pnpm
no longer has, and the shadcn CLI spawns pnpm through that shim.
`npx shadcn@latest --version` itself works (4.23.0).

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
  `eslint.config.js`, `vitest.workspace.ts`, `.gitignore` additions,
  `compose.dev.yml`, `.env.example`
- Create: `server/package.json`, `server/tsconfig.json`,
  `server/drizzle.config.ts`, `server/src/db/client.ts`,
  `server/src/db/schema.ts` (empty export for now),
  `server/test/db.ts`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Test: `server/src/db/client.test.ts`

**Interfaces:**
- Produces: `createDb(url: string): { db: PostgresJsDatabase<typeof schema>; close(): Promise<void> }`
  in `server/src/db/client.ts`.
- Produces: `server/test/db.ts` exporting
  `getTestDb(): Promise<{ db; close }>` (connects to `TEST_DATABASE_URL`,
  runs migrations once per run) and `resetDb(db): Promise<void>` (truncates
  every app table, `RESTART IDENTITY CASCADE`).
- Produces root scripts: `lint`, `typecheck`, `test`, `test:e2e`, `build`,
  `db:generate` (`drizzle-kit generate`), `db:migrate`.

- [ ] **Step 1: Fix the pnpm shim.** In PowerShell, reinstall pnpm globally
  (`npm install -g pnpm@12.23.0`). Check `cmd /c pnpm --version` and
  `pnpm --version` in PowerShell both print `12.23.0`. If not, try
  `corepack enable pnpm`, then the standalone installer from pnpm.io. Do not
  set `npm_config_user_agent` globally.
- [ ] **Step 2: Prove the shadcn CLI can drive pnpm.** In a scratch directory
  outside the repo, `pnpm create vite@latest probe -- --template react-ts`,
  then `npx shadcn@latest init` choosing `base-nova`, then
  `npx shadcn@latest add button`. Expected: the component file appears and
  its dependencies install with no pnpm spawn error. If it still fails, the
  UI tasks use the fallback: fetch
  `https://ui.shadcn.com/r/styles/base-nova/<name>.json`, write its `files`
  into `app/src/components/ui/`, and `pnpm add` its `dependencies`. Record
  which route works in `docs/decisions.md` (one short entry) and in the
  backlog's first item (mark it done with the date). Delete the scratch
  directory.
- [ ] **Step 3: Write the workspace files.** Packages `@nosh/server`,
  `@nosh/app`, `@nosh/shared`. `compose.dev.yml` runs `postgres:17-alpine`
  on host port 5433 with database `nosh` and `nosh_test`. `.env.example`
  lists every variable from Global Constraints with dev values.
- [ ] **Step 4: Write the failing test** `server/src/db/client.test.ts`:
  `"connects to the test database"` → `await db.execute(sql\`select 1 as one\`)`
  returns a row with `one === 1`.
- [ ] **Step 5: Run it.** `docker compose -f compose.dev.yml up -d`, then
  `pnpm --filter @nosh/server test`. Expected: FAIL (`createDb` not defined).
- [ ] **Step 6: Implement `createDb` and the test helpers.**
- [ ] **Step 7: Run `pnpm lint && pnpm typecheck && pnpm test`.** Expected: PASS.
- [ ] **Step 8: Commit** `chore: workspace, Postgres dev compose, db client`.

---

### Task 1: Auth fit check — `AuthService` contract, password module, first migration

Design §6 and the handover make this the first real task, test first. The
contract tests below define what any auth implementation must do; they are
the fit check.

**What "clean" means.** Better Auth is kept only if it passes every contract
test using public options alone: no patched internals, no forked plugin, no
synthetic stored values. A placeholder email such as `alice@nosh.invalid`
is a synthetic stored value and fails AUTH-23 ("new accounts have none").
Better Auth's v1.7 docs state that it "currently requires an email address on
every user record", so expect the fallback. If it is not clean, implement
the hand-rolled service against the same tests and record the reason in
`docs/decisions.md`. Design §6 already approves this fallback; it does not
need the owner.

**If Better Auth is kept**, three rules apply in later tasks: never mount
`auth.handler` on a catch-all route (it would expose `/sign-up/email` and
bypass `ALLOW_SIGNUP`); call `auth.api.*` only from our own routes; disable
its rate limiter and its origin/CSRF check (ours own SEC-01 to SEC-05 and
SEC-16 to SEC-20). The cookie is still set by our routes (Task 4).

**Files:**
- Create: `server/src/auth/password.ts`, `server/src/auth/service.ts`
  (interface + `createAuthService`), `server/src/db/schema.ts` (users,
  sessions), `server/drizzle/0000_*.sql` (generated)
- Create: `server/test/fixtures/v1-account.ts`
- Test: `server/src/auth/password.test.ts`,
  `server/src/auth/service.contract.test.ts`
- Modify: `docs/decisions.md`

**Interfaces:**
- Consumes: `createDb`, `getTestDb`, `resetDb` (Task 0).
- Produces in `server/src/auth/password.ts`:
  `hashPassword(password: string): Promise<string>`,
  `verifyPassword(hash: string, password: string): Promise<boolean>`
  (never throws on a malformed hash; returns false),
  `verifyAgainstDummy(password: string): Promise<false>` (does one real argon2
  verify against a hash computed once at module load, for SEC-19 timing).
  Library: `argon2` (the same library and defaults as v1: argon2id).
- Produces in `server/src/auth/service.ts`:

  ```ts
  export interface AuthUser { id: string; username: string }
  export interface IssuedSession { user: AuthUser; token: string; expiresAt: Date }
  export interface AuthService {
    signUp(input: { username: string; password: string }):
      Promise<IssuedSession | { error: "username_taken" }>;
    logIn(input: { username: string; password: string }):
      Promise<IssuedSession | null>;            // null = bad credentials
    logOut(token: string): Promise<void>;       // unknown token is a no-op
    getSession(token: string): Promise<{ user: AuthUser; expiresAt: Date } | null>;
  }
  export function createAuthService(deps: {
    db: Db; sessionSecret: string; now?: () => Date;
  }): AuthService;
  export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  ```

  `signUp` does not validate format (Task 4 does, AUTH-03); it stores the
  username as given (already trimmed). `logIn` matches the username
  case-insensitively and returns the username as stored. `logIn` for an
  unknown username calls `verifyAgainstDummy` so both failures cost one
  argon2 verify. It does not add the one-second delay (Task 4 does).
- Produces (hand-rolled schema; Better Auth's own tables replace it if kept):
  `users(id uuid pk default gen_random_uuid(), username text not null,
  email text null unique, password_hash text not null, created_at timestamptz
  not null default now())` with `unique index users_username_lower_idx on
  users (lower(username))`; `sessions(id text pk, user_id uuid not null
  references users on delete cascade, expires_at timestamptz not null,
  created_at timestamptz not null default now())`. The session `id` stored is
  `HMAC-SHA256(sessionSecret, token)` in hex; the raw token
  (32 random bytes, base64url) exists only in the cookie. This gives
  `SESSION_SECRET` (SEC-57) a real job.

- [ ] **Step 1: Make the v1 fixture.** Look up v1's hashing on `legacy`
  (`git show legacy:backend/src/routes/auth.ts`: `argon2.hash(password)` with
  library defaults, `argon2@^0.45`). Generate one hash of a known password
  with those defaults and commit it as
  `export const V1_ACCOUNT = { username: "Owner_1", email: "owner@example.com",
  password: "known-pass", passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$…" }`.
  The hash must be literal in the file, not computed at test time.
- [ ] **Step 2: Write the failing password tests** (`password.test.ts`):
  - `"AUTH-08: a v1 argon2id hash verifies with the right password"` →
    `verifyPassword(V1_ACCOUNT.passwordHash, "known-pass")` is `true`.
  - `"AUTH-08: the wrong password is refused"` → `false`.
  - `"a malformed hash is refused, not thrown"` → `verifyPassword("nope", "x")`
    resolves `false`.
  - `"hashPassword output verifies"` → round trip `true`, and the hash starts
    with `$argon2id$`.
- [ ] **Step 3: Write the failing contract tests** (`service.contract.test.ts`),
  each against a fresh `resetDb`:
  - `"AUTH-01 AUTH-23: sign-up needs only username and password and stores no email"`
    → `signUp({ username: "alice", password: "pw" })` returns a session;
    the stored row has `email === null`.
  - `"AUTH-05: a two-character password signs up"` (`"pw"`), and
    `"AUTH-05: a 1,000-character password signs up and logs in"`.
  - `"AUTH-03: a 32-character username is stored as given"`
    (`"a".repeat(32)`).
  - `"AUTH-06: Alice is taken when alice exists"` →
    `{ error: "username_taken" }`, user count stays 1.
  - Review Focus 4: `"AUTH-06: concurrent Alice and alice — exactly one wins"`
    → `Promise.all` of both sign-ups yields one session and one
    `username_taken`.
  - `"AUTH-07: ALICE logs in as alice and gets the stored username"` (sign up
    `Alice`, log in `ALICE`, `user.username === "Alice"`).
  - `"AUTH-10: a stored username that breaks sign-up rules logs in"` →
    insert `john.doe_3` directly with `hashPassword`, `logIn` succeeds.
  - `"AUTH-08: the imported v1 account logs in with its current password"` →
    insert `V1_ACCOUNT` row as-is (its email too), `logIn` with
    `"owner_1"` / `"known-pass"` succeeds; the stored hash is unchanged after.
  - `"AUTH-09: wrong password and unknown username both return null"`.
  - `"AUTH-11 SEC-12: every logIn issues a new token"` → two logins give
    different tokens; both are valid sessions until logged out.
  - `"AUTH-12: a session expires one week after login and is not extended by use"`
    → with `now` stubbed: `expiresAt` = login + `SESSION_TTL_MS`;
    `getSession` at +6 days returns the same `expiresAt`; at +7 days +1 ms
    returns `null`.
  - `"AUTH-13: getSession is null for an unknown token and for a deleted user"`.
  - `"AUTH-14: logOut ends the session"` → `getSession(token)` is `null` after.
  - `"the raw token is not stored"` → no `sessions.id` equals the token.
- [ ] **Step 4: Run them.** `pnpm --filter @nosh/server test src/auth`.
  Expected: FAIL (modules missing).
- [ ] **Step 5: Implement the password module.** Run its tests: PASS.
- [ ] **Step 6: Try Better Auth (timebox: one hour).** Add `better-auth`,
  configure the Drizzle adapter, the `username` plugin (max length ≥ 32, no
  validator at sign-in), `emailAndPassword.password.hash/verify` from the
  password module, `minPasswordLength: 1`, a large `maxPasswordLength`,
  `session.expiresIn` one week with refresh disabled. Wire
  `createAuthService` over `auth.api.*`. Run the contract tests and note
  exactly which fail and why.
- [ ] **Step 7: Decide.** All contract tests pass cleanly → keep Better Auth.
  Otherwise remove `better-auth` and its files, and implement the
  hand-rolled `createAuthService` over the schema above. Either way, write the
  `docs/decisions.md` entry "Auth implementation", dated the day it is
  decided, with the decision, the failing tests that decided it, and a link to this
  plan.
- [ ] **Step 8: Generate the first migration.** `pnpm db:generate`; check the
  SQL contains the `lower(username)` unique index. Run
  `pnpm --filter @nosh/server test src/auth`: all PASS.
- [ ] **Step 9: Lint, typecheck, test, commit**
  `feat(auth): AuthService with argon2 and the first migration`.

---

### Task 2: Config loading and boot guards

**Files:**
- Create: `server/src/config/env.ts`, `server/src/config/origins.ts`
- Test: `server/src/config/env.test.ts`, `server/src/config/origins.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface Config {
    isProduction: boolean; port: number; databaseUrl: string;
    allowedOrigins: string[]; trustedProxies: string[];
    sessionSecret: string; allowSignup: boolean;
    uploadsDir: string; commitSha: string;
  }
  export function loadConfig(env: Record<string, string | undefined>): Config; // throws ConfigError
  export class ConfigError extends Error {}
  export function parseOrigins(raw: string): string[];          // throws ConfigError
  export function parseTrustedProxies(raw: string | undefined): string[];
  ```

  Dev `sessionSecret` falls back to the fixed string `"dev-only-session-secret"`.
  `commitSha` defaults to `"dev"`.

- [ ] **Step 1: Write the failing tests.**
  - `origins.test.ts`, SEC-51: `" https://a.example , http://localhost:5173/ "`
    → `["https://a.example", "http://localhost:5173"]`;
    `"https://a.example:443"` throws a message containing
    `https://a.example` (the correct spelling); `"https://a.example/api"`
    throws; `"a.example"` throws; `""` throws.
  - `env.test.ts`:
    - SEC-56: no `DATABASE_URL` → throws `"Missing required environment variable: DATABASE_URL"`.
    - SEC-52: production without `ALLOWED_ORIGINS` → throws a message naming
      `ALLOWED_ORIGINS`.
    - SEC-53: production without `TRUSTED_PROXIES` → throws a message naming
      `TRUSTED_PROXIES`; `parseTrustedProxies("172.20.0.2, 172.20.0.3")` →
      both; `parseTrustedProxies("")` → `[]`; a CIDR such as
      `172.20.0.0/16` throws (exact addresses only).
    - SEC-57: production without `SESSION_SECRET` → throws a message naming
      `SESSION_SECRET`.
    - SEC-58: `ALLOW_SIGNUP` unset, `""`, `"TRUE"`, `"1"`, `"yes"` → `false`;
      `"true"` → `true`.
    - SEC-54: dev with only `DATABASE_URL` → origins
      `["http://localhost:5173"]`, `trustedProxies []`, `port 3001`,
      `uploadsDir "uploads"`.
    - Production with everything set → a full `Config`.
- [ ] **Step 2: Run** `pnpm --filter @nosh/server test src/config`: FAIL.
- [ ] **Step 3: Implement** with zod for the env object.
- [ ] **Step 4: Run**: PASS. Lint, typecheck.
- [ ] **Step 5: Commit** `feat(server): config loading with boot guards`.

---

### Task 3: Request context, rate limiter, and the hardened app factory

**Files:**
- Create: `server/src/http/clientInfo.ts`, `server/src/http/rateLimit.ts`,
  `server/src/http/originCheck.ts`, `server/src/http/errors.ts`,
  `server/src/http/securityHeaders.ts`, `server/src/http/requestLog.ts`,
  `server/src/app.ts`
- Test: `server/src/http/clientInfo.test.ts`, `server/src/http/rateLimit.test.ts`,
  `server/src/app.security.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 2).
- Produces in `clientInfo.ts`:
  `resolveClient(input: { peer: string; headers: Headers; trustedProxies: string[]; socketIsTls: boolean }): { ip: string; isHttps: boolean }`.
  From a trusted peer: `ip` = rightmost non-empty entry of
  `X-Forwarded-For` (else the peer), `isHttps` = `X-Forwarded-Proto === "https"`.
  From any other peer: `ip` = peer, `isHttps` = `socketIsTls`.
  IPv4-mapped peers (`::ffff:172.20.0.2`) compare equal to their IPv4 form.
- Produces in `rateLimit.ts`:

  ```ts
  export class FixedWindowLimiter {
    constructor(opts: { limit: number; windowMs: number; now?: () => number });
    hit(key: string): { ok: true } | { ok: false; retryAfterSec: number };
    blocked(key: string): number | null;   // retryAfterSec if at limit, without counting
    reset(key: string): void;
  }
  export function tooMany(c: Context, retryAfterSec: number): Response; // 429 + Retry-After
  ```

- Produces in `app.ts`:

  ```ts
  export interface AppDeps {
    config: Config; auth: AuthService;
    getPeer?: (c: Context) => string;        // default: getConnInfo(c).remote.address
    failureDelayMs?: number;                 // default 1000 (Task 4)
    webDistDir?: string;                     // Task 5
  }
  export type AppEnv = { Variables: { client: { ip: string; isHttps: boolean }; user?: AuthUser; sessionToken?: string } };
  export function createApp(deps: AppDeps): Hono<AppEnv>;
  export type AppType = ReturnType<typeof createApp>;
  ```

  Middleware order: request log → security headers → client info → origin
  check → body limit (100 KB on `/api/*`) → routes; `onError` and
  `notFound` from `errors.ts`. `GET /health` → 200 `{"status":"ok"}`.
  The request log writes one line per request: method, path (no query
  string), status, client IP, duration. It is how the deploy task checks
  Caddy's `X-Forwarded-For` behaviour.

- [ ] **Step 1: Write the failing unit tests.**
  - `clientInfo.test.ts`: SEC-13 trusted peer with `X-Forwarded-For:
    203.0.113.9` → that IP; Review Focus 2: trusted peer with
    `6.6.6.6, 203.0.113.9` → `203.0.113.9`; untrusted peer with
    `X-Forwarded-For` → the peer; empty `trustedProxies` → always the peer;
    `::ffff:` peer matching an IPv4 trusted entry is trusted. SEC-14:
    `X-Forwarded-Proto: https` believed only from the trusted peer.
  - `rateLimit.test.ts` (SEC-16): limit 3 → three `ok`, fourth
    `{ ok: false, retryAfterSec }` with the whole seconds left (≥ 1);
    after the window a key starts afresh; keys are independent; `reset`
    clears; `blocked` does not count.
- [ ] **Step 2: Write the failing app tests** (`app.security.test.ts`, using
  `app.request()` with a stub `AuthService` and `getPeer` reading a test
  header):
  - SEC-01: POST `/api/auth/logout` with `Origin` each of the two allowed
    values → 204.
  - SEC-02: `https://evil.example`, `https://x.nosh.itsthomassito.com`,
    `http://nosh.itsthomassito.com`, `https://nosh.itsthomassito.com:443`,
    `null` → 403 `{"error":"Request origin not allowed"}`.
  - SEC-03: no `Origin`, `Sec-Fetch-Site` `same-origin`/`none` → passes;
    `cross-site`/`same-site` → 403.
  - SEC-04: neither header → passes.
  - SEC-05: PUT/PATCH/DELETE with a foreign origin → 403; GET `/health` with
    a foreign origin → 200.
  - SEC-06: any response to a request with `Origin` has no
    `Access-Control-*` header.
  - SEC-23: GET `/health` → 200 body exactly `{"status":"ok"}`.
  - SEC-26: POST `/api/auth/login` with body `{not json` → 400
    `{"error":"Invalid request"}`, body does not contain `not json`.
  - SEC-27: 101 KB JSON → 413 `{"error":"Request body too large"}`.
  - SEC-29: a test-only route registered on the returned app that throws
    `new Error("/secret/path boom")` → 500 `{"error":"Internal server error"}`,
    body without `/secret/path`.
  - SEC-30: no `X-Powered-By` on any response.
  - SEC-60: `/health`, a 403, a 404 and a 500 all carry
    `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`,
    and no `Content-Security-Policy`.
- [ ] **Step 3: Run** `pnpm --filter @nosh/server test src/http src/app`: FAIL.
- [ ] **Step 4: Implement** the modules and `createApp`. Auth routes are
  stubs returning 204 for logout in this task, replaced in Task 4.
- [ ] **Step 5: Run**: PASS. Lint, typecheck.
- [ ] **Step 6: Commit** `feat(server): origin check, client IP, rate limiter, error shape, headers`.

---

### Task 4: Auth routes, session cookie, rate limits, `requireAuth`

**Files:**
- Create: `shared/src/auth.ts`, `server/src/auth/routes.ts`,
  `server/src/auth/cookie.ts`, `server/src/auth/requireAuth.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/auth/routes.test.ts`, `server/src/auth/cookie.test.ts`

**Interfaces:**
- Consumes: `AuthService`, `SESSION_TTL_MS` (Task 1), `Config` (Task 2),
  `FixedWindowLimiter`, `tooMany`, `AppEnv`, `createApp` (Task 3).
- Produces in `shared/src/auth.ts` (zod):
  `signUpBody` (`username`: trimmed, min 3 "Username must be at least 3
  characters", max 32 "Username must be at most 32 characters", regex
  `^[A-Za-z0-9_]+$` "Username can only contain letters, numbers, and
  underscores"; `password`: min 1 "Password is required"),
  `logInBody` (`username` trimmed min 1 "Username is required"; `password`
  min 1 "Password is required"), `type AuthUserDto = { id: string; username: string }`.
- Produces in `cookie.ts`: `sessionCookieName(isProduction: boolean)` →
  `"__Host-nosh.sid"` or `"nosh.sid"`;
  `setSessionCookie(c, token, expiresAt, config)` (does nothing in production
  when `c.var.client.isHttps` is false); `clearSessionCookie(c, config)`;
  `readSessionToken(c, config): string | undefined`.
  Attributes: HttpOnly, SameSite=Lax, Path=/, no Domain, `Expires` =
  `expiresAt`, Secure in production.
- Produces routes (all under `/api/auth`):
  - `POST /signup`: `allowSignup` false → 403 `"Sign-ups are disabled on this server"`;
    then signup limiter (per IP, 5 / 1 h, counts every attempt); then
    validate (400 with the first zod message); then `signUp` (409
    `"Username already taken"`); then cookie; 201 `AuthUserDto`.
  - `POST /login`: validate (400, not counted, no delay); IP limiter
    (20 / 15 min) `hit`; account limiter (10 / 15 min, key
    `username.toLowerCase()`) `blocked` → 429; `logIn`; on null: account
    `hit`, wait `failureDelayMs`, 401 `"Invalid username or password"`; on
    success: account `reset`, cookie, 200 `AuthUserDto`.
  - `POST /logout`: `logOut` if a token is present; clear cookie; 204.
  - `GET /me`: 200 `AuthUserDto` or 401 `"Not authenticated"`.
- Produces `requireAuth` on every `/api/*` route except the four above; it sets
  `c.var.user` and `c.var.sessionToken`, else 401 `"Not authenticated"`.
  `/health` stays outside `/api`.

- [ ] **Step 1: Write the failing tests** (`routes.test.ts`, real Postgres via
  `getTestDb`, real `AuthService`, `failureDelayMs: 0` except where timing is
  tested, `getPeer` from a test header):
  - AUTH-01: signup on → 201 `{id, username}`, `Set-Cookie` present, then
    `/me` with that cookie → 200 same user. Body has no `password`,
    `passwordHash` or `email` keys.
  - AUTH-02 SEC-15: signup off → 403, no `Set-Cookie`, user count 0, later
    login with those credentials → 401; an existing user still logs in.
  - AUTH-03: `"ab"`, `"a".repeat(33)`, `"bad name!"` → 400 with each exact
    message; `"  alice  "` is stored as `"alice"`.
  - AUTH-05: `"pw"` → 201; `""` → 400 `"Password is required"`.
  - AUTH-06: `Alice` when `alice` exists → 409 `"Username already taken"`, no cookie.
  - AUTH-07: login `ALICE` → 200 `{ username: "alice" }` as stored.
  - AUTH-09 SEC-19: wrong password and unknown username → 401 with
    byte-identical bodies; with `failureDelayMs: 1000` both take ≥ 1000 ms.
  - AUTH-10: missing or blank username, missing password → 400, no delay;
    stored `john.doe_3` logs in.
  - AUTH-11 SEC-12: a request that already carries a session cookie and logs
    in gets a different token in `Set-Cookie`.
  - AUTH-13: `/me` without a cookie, and with the cookie of a deleted user →
    401 `"Not authenticated"`.
  - AUTH-14 SEC-10: logout → 204 with a clearing cookie; `/me` with the old
    cookie → 401.
  - AUTH-15 SEC-23: `GET /api/anything` without a session → 401
    `"Not authenticated"`; with a session → 404 `{"error":"Not found"}`
    (SEC-28).
  - SEC-17: 20 logins from IP A (bad password, different usernames) → the
    21st → 429 with `Retry-After`; IP B → not 429; 400s do not count.
  - SEC-18: 10 failures for `alice` spread over 10 IPs → the 11th, with the
    right password → 429, positive `Retry-After`; a success after 9 failures
    resets the count.
  - SEC-20: signup on, 5 attempts from one IP (valid or not) → 6th 429;
    signup off → 403 even after 10 attempts.
  - SEC-13 through the app: from the trusted peer, `X-Forwarded-For` of two
    different clients gives two separate login buckets; from an untrusted
    peer the header is ignored (spoofing it does not reset the bucket).
- [ ] **Step 2: Write the failing cookie tests** (`cookie.test.ts` through the
  app):
  - SEC-07 AUTH-12: dev login → `nosh.sid`, HttpOnly, SameSite=Lax, Path=/,
    no Domain, `Expires` one week out.
  - SEC-08: production config, trusted peer, `X-Forwarded-Proto: https` →
    `__Host-nosh.sid`, Secure, Path=/, no Domain.
  - SEC-09 (Review Focus 5): production, trusted peer reporting `http` → 200,
    no `Set-Cookie`; untrusted peer claiming `https` → 200, no `Set-Cookie`.
  - SEC-10: production logout → clearing cookie named `__Host-nosh.sid` with
    Secure and Path=/.
  - SEC-11: dev cookie has no Secure flag.
- [ ] **Step 3: Run** `pnpm --filter @nosh/server test src/auth`: FAIL.
- [ ] **Step 4: Implement** schemas, cookie helpers, routes and
  `requireAuth`; mount them in `createApp`. Build the routes with chained
  Hono calls so `AppType` carries their types for the RPC client.
- [ ] **Step 5: Run**: PASS. Lint, typecheck.
- [ ] **Step 6: Commit** `feat(auth): signup, login, logout, me with cookie and rate limits`.

---

### Task 5: Boot, migrations on start, and SPA serving

**Files:**
- Create: `server/src/main.ts`, `server/src/http/spa.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/http/spa.test.ts`, `server/src/main.test.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 2), `createDb` (Task 0), `createAuthService`
  (Task 1), `createApp` (Task 3).
- Produces: `main.ts` loads config (exits with code 1 and the
  `ConfigError` message on failure), runs Drizzle `migrate()` from
  `server/drizzle`, builds the app and listens on `config.port`. Exports
  `start(env): Promise<{ close(): Promise<void> }>` for the test.
- Produces: `spa.ts` `mountSpa(app, webDistDir)`: files under `webDistDir`
  served as-is (`/assets/*` with `Cache-Control: public, max-age=31536000,
  immutable`); a GET or HEAD whose path is not under `/api/` or `/health` and
  whose `Accept` includes `text/html` gets `index.html` with
  `Cache-Control: no-cache`; everything else falls to the JSON 404.

- [ ] **Step 1: Write the failing tests.**
  - `spa.test.ts` with a temp dist dir holding `index.html` and
    `assets/app.js` (Review Focus 3): `GET /` and `GET /recipes/abc`
    (`Accept: text/html`) → `index.html`; `GET /assets/app.js` → the file
    with the immutable header; `GET /assets/missing.js` → 404 JSON;
    `GET /api/nope` without a session → 401 JSON (never `index.html`);
    SEC-60 headers on `index.html` and on `app.js`.
  - `main.test.ts`: SEC-57 `start({ NODE_ENV: "production", … no SESSION_SECRET })`
    rejects with the message naming `SESSION_SECRET`; with a full dev env and
    `TEST_DATABASE_URL` it starts, `GET /health` over real HTTP → 200, and
    `close()` stops it.
- [ ] **Step 2: Run**: FAIL. **Step 3: Implement.** **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `feat(server): boot with migrations and serve the SPA`.

---

### Task 6: App scaffold and style tokens

**Files:**
- Create: `app/` via Vite React-TS template, then `app/vite.config.ts`
  (React, Tailwind v4, TanStack Router plugin, dev proxy `/api` and
  `/health` → `http://localhost:3001`, `define` of `import.meta.env.VITE_COMMIT_SHA`),
  `app/components.json` (shadcn `base-nova`), `app/src/styles/tokens.css`,
  `app/src/styles/index.css`, `app/src/lib/motion.ts`, `app/src/lib/utils.ts`
- Test: `app/src/styles/tokens.test.ts`, `app/src/lib/motion.test.ts`,
  `app/vitest.config.ts` (jsdom, Testing Library setup)

**Interfaces:**
- Produces CSS custom properties in `tokens.css` (light under `:root`,
  dark under `@media (prefers-color-scheme: dark)`), mapped to shadcn's
  names: `--background` (paper), `--card`, `--foreground` (ink),
  `--primary` (ink; dark: chalk), `--primary-foreground`, `--accent`
  (bright mustard), `--ring` (bright mustard), `--highlight` (mustard), plus
  `--font-display: "DM Serif Display"` and `--font-sans: "DM Sans Variable"`.
  Exact light values from Global Constraints; dark from §7.
- Produces in `motion.ts`:
  `export const spring = { type: "spring", stiffness: 420, damping: 34 } as const;`
  `export const easeOut = [0.22, 1, 0.36, 1] as const;`
- Fonts come from `@fontsource/dm-serif-display` (400 only) and
  `@fontsource-variable/dm-sans`, self-hosted (works offline for the PWA,
  no third-party font request). Headings use `font-display` with
  `font-weight: 400` and `font-synthesis: none`.

- [ ] **Step 1: Scaffold** `app/` with Vite, Tailwind v4 and shadcn init
  (`base-nova`) using the route Task 0 recorded. Remove the template's demo
  content. Add `button` and `input` now (Task 7 needs them).
- [ ] **Step 2: Write the failing tests.**
  - `tokens.test.ts`: parse `tokens.css`; the light values equal the Global
    Constraints values exactly; with `culori`'s `wcagContrast`, ink on paper,
    ink on card, chalk on dark paper and chalk on dark card are ≥ 4.5; the
    active-pill pairs (chalk on ink light, ink on chalk dark) are ≥ 4.5.
    Cite PWA-32 and design §7.
  - `motion.test.ts`: the two constants equal the design §7 values.
- [ ] **Step 3: Run** `pnpm --filter @nosh/app test`: FAIL.
- [ ] **Step 4: Write `tokens.css`, `index.css`, `motion.ts`.** Adjust dark
  values only if a contrast test fails, and note the final values in
  `docs/decisions.md`.
- [ ] **Step 5: Run**: PASS. `pnpm --filter @nosh/app build` succeeds.
- [ ] **Step 6: Commit** `feat(app): scaffold with P4 tokens, fonts and motion constants`.

---

### Task 7: Client auth — API client, session query, login and sign-up screens

**Files:**
- Create: `app/src/lib/api.ts`, `app/src/auth/session.ts`,
  `app/src/auth/redirect.ts`, `app/src/components/PasswordInput.tsx`,
  `app/src/components/AuthLayout.tsx`, `app/src/routes/__root.tsx`,
  `app/src/routes/login.tsx`, `app/src/routes/signup.tsx`,
  `app/src/routes/_app.tsx` (protected layout, Task 8 fills it),
  `app/src/main.tsx`, `app/test/msw.ts`
- Test: `app/src/auth/redirect.test.ts`, `app/src/components/PasswordInput.test.tsx`,
  `app/src/routes/login.test.tsx`, `app/src/routes/signup.test.tsx`,
  `app/src/routes/_app.test.tsx`

**Interfaces:**
- Consumes: `AppType` (Task 4, type-only import from `@nosh/server`),
  `signUpBody`, `AuthUserDto` (Task 4, `@nosh/shared`), tokens and `button`,
  `input` (Task 6).
- Produces: `api = hc<AppType>("/")` in `api.ts`, and
  `ApiError extends Error { status: number }` thrown for non-2xx with the
  server's `error` message (or `"Something went wrong"` when there is none).
- Produces in `session.ts`: `sessionQuery` (`queryKey: ["session"]`, fetches
  `/api/auth/me`, resolves `AuthUserDto | null`; 401 and any failure,
  including network errors, resolve `null`: AUTH-17), `useLogIn()`,
  `useSignUp()`, `useLogOut()` mutations that set or clear `["session"]`.
- Produces in `redirect.ts`: `safeRedirect(value: unknown): string` returns
  the value only if it is a string starting with `/` and not `//` or `/\`,
  else `"/"`.
- Produces: `_app.tsx` `beforeLoad` awaits `sessionQuery`; `null` →
  `redirect({ to: "/login", search: { redirect: location.href } })` where
  `href` is path + query + hash. While pending the router shows a
  `role="status"` element labelled "Loading". Login and sign-up redirect to
  `safeRedirect(search.redirect)` on success.

- [ ] **Step 1: Write the failing tests** (Testing Library + MSW):
  - `redirect.test.ts` (AUTH-16, Review Focus 1): `"/recipes/new?importId=5#x"`
    kept; `"//evil.example"`, `"/\\evil.example"`, `"https://evil.example"`,
    `undefined`, `42` → `"/"`.
  - `PasswordInput.test.tsx` (AUTH-19): `type="password"` by default; the
    button "Show password" reveals and is relabelled "Hide password"; again
    hides; `onChange` fires with each typed value.
  - `login.test.tsx`: AUTH-07 fields "Username" and "Password", no email;
    submits the typed values. AUTH-18 the button reads "Logging in…" and is
    disabled while pending; a 401 shows "Invalid username or password" in a
    `role="alert"` that has focus; a network error shows "Something went
    wrong"; a "Sign up" link exists ("No account? Sign up"). AUTH-20
    `autocomplete` is `username` and `current-password`. AUTH-16 success with
    `?redirect=/recipes/new?importId=5` navigates there; without, to `/`.
  - `signup.test.tsx`: AUTH-01 fields username and password only, success
    lands on `/`; AUTH-18 "Creating account…", the hint "Letters, numbers, and
    underscores only.", `minLength=3` `maxLength=32`, link to login; a 403
    shows "Sign-ups are disabled on this server" in the alert; AUTH-20
    `autocomplete` `username` and `new-password`.
  - `_app.test.tsx`: AUTH-17 while `/me` is pending, "Loading" is shown and
    neither the form nor protected content; `/me` 200 → protected content;
    `/me` 401 and a network error → login page. AUTH-16 a logged-out visit to
    `/recipes/new?importId=5` lands on login with that full redirect; an
    unknown path when logged in shows the library.
- [ ] **Step 2: Run** `pnpm --filter @nosh/app test`: FAIL.
- [ ] **Step 3: Implement.** Screens follow §7 (DM Serif Display title on
  chalk, ink primary button, bright-mustard focus ring), built from the shadcn
  `button` and `input`.
- [ ] **Step 4: Run**: PASS. Lint, typecheck.
- [ ] **Step 5: Commit** `feat(app): login and sign-up with session-guarded routes`.

---

### Task 8: App shell — bottom pill, settings icon, Settings account section

**Files:**
- Create: `app/src/components/AppNav.tsx`, `app/src/components/SettingsLink.tsx`,
  `app/src/routes/_app/index.tsx` (Library placeholder),
  `app/src/routes/_app/settings.tsx`, `app/src/lib/version.ts`
- Modify: `app/src/routes/_app.tsx`
- Test: `app/src/components/AppNav.test.tsx`,
  `app/src/routes/_app/settings.test.tsx`, `app/src/lib/version.test.ts`

**Interfaces:**
- Consumes: `useLogOut`, `sessionQuery` (Task 7), `spring` (Task 6).
- Produces: `AppNav` — a floating bottom pill with one "Library" option
  (icon + label, ink active pill animated with `spring` via Motion
  `layoutId`) and a round bright-mustard "+" button (`aria-label="New recipe
  or import"`, no action yet; the recipes and import plans wire it).
  `SettingsLink` — an icon link top-right, `aria-label="Settings"`. The
  `_app` layout renders both; later plans hide `AppNav` on the recipe page.
- Produces in `version.ts`: `appVersion(sha: string | undefined): { short: string; full: string }`
  → `{ short: sha.slice(0, 7), full: sha }` for a real SHA, `{ short: "dev", full: "dev" }`
  otherwise.

- [ ] **Step 1: Write the failing tests.**
  - `AppNav.test.tsx` (AUTH-24): from the Library and from Settings there is
    one link to `/` and one link to `/settings`; the "+" button is present.
  - `settings.test.tsx` (AUTH-21, AUTH-14): shows the username in an
    "Account" section (with `truncate` styling); "Log out" calls
    `/api/auth/logout` and navigates to `/login`; if logout fails the page
    stays and shows nothing new; the version at the bottom shows the short
    SHA with the full SHA in its `title`.
  - `version.test.ts`: a 40-character SHA → 7-character short; `undefined`
    and `""` → `"dev"`.
- [ ] **Step 2: Run**: FAIL. **Step 3: Implement** in the §7 style.
  **Step 4: Run**: PASS. Lint, typecheck.
- [ ] **Step 5: Look at it.** Add a `nosh-dev` entry to `.claude/launch.json`
  (server on 3001 + Vite on 5173), open it in the browser pane at phone
  width (375×812) in light and dark, and compare with the style prototype
  (`style-spike`, round 7). Fix anything that looks like stock shadcn.
- [ ] **Step 6: Commit** `feat(app): app shell with bottom pill and settings account section`.

---

### Task 9: End-to-end login through the one-container server

**Files:**
- Create: `playwright.config.ts`, `e2e/auth.spec.ts`, `e2e/global-setup.ts`

**Interfaces:**
- Consumes: the built SPA (`pnpm build`) and `server/src/main.ts` (Task 5).
- `playwright.config.ts` `webServer` runs `node server/dist/main.js` with
  `PORT=4173`, `DATABASE_URL=$TEST_DATABASE_URL`, `ALLOW_SIGNUP=true`,
  `ALLOWED_ORIGINS=http://localhost:4173`; `global-setup.ts` resets the test
  database. Two projects, both at the `devices["iPhone 13"]` viewport: one on
  Chromium, one on WebKit (closest to the owner's iPhone).

- [ ] **Step 1: Write the failing spec** `e2e/auth.spec.ts`:
  - AUTH-01 AUTH-07 AUTH-14: sign up as `owner`, land on the library, open
    Settings, see `owner`, log out, land on login, log in as `OWNER`, land on
    the library.
  - AUTH-16: logged out, open `/settings?x=1#top`, get the login form, log in,
    land on `/settings?x=1#top`.
  - AUTH-09: wrong password shows "Invalid username or password".
  - SEC-60 and SEC-30 on the document response: `nosniff`,
    `Referrer-Policy: same-origin`, no `X-Powered-By`.
- [ ] **Step 2: Run** `pnpm build && pnpm test:e2e`: FAIL until wiring is
  right, then fix wiring only (behaviour is already tested).
- [ ] **Step 3: Run**: PASS on Chromium and WebKit.
- [ ] **Step 4: Commit** `test(e2e): login end to end through the built server`.

---

### Task 10: Dockerfile with yt-dlp

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Test: `e2e/docker.smoke.sh` (run by CI, Task 11)

**Interfaces:**
- Image: build stage `node:22-alpine` (`corepack enable`,
  `pnpm install --frozen-lockfile`, `pnpm build` with build arg
  `COMMIT_SHA` passed to the app build); runtime stage `node:22-alpine` with
  `NODE_ENV=production`, `apk add --no-cache yt-dlp` (same source v1 used,
  as the `legacy` Dockerfile shows), production dependencies only, the
  server's `dist`, `server/drizzle`, the app's `dist`, `USER node`,
  `EXPOSE 3001`, `HEALTHCHECK` on `/health`, `CMD ["node", "server/dist/main.js"]`.
  `UPLOADS_DIR=/data/uploads` owned by `node`.

- [ ] **Step 1: Write the smoke script.** It builds the image, starts it with
  a Postgres container on a throwaway network and production env
  (`TRUSTED_PROXIES` = an unused address, a random `SESSION_SECRET`,
  `ALLOWED_ORIGINS=https://example.test`), then checks: `GET /health` →
  `{"status":"ok"}`; `GET /` → HTML with `nosniff`; `docker exec … yt-dlp
  --version` prints a version; the same container started without
  `SESSION_SECRET` exits non-zero and its log names `SESSION_SECRET`
  (SEC-57).
- [ ] **Step 2: Run it**: FAIL (no Dockerfile).
- [ ] **Step 3: Write the Dockerfile.** **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `build: one-container Dockerfile with yt-dlp`.

---

### Task 11: CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/claude-build.yml`

**Interfaces:**
- `ci.yml` on pull requests and pushes to `main`: job `check` (Node 22,
  pnpm from `packageManager`, Postgres 17 service with database `nosh_test`,
  `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm build`, Playwright browsers, `pnpm test:e2e`); job
  `image` (needs `check`): run `e2e/docker.smoke.sh`; on push to `main` only,
  log in to GHCR and push `ghcr.io/thomasokvs/nosh:<sha>` and
  `ghcr.io/thomasokvs/nosh:main`. No other image name.
- `claude-build.yml`: replace `pnpm --filter backend migrate up` with
  `pnpm db:migrate`; replace the `docs/index.md` references in its prompt
  with `CLAUDE.md` and `docs/superpowers/specs/nosh-v2/index.md`; drop the
  "per CLAUDE.md's Teaching section" wording (there is none now). Leave its
  permissions and guards as they are.

- [ ] **Step 1: Write both files.**
- [ ] **Step 2: Check them locally.**
  `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest` reports
  no errors for either file. `grep -n "nosh-frontend\|nosh-backend" .github/workflows/*.yml`
  prints nothing.
- [ ] **Step 3: Commit** `ci: lint, test, e2e and image build for the skeleton`.
- [ ] **Step 4: Ask the owner** to push the branch and open the PR. CI must
  pass on the PR before merge. Merge only on the owner's yes.

---

### Task 12: Deploy alongside v1 and write `docs/deployment.md`

Every step that touches the homelab waits for the owner's yes at that
moment. `ssh homelab` is read-only unless the owner says otherwise for a
specific command.

**Files:**
- Create: `docs/deployment.md`, `deploy/compose.yml` (the Dockge stack, no
  secrets), `deploy/Caddyfile.snippet`
- Modify: `docs/backlog.md`, `docs/decisions.md`

- [ ] **Step 1: Ask the owner** for the hostname (suggested
  `nosh-next.itsthomassito.com`), and whether Caddy can get a fixed address
  on the `proxy` network (SEC-13 needs an exact IP, never a subnet). Read
  Caddy's current address and compose file read-only over SSH, with their yes.
- [ ] **Step 2: Write `deploy/compose.yml`**: service `nosh` from
  `ghcr.io/thomasokvs/nosh:main`, its own Postgres 17 service and volume
  under `/DATA/nosh-v2/` (Kopia covers `/DATA`), uploads bind-mounted at
  `/DATA/nosh-v2/uploads`, joined to the external `proxy` network, env from
  the Dockge `.env` (`DATABASE_URL`, `ALLOWED_ORIGINS=https://<host>`,
  `TRUSTED_PROXIES=<Caddy IP>`, `SESSION_SECRET`, `ALLOW_SIGNUP=false`).
  No Watchtower label until cutover. `deploy/Caddyfile.snippet` routes the
  hostname to `nosh:3001`.
- [ ] **Step 3: With the owner's yes, deploy.** The owner (or the builder
  with explicit permission) creates the stack in Dockge and adds the Caddy
  route. Check `https://<host>/health` → `{"status":"ok"}`.
- [ ] **Step 4: Check Caddy's `X-Forwarded-For` behaviour (SEC-13, SEC-14).**
  `curl -H "X-Forwarded-For: 6.6.6.6" https://<host>/health` from the dev
  machine, then read the request log line (with the owner's yes). Record
  whether Caddy appended (log shows the dev machine's public IP, and the
  header held both) or overwrote. Either way the rightmost entry is right; if
  Caddy overwrote, note it. Also confirm a login over HTTPS sets
  `__Host-nosh.sid` (SEC-08).
- [ ] **Step 5: Create the owner's account.** With the owner's yes, set
  `ALLOW_SIGNUP=true`, the owner signs up, set it back to `false`, and
  confirm `POST /api/auth/signup` answers 403 (SEC-15). (The importer later
  brings the real v1 account.)
- [ ] **Step 6: Write `docs/deployment.md`**: the topology (one container on
  Caddy's `proxy` network, its own Postgres), every env variable and what it
  does, the Caddy route, how to deploy a new image, the XFF finding, and
  rollback ("v1 is untouched; remove the route").
- [ ] **Step 7: Update the docs.** Backlog: move "Skeleton + auth" and
  "Deploy the skeleton" to Completed with the date. Decisions: one entry for
  the deploy topology and the XFF finding.
- [ ] **Step 8: Commit** `docs: deployment of the skeleton next to v1`, and
  ask the owner before pushing.

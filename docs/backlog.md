# Backlog

## Restart (in order, design §8 and §11)

- [ ] Skeleton + auth: one-container build, Drizzle first migration, health
      endpoint, Vitest + Playwright in CI, Dockerfile with yt-dlp, style
      tokens, app shell with bottom pill, login end to end (AUTH, SEC).
      Includes the auth fit check (hand-rolled sessions chosen, see decisions).
- [ ] Deploy the skeleton alongside v1 behind Caddy; write `docs/deployment.md`.
      Check whether Caddy appends to or overwrites `X-Forwarded-For`
      (SEC-13, SEC-14).
- [ ] Recipes
- [ ] Collections
- [ ] Search
- [ ] Units and scaling
- [ ] Import jobs
- [ ] PWA and push
- [ ] Settings
- [ ] One-time importer, test-first against a sanitised dump (design §11).
- [ ] Cutover: run side by side, import, verify, switch Caddy (rollback =
      point Caddy back).

## Fixes

- [ ] Purge expired sessions (and rows left by production logins over plain
      HTTP that set no cookie).
- [ ] `check-spec.test.mjs` fails one case on a Windows checkout
      (`[unclaimed-adr] 2026-02-02: Beta — with dash`, the em-dash fixture).
      Already failing at `legacy-v1`; the checker itself reports `spec OK`.

## After the first release (design §2 non-goals)

- [ ] Recipe notes and ratings
- [ ] Cook mode
- [ ] Grocery lists
- [ ] Nutrition
- [ ] Belgian supermarket integration
- [ ] Dutch-aware search (plus accent-insensitive and partial-word matching)
- [ ] Volume ↔ weight conversion
- [ ] Locale decimals
- [ ] Content-Security-Policy header

## Completed

- 2026-11-24: Restart design approved by the owner.
- 2026-11-24: nosh-v2 spec extracted and approved (9 areas, 330 criteria).
- 2026-11-24: v1 archived as tag `legacy-v1` and branch `legacy`; `main`
  cleared for the restart.
- 2026-11-24: `shadcn` CLI / pnpm problem on Windows fixed; the CLI route works
  (`docs/decisions.md`).

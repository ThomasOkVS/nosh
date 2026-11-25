# Backlog

## Restart (in order, design §8 and §11)

- [ ] Recipes PR2: photo from URL + SSRF guard (waits on the firewall)
- [ ] Collections (incl. REC-31: collection choice on the recipe form and a
      back link to the folder, deferred with COL)
- [ ] Search
- [ ] Units and scaling
- [ ] Import jobs
- [ ] PWA and push
- [ ] Settings
- [ ] One-time importer, test-first against a sanitised dump (design §11).
      Also: make card copies for v1 photos (`card_file_name` is null until
      then); allow only `image/jpeg|png|webp` as `content_type` and plain
      file names; null or repair any `source_url` that fails the shared
      http(s) rule, because otherwise the recipe can't be edited (an edit PUT
      re-sends the stored sourceUrl and the server refuses non-http(s)
      values).
- [ ] Cutover: import v1's data into v2 and verify, then remove the stopped
      v1 stack. (The hostname already moved to v2 on 2026-11-24; v1 is
      stopped with its data kept, see `docs/deployment.md`.)

## Fixes

- [ ] Check Caddy's request body limit on the box allows ~5.1 MB photo
      uploads.
- [ ] On-device check: toast offset under the iPhone status bar
      (safe-area-inset-top).
- [ ] Before import jobs land: add v2's subnet `10.102.0.0/24` to the host
      firewall's `SANDBOX_NETS` (`/opt/HOST.md`), and check which network
      the container's outbound traffic leaves through (it is also on `proxy`).
- [ ] Revisit the Watchtower label on `nosh-v2` before the v1 import brings
      real data (auto-update means unattended migrations).

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
- 2026-11-24: Skeleton + auth built and merged (#31): one-container build,
  Drizzle migrations, health endpoint, CI, app shell, login end to end.
- 2026-11-24: Skeleton deployed at `nosh.itsthomassito.com`, replacing v1
  (stopped, data kept); `docs/deployment.md` written. Caddy overwrites
  `X-Forwarded-For` (SEC-13, SEC-14).
- 2026-11-25: Recipes (core) built: library, recipe page, form, photo upload
  with card copies, tag filter (`docs/decisions.md`).
- 2026-11-25: The empty state fix (owner, 2026-11-24): direction A, "Your
  library is empty", built.

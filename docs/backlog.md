# Backlog

## Restart (in order, design §8 and §11)

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

- [ ] On-device check: toast offset under the iPhone status bar
      (safe-area-inset-top).
- [ ] Close the egress sandbox's `proxy` gap before anything fetches outside
      the app's SSRF guard (yt-dlp, import jobs). Traffic nosh starts on
      `proxy` leaves from an unpinned `172.28.0.x`, outside `SANDBOX_NETS`,
      and reaches the host via `172.28.0.1`. Likely fix: pin nosh-v2's
      `proxy` address (e.g. `172.28.255.3`) and add that /32 to
      `SANDBOX_NETS`. See `docs/deployment.md`, Known gaps.
- [ ] After PR2 merges: copy `deploy/compose.yml` to
      `/opt/nosh-v2/compose.yaml` and recreate the app, so `gw_priority`
      pins outbound traffic to the sandboxed `10.102.0.0/24`.
- [ ] SSRF guard hardening, optional: block `fec0::/10` (deprecated
      site-local, not in SEC-31). The `safeFetch` tests bind `127.0.0.2`,
      which fails on macOS.
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
- 2026-11-26: Recipes PR2: photo from a URL behind the SSRF guard
  (`server/src/net/`), REC-18/REC-19, SEC-31 to SEC-42.
- 2026-11-26: Host firewall sandbox covers v2's `10.102.0.0/24`, proven from
  the container. (`/opt` local commit `a982b6c`; the `proxy` gap is open
  under Fixes.)
- 2026-11-26: Caddy has no request body limit on the nosh route, and
  `/opt/nosh-v2/uploads` is 1000:1000 and writable by the app (checked on
  the box).

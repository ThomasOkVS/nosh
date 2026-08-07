# Documentation

Nosh is a self-hosted, subscription-free recipe manager — and a hands-on
project for the maintainer to learn React, Node.js, and PostgreSQL, a
deliberately different stack from their day job (Angular/Java), chosen for its
relevance in the job market.

## Why

- Existing recipe apps (e.g. Recipe Bro) are subscription-based. Nosh is free,
  self-hosted, and fully owned by the user.
- Secondary goal: learn React, Node.js, and PostgreSQL for the reasons above.

## Who it's for

Single user today. The data model reserves a user/household concept from day
one so multi-user support is a migration, not a rewrite. See
[decisions.md#multi-user-ready-schema](decisions.md#multi-user-ready-schema).

## Scope

### MVP

Manual recipe management only:
- Create, read, update, delete recipes (title, ingredients, steps, photo, tags,
  servings, prep/cook time).
- Search recipes (see [architecture.md#search](architecture.md#search)).
- Full username/password authentication.

### Planned (post-MVP)

Roughly in order of priority, not yet scheduled:
1. Recipe organization — collections, tags-based browsing.
2. Weekly meal planner.
3. Notes & ratings on recipes.
4. Smart unit conversions & recipe scaling.
5. Grocery list generation from planned meals.
6. LLM-based recipe import from URLs, Instagram Reels, and TikTok (extracts
   ingredients, steps, nutrition, photo from messy source content).
7. Nutrition info via an external nutrition database.
8. Grocery list integration with Belgian supermarkets (Colruyt, Albert Heijn, etc.).
9. Native-feeling mobile experience (MVP ships as a responsive PWA).

Rationale and alternatives considered for each stack/scope choice are logged in
[decisions.md](decisions.md).

## Stack at a glance

React + Tailwind (PWA) · Node.js/TypeScript · PostgreSQL · Docker, deployed to a
home server via Dockge, reachable only over Tailscale.

Full details: [architecture.md](architecture.md).

## Contents

- **[architecture.md](architecture.md)** — tech stack, high-level system design,
  data model, repo/folder structure, search/import/auth design. Update this
  whenever a structural decision changes what the system looks like.
- **[decisions.md](decisions.md)** — a running log of notable decisions and the
  reasoning behind them (lightweight ADR style). Append to this; don't rewrite
  history — if a decision is reversed, add a new entry that supersedes the old
  one rather than editing it away.
- **[backlog.md](backlog.md)** — concrete todo items (Backlog) and a dated log
  of what's actually been finished (Completed). Move items from one section to
  the other as work happens; don't just delete finished items.
- **[design-system.md](design-system.md)** — the UI's visual language (color,
  type, shape, motion, component rules). Normative for any UI change — extend
  it first if a change needs a pattern it doesn't already cover.
- **[deployment.md](deployment.md)** — the homelab environment Nosh runs on:
  hardware, OS, container management, monitoring, backups, and update mechanism.
  Also tracks what's genuinely not written yet (Compose file, first-deploy
  runbook) rather than guessing at it early. Maintained by the project owner.
- **[dev-commands.md](dev-commands.md)** — cheat sheet of the commands you
  actually type day to day (running the stack, tests, migrations, demo data,
  troubleshooting). Update it whenever a command changes rather than letting
  it drift.
- **[../CLAUDE.md](../CLAUDE.md)** — lives at the repo root, not in `docs/`, but
  is part of this set: instructions AI coding assistance on this repo must
  follow (workflow, code standards, documentation upkeep).

`../README.md` is just a short landing blurb pointing here — this file is the
actual maintained overview and index; keep new content here, not there.

## Maintenance expectations

These docs are meant to stay accurate for the life of the project, not just at
kickoff:
- When a PR changes architecture, data model, or a major decision, update the
  relevant doc in the same PR.
- Prefer adding a new dated entry in `decisions.md` over silently changing past
  choices — future readers (including future you) need the "why," not just the
  "what."
- If a doc goes stale, fix it or delete the stale section — inaccurate docs are
  worse than no docs.

# <Area name>

## Purpose
Two or three sentences: what this area is for, for the owner.

## Sources
- `backend/src/routes/recipes.ts`
- `backend/src/routes/recipes.test.ts`
(one repo-relative path per bullet, backticked)

## ADRs
- 2026-08-19: Collections added as a first-class concept distinct from tags; tag browsing via a query param
(exact `##` heading text from docs/decisions.md, without the `## ` and without any `{#anchor}`)

## Features
| Feature | Verdict | Why |
|---|---|---|
| Nested collections | keep | … |

## Acceptance criteria

### COL-01 Short title
**Given** … **When** … **Then** …
Cites: `backend/src/routes/collections.test.ts` "test name", ADR 2026-08-28

## Rationale
The *why* behind non-obvious criteria, by ID.

## Tests not carried
- `path` "test name": reason (e.g. tests the planner; tests an implementation detail)

## Open questions for the owner
- Numbered, each with the agent's recommendation.

# nosh v2 spec

The behaviour of the current nosh app, extracted into one Markdown file per
area in the fixed format of [`_template.md`](_template.md). It feeds the
restart; see [the restart design](../2026-11-24-nosh-restart-design.md) for
the stack, scope and project order.

## Areas

| File | Prefix | Purpose | Status |
|---|---|---|---|
| `auth.md` | AUTH | Signup, login, sessions, route protection, user menu | drafted |
| `recipes.md` | REC | Recipe CRUD, ingredients, steps, tags, images, detail and form pages | drafted |
| `collections.md` | COL | Nested collections, breadcrumbs, moving and dragging recipes | drafted |
| `search.md` | SRCH | Full-text library search | drafted |
| `units.md` | UNIT | Scaling, unit conversion, recipe language, ingredient parsing, preferences | drafted |
| `import.md` | IMP | Magic import from URLs and social video, import jobs, LLM use | drafted |
| `settings.md` | SET | Settings page, LLM model choice, usage estimate, recipe preferences | drafted |
| `pwa-push.md` | PWA | Installable PWA, service worker, web push notifications | drafted |
| `security.md` | SEC | Origin check, rate limiting, error handling, SSRF guard, env config | drafted |

## Set aside

Paths and ADR headings claimed by no area, each with a reason. The consistency
pass may move any of these into an area if it hides behaviour (for example
`App.tsx` routes, or toast messages users rely on).

- `backend/src/routes/mealPlan.ts` — planner dropped (design §5)
- `backend/src/routes/mealPlan.test.ts` — planner dropped (design §5)
- `backend/src/validation/mealPlan.ts` — planner dropped (design §5)
- `backend/src/repositories/mealPlan.ts` — planner dropped (design §5)
- `backend/migrations/1700000000011_create-meal-plan-entries.js` — planner dropped (design §5)
- `frontend/src/api/mealPlan.ts` — planner dropped (design §5)
- `frontend/src/pages/MealPlanPage.tsx` — planner dropped (design §5)
- `frontend/src/pages/MealPlanPage.test.tsx` — planner dropped (design §5)
- `frontend/src/components/RecipePickerDialog.tsx` — planner dropped (design §5)
- `frontend/src/components/RecipePickerDialog.test.tsx` — planner dropped (design §5)
- `frontend/src/lib/week.ts` — planner dropped (design §5)
- `frontend/src/lib/week.test.ts` — planner dropped (design §5)
- ADR: 2026-08-28: Weekly meal planner — single ongoing calendar, date-keyed entries, CASCADE on recipe delete — planner dropped (design §5)
- `backend/src/db/pool.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `backend/src/db/transaction.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `backend/src/db/seed.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `backend/src/index.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `backend/src/test/*` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `backend/src/types/express-session.d.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/api/client.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/api/types.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/hooks/useAsync.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/toast/*` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/styles.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/index.css` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/main.tsx` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/vite-env.d.ts` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/App.tsx` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/components/Layout.tsx` — plumbing or superseded by the design doc's style/nav; behaviour captured per area
- `frontend/src/test/*` — plumbing or superseded by the design doc's style/nav; behaviour captured per area

## Shared behaviours

| Behaviour | Areas | Agreed rule |
|---|---|---|

## How to check

`node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`

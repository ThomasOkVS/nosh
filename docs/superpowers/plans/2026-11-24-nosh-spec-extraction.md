# nosh v2 Spec Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn today's nosh (code, tests, 55 ADRs) into an owner-approved,
testable spec for the rewrite, then archive the old code and clear `main`.

**Architecture:** A spec folder `docs/superpowers/specs/nosh-v2/` holds one
Markdown file per area, all in one fixed format. A small dependency-free
checker script enforces that format and coverage: every source file and every
ADR is claimed by an area or explicitly set aside. Nine area files are
extracted in parallel by subagents. A consistency pass and the owner's review
follow. Only after approval are the tag, branch and wipe done.

**Tech Stack:** Markdown; Node 22 built-ins only (`node:test`,
`node:assert`, `node:fs`) for the checker. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-11-24-nosh-restart-design.md](../specs/2026-11-24-nosh-restart-design.md)
(§5 scope, §8 project order and spec format, §9 security floor, §10 lean
docs). Style: [docs/restart/style-log.md](../../restart/style-log.md).

## Global Constraints

- Capture **what nosh does and why**, never how it's built. Criteria must not
  name today's libraries or infrastructure (Express, multer, cheerio,
  node-pg-migrate, connect-pg-simple, express-session, nginx, pg Pool).
- **Meal planner is dropped:** no criteria for it. Its files and ADRs are
  listed as set aside, with the reason "planner dropped (design §5)".
- **Interface is English only.** Recipe *content* is Dutch or English.
- Every feature gets a keep/drop line: `keep`, `drop`, or `owner?` (the agent
  recommends, the owner decides at review).
- Criterion IDs: `<PREFIX>-NN`, two digits, unique across the whole spec,
  never renumbered once the owner has seen them (append; mark removed ones
  `~~struck~~`).
- Security items in design §9 are the floor for the SEC area.
- **Nothing is wiped until the owner approves the spec** (Task 4 is a hard
  gate before Task 5).
- Any push, tag push, PR or production action needs the owner's explicit yes
  in chat at that moment.
- No database dumps or production data enter the repo.
- Worktrees only: work happens in `.claude/worktrees/<name>`, never the main
  checkout.

## Review Focus

1. **Behaviour that lives only in tests.** Edge cases pinned by today's test
   files but invisible from reading the route code (e.g. ingredient-line
   parsing, unit rounding, tag de-duplication) must become criteria. Check:
   Task 2 brief requires every `*.test.ts(x)` in an area's sources to be cited
   by at least one criterion or listed under "Tests not carried" with a reason,
   and Task 1's checker enforces it.
2. **Silent drops.** A feature visible in the UI (e.g. drag-to-collection,
   "notify me" toggle, usage estimate) with no keep/drop line. Check: Task 3
   walks every page and component in `frontend/src` against the keep/drop
   tables.
3. **Implementation leaking into criteria.** Check: checker's banned-words
   rule (Task 1) plus the Task 3 read-through.
4. **Cross-area contradictions**, e.g. "recipes at Home" in COL vs SRCH result
   scope, or import's translation vs UNIT's conversion order. Check: Task 3
   step "shared behaviours" table.
5. **The wipe hitting production or live work.** Clearing `main` must not
   publish a new image (Watchtower would pull it) and must not drop files that
   aren't in `legacy`. Check: Task 5 removes `ci.yml` in the same commit and
   verifies `legacy` == `legacy-v1` == pre-wipe `main` before the wipe commit.

---

## Spec file format (used by every task)

Each area file `docs/superpowers/specs/nosh-v2/<area>.md` has exactly these
`##` sections, in this order:

````markdown
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
````

`index.md` lists the areas (file, prefix, one-line purpose), a
**Set aside** section (paths and ADR headings claimed by no area, each with a
reason) and a **Shared behaviours** table (Task 3).

## Areas, prefixes and starting source assignment

A path may appear in more than one area. Tests next to a listed file
(`x.test.ts`) belong to the same area. The agent may add sources it finds
relevant; the checker catches anything unclaimed.

| Area file | Prefix | Starting sources |
|---|---|---|
| `auth.md` | AUTH | backend: `routes/auth.ts`, `validation/auth.ts`, `repositories/users.ts`, `middleware/requireAuth.ts`, migrations `…0000`, `…0007`; frontend: `api/auth.ts`, `auth/*`, `pages/LoginPage.tsx`, `pages/SignupPage.tsx`, `components/AuthLayout.tsx`, `components/PasswordInput.tsx`, `components/UserMenu.tsx` |
| `recipes.md` | REC | backend: `routes/recipes.ts`, `validation/recipes.ts`, `repositories/recipes.ts`, `services/imageSniff.ts`, `services/imageFromUrl.ts`, migrations `…0001`–`…0005`, `…0008`; frontend: `api/recipes.ts`, `pages/RecipeDetailPage.tsx`, `pages/RecipeFormPage.tsx`, `pages/NewRecipePage.tsx`, `components/IngredientList.tsx`, `AutoGrowTextarea.tsx`, `TagChip.tsx`, `TagInput.tsx`, `RecipeCard.tsx`, `ConfirmDialog.tsx`, `Skeleton.tsx`, `EmptyStateIllustration.tsx` |
| `collections.md` | COL | backend: `routes/collections.ts`, `validation/collections.ts`, `repositories/collections.ts`, `utils/groupBy.ts`, migrations `…0009`, `…0010`, `…0012`; frontend: `api/collections.ts`, `pages/CollectionsPage.tsx`, `components/CollectionBreadcrumb.tsx`, `CollectionSelect.tsx`, `RecipeCollectionPicker.tsx`, `lib/collectionTree.ts`, `lib/recipeDrag.ts`, `hooks/useRecipeDropTargets.ts` |
| `search.md` | SRCH | backend: `repositories/recipes.ts` (search queries), migration `…0006`; frontend: `components/LibrarySearch.tsx` |
| `units.md` | UNIT | `packages/units/src/*`; backend: `services/recipeUnits.ts`, `services/recipeLanguage.ts`, `services/ingredientLine.ts`, migration `…0015`; frontend: `components/ScaleToPopover.tsx`, `ServingsStepper.tsx`, `hooks/useRecipePreferences.ts` |
| `import.md` | IMP | backend: `routes/import.ts`, `validation/import.ts`, `repositories/importJobs.ts`, `services/importJobs.ts`, `recipeExtraction.ts`, `jsonLd.ts`, `htmlText.ts`, `socialVideo.ts`, `recipeTags.ts`, `llm/geminiClient.ts`, migration `…0014`; frontend: `api/import.ts`, `import/*` |
| `settings.md` | SET | backend: `routes/settings.ts`, `config/llmModels.ts`, `repositories/llmUsage.ts`, migration `…0013`; frontend: `api/settings.ts`, `pages/SettingsPage.tsx`, `components/RecipePreferencesSection.tsx` |
| `pwa-push.md` | PWA | backend: `routes/push.ts`, `validation/push.ts`, `repositories/pushSubscriptions.ts`, `services/pushNotifier.ts`, `services/pushEndpoint.ts`; frontend: `api/push.ts`, `push/*`, `sw.ts`, `vite.config.ts`, `public/*` |
| `security.md` | SEC | backend: `app.ts`, `security.test.ts`, `config/env.ts`, `config/origins.ts`, `middleware/originCheck.ts`, `middleware/rateLimit.ts`, `middleware/errorHandler.ts`, `services/safeFetch.ts`, `services/egressProxy.ts` |

Expected **Set aside** (index.md): planner (`routes/mealPlan.ts`,
`validation/mealPlan.ts`, `repositories/mealPlan.ts`, migration `…0011`,
`api/mealPlan.ts`, `pages/MealPlanPage.tsx`, `components/RecipePickerDialog.tsx`,
`lib/week.ts`): planner dropped. Plumbing with no user-facing behaviour
(`db/pool.ts`, `db/transaction.ts`, `db/seed.ts`, `index.ts`, `api/client.ts`,
`api/types.ts`, `hooks/useAsync.ts`, `toast/*`, `styles.ts`, `index.css`,
`main.tsx`, `App.tsx`, `components/Layout.tsx`, `test/*` dirs): "plumbing or
superseded by the design doc's style/nav; behaviour captured per area". The
consistency pass (Task 3) may move any of these into an area if it hides
behaviour (e.g. `App.tsx` routes, toast messages users rely on).

---

### Task 1: Spec skeleton and checker

**Files:**
- Create: `docs/superpowers/specs/nosh-v2/index.md`
- Create: `docs/superpowers/specs/nosh-v2/_template.md` (the format above, verbatim)
- Create: `docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`
- Test: `docs/superpowers/specs/nosh-v2/tools/check-spec.test.mjs`
- Create: `docs/superpowers/specs/nosh-v2/tools/fixtures/` (tiny fake repo + spec for tests)

**Interfaces:**
- Produces: CLI `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs [--repo <dir>] [--spec <dir>]`
  (defaults: repo = cwd, spec = `docs/superpowers/specs/nosh-v2`). Exit 0 and
  prints `spec OK: <n> areas, <m> criteria` when clean. Otherwise exit 1 and
  one line per problem, each starting with the rule name in brackets.
- Produces: `export function checkSpec({ repoDir, specDir }): string[]` (problem lines; empty = OK).

Matching (applies to Sources and Set aside alike):
- An entry ending in `/*` claims every file below that directory.
- Claiming `x.ts`/`x.tsx` also claims the sibling test file `x.test.ts`/`x.test.tsx`.
- In Sources, implied test files count as listed for `[uncited-test]`.

Rules (`[rule]` name → what fails):
- `[sections]`: an area file (any `*.md` except `index.md` and `_template.md`) missing one of the eight `##` sections, or with them out of order.
- `[id-format]`: a `### ` heading under Acceptance criteria not matching `^[A-Z]+-\d{2} \S` or whose prefix differs from the file's other criteria.
- `[id-unique]`: the same ID in two places.
- `[verdict]`: a Features row whose Verdict is not `keep`, `drop` or `owner?`.
- `[unclaimed-file]`: a file under `backend/src`, `backend/migrations`, `frontend/src`, `frontend/public`, `packages/units/src`, or `frontend/vite.config.ts` that is listed in no area's Sources and not in index.md's Set aside.
- `[unknown-file]`: a listed path that doesn't exist in the repo.
- `[unclaimed-adr]`: a `## ` heading in `docs/decisions.md` (anchor `{#…}` stripped) in no area's ADRs and not in Set aside. The 2026-11-24 restart entry is exempt.
- `[uncited-test]`: a `*.test.ts`/`*.test.tsx` in an area's Sources not mentioned under that area's Acceptance criteria or Tests not carried.
- `[banned-word]`: inside Acceptance criteria, any of `express`, `multer`, `cheerio`, `node-pg-migrate`, `connect-pg-simple`, `express-session`, `nginx` (case-insensitive, whole word).
- `[planner]`: an Acceptance criterion containing `meal plan` or `planner` (case-insensitive).

- [ ] **Step 1: Write the fixtures and failing tests**

Fixture `tools/fixtures/ok/` = a fake repo (`backend/src/a.ts`,
`backend/src/a.test.ts`, `docs/decisions.md` with headings
`## 2026-01-01: Alpha {#alpha}` and `## 2026-11-24: nosh is restarted from scratch`)
plus a spec dir with `index.md` (empty Set aside) and `one.md` claiming
both files and ADR `2026-01-01: Alpha`, one criterion `ONE-01 Works` citing
`a.test.ts`. Each negative test copies `ok/` into a temp dir and breaks one
thing.

```js
test('clean fixture passes', () => assert.deepEqual(checkSpec(ok), []));
test('missing section', () => assert.match(run(dropSection('Rationale')).join('\n'), /^\[sections\] one\.md/m));
test('bad id', () => assert.match(run(renameCriterion('ONE-1 Works')).join(), /\[id-format\]/));
test('duplicate id across files', () => assert.match(run(addFile('two.md', 'ONE-01')).join(), /\[id-unique\] ONE-01/));
test('bad verdict', () => assert.match(run(setVerdict('maybe')).join(), /\[verdict\]/));
test('unclaimed source file', () => assert.match(run(addRepoFile('backend/src/b.ts')).join(), /\[unclaimed-file\] backend\/src\/b\.ts/));
test('set-aside file is fine', () => assert.deepEqual(run(addRepoFile('backend/src/b.ts'), setAside('backend/src/b.ts')), []));
test('dir/* claims everything below', () => assert.deepEqual(run(addRepoFile('backend/src/sub/c.ts'), addSource('backend/src/sub/*')), []));
test('sibling test is implied and must be cited', () => assert.match(run(addRepoFile('backend/src/d.ts'), addRepoFile('backend/src/d.test.ts'), addSource('backend/src/d.ts')).join(), /\[uncited-test\] backend\/src\/d\.test\.ts/));
test('listed path missing', () => assert.match(run(addSource('backend/src/nope.ts')).join(), /\[unknown-file\]/));
test('unclaimed ADR', () => assert.match(run(addAdr('2026-02-02: Beta {#beta}')).join(), /\[unclaimed-adr\] 2026-02-02: Beta$/m));
test('restart ADR exempt', () => assert.ok(!checkSpec(ok).some(l => l.includes('restarted'))));
test('uncited test file', () => assert.match(run(removeCitation('a.test.ts')).join(), /\[uncited-test\] backend\/src\/a\.test\.ts/));
test('banned word', () => assert.match(run(appendCriterionText('uses Express')).join(), /\[banned-word\] express/i));
test('planner criterion', () => assert.match(run(appendCriterionText('adds to the meal plan')).join(), /\[planner\]/));
```

(`run(...edits)` copies `ok/` to a temp dir, applies each edit, and returns `checkSpec`; `dropSection`, `addRepoFile` etc. are small edit helpers in the test file that
edit the temp copy in place.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test docs/superpowers/specs/nosh-v2/tools/`
Expected: FAIL, `checkSpec` not exported / module not found.

- [ ] **Step 3: Implement `checkSpec({ repoDir, specDir }): string[]` and the CLI wrapper in `check-spec.mjs`**

Plain line-based Markdown parsing (split on `\n## `/`\n### `); no Markdown
library. Walk repo dirs with `fs.readdirSync(..., { recursive: true })`.
Paths compared with forward slashes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test docs/superpowers/specs/nosh-v2/tools/`
Expected: all 15 pass.

- [ ] **Step 5: Write `index.md` and `_template.md`**

`index.md`: title, one paragraph pointing at the design doc, the Areas table
(file, prefix, purpose, status `pending`), the Set aside section pre-filled
with the expected list above (each bullet `` `path` — reason `` or
`ADR: <heading> — reason`), an empty Shared behaviours table
(`| Behaviour | Areas | Agreed rule |`), and a "How to check" line with the
CLI command.

- [ ] **Step 6: Run the checker against the real repo**

Run: `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`
Expected: exit 1, with only `[unclaimed-file]` and `[unclaimed-adr]` lines
(no area files exist yet) and no `[unknown-file]` lines for the Set aside
paths. Fix any Set aside path typos until that holds.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/nosh-v2
git commit -m "docs(spec): nosh-v2 spec skeleton and coverage checker"
```

### Task 2: Extract the nine areas (parallel)

**Files:**
- Create: `docs/superpowers/specs/nosh-v2/{auth,recipes,collections,search,units,import,settings,pwa-push,security}.md`
- Modify: `docs/superpowers/specs/nosh-v2/index.md` (area status → `drafted`)

**Interfaces:**
- Consumes: the format and checker from Task 1; the Areas table above.
- Produces: nine area files that individually pass `[sections]`, `[id-format]`,
  `[verdict]`, `[unknown-file]`, `[uncited-test]`, `[banned-word]`,
  `[planner]`. (`[unclaimed-*]` is resolved in Task 3.)

Run as **nine parallel subagents** (`superpowers:dispatching-parallel-agents`),
one per row of the Areas table, each in the same worktree but writing only its
own file. Each gets this brief with `<AREA>`, `<FILE>`, `<PREFIX>` and
`<SOURCES>` filled in:

> You are extracting the **<AREA>** part of the spec for a from-scratch
> rewrite of nosh, a self-hosted recipe PWA. Read
> `docs/superpowers/specs/2026-11-24-nosh-restart-design.md` (especially §2,
> §5, §9) and `docs/superpowers/specs/nosh-v2/_template.md` first.
> Then read these sources in full: <SOURCES>, and search
> `docs/decisions.md` for ADRs about this area.
> Write `docs/superpowers/specs/nosh-v2/<FILE>` in exactly the template's
> format, criterion IDs `<PREFIX>-01` upward.
> - Describe **observable behaviour** (what the owner sees, what the API
>   accepts/rejects, what is stored) as Given/When/Then. Not how it's built.
> - Every test case in your sources' test files encodes a behaviour: turn it
>   into a criterion or list it under "Tests not carried" with a reason.
>   Edge cases from tests matter most.
> - Include limits and error behaviour (max lengths, caps, what happens on
>   bad input, empty states).
> - The UI is being redesigned (design §7). Capture *what* the screen lets
>   the owner do and see, not layout or styling.
> - Anything about the meal planner: leave it out (it's dropped).
> - Each feature gets a keep/drop row; use `owner?` when you'd recommend a
>   change but it's the owner's call. Explain in Why.
> - Put the *why* for non-obvious criteria in Rationale, citing ADR dates.
> - Edit only `<FILE>`. Don't commit.
> When done, run `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`
> and fix every problem line that names `<FILE>` (ignore `[unclaimed-*]`).
> Report: number of criteria, the `owner?` rows, and your open questions.

Extra per-area requirements to add to the brief:
- **UNIT:** list `packages/units/src/units.test.ts`,
  `backend/src/services/ingredientLine.test.ts` and any other pure-logic test
  files as "port directly" in Rationale (design §8 decision).
- **AUTH:** state the username login and the "existing argon2 hash must keep
  working" requirement (design §3, §6) as criteria.
- **SEC:** every bullet of design §9 must map to at least one criterion; add
  the trusted-proxy-is-Caddy rule for the new topology.
- **IMP:** progress delivery is the builder's choice (design §6); criteria
  say "the owner sees progress" and "gets a push when done even after
  leaving the app", not NDJSON.
- **REC:** multiple images per recipe today; capture current behaviour and
  make the gallery an `owner?` row (design §11).

- [ ] **Step 1: Dispatch the nine subagents with the brief**
- [ ] **Step 2: For each returned file, run the checker and confirm no problem line names that file except `[unclaimed-*]`**

Run: `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs | grep -v unclaimed`
Expected: no output.

- [ ] **Step 3: Spot-review each area (one reviewer subagent per file, or the lead)**

Pick three criteria per area at random and trace each back to its cited
source. Expected: each is true of today's app. Any false criterion → send
back to that area's agent.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/nosh-v2
git commit -m "docs(spec): extract nine nosh-v2 areas"
```

### Task 3: Consistency and coverage pass

**Files:**
- Modify: area files and `docs/superpowers/specs/nosh-v2/index.md`

**Interfaces:**
- Consumes: Task 2 area files.
- Produces: `check-spec.mjs` exits 0; index.md Shared behaviours filled;
  one consolidated "Open questions for the owner" list in index.md (most
  important first, each linking to its area question).

- [ ] **Step 1: Resolve every `[unclaimed-file]` and `[unclaimed-adr]`** by
  adding it to the right area's Sources/ADRs (with criteria if it carries
  behaviour) or to Set aside with a reason. Operational ADRs (deployment,
  dev containers, SonarQube, Windows quirks, old design systems) go to Set
  aside: "superseded by the restart design".

Run: `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`
Expected: `spec OK: 9 areas, <m> criteria`, exit 0.

- [ ] **Step 2: Silent-drop walk (Review Focus 2).** For every file in
  `frontend/src/pages` and `frontend/src/components`, list each user-visible
  control/action, and confirm a Features row covers it. Add missing rows.
- [ ] **Step 3: Shared behaviours table (Review Focus 4).** Fill at least:
  recipes at Home (COL, SRCH, REC); tag vocabulary (IMP, REC); translate +
  convert on import vs on display (IMP, UNIT, SET); image fetch after import
  (IMP, REC, SEC); push after import (IMP, PWA); per-user model choice and
  usage (SET, IMP); rate limits (SEC, AUTH, IMP). Where two areas disagree,
  pick the one matching today's code and fix the other.
- [ ] **Step 4: Leak read-through (Review Focus 3).** Read every criterion
  once for implementation detail the banned-words rule can't catch (table
  names, HTTP status codes are fine; library names, file paths in Given/When/Then
  are not). Rewrite offenders.
- [ ] **Step 5: Re-run the checker and the tests**

Run: `node --test docs/superpowers/specs/nosh-v2/tools/ && node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs`
Expected: tests pass; `spec OK`.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/nosh-v2
git commit -m "docs(spec): consistency and coverage pass"
```

### Task 4: Owner review (HARD GATE)

**Files:**
- Modify: area files and `index.md` with the owner's answers; set every area status to `approved`.
- Modify: `docs/backlog.md` (move "Extract the testable spec" to Completed with date and note).

- [ ] **Step 1: Hand the owner the spec**: link `index.md`, the counts per
  area, all `owner?` rows, and the consolidated open questions (most
  important first). Ask for keep/drop verdicts and answers in one message.
- [ ] **Step 2: Apply the answers.** `owner?` → `keep`/`drop`; criteria of
  dropped features become `~~struck~~` (IDs not reused). Answers go into the
  relevant Rationale.
- [ ] **Step 3: Checker passes** with zero `owner?` verdicts left.

Run: `node docs/superpowers/specs/nosh-v2/tools/check-spec.mjs && grep -rn "owner?" docs/superpowers/specs/nosh-v2/*.md`
Expected: `spec OK`, and grep prints nothing.

- [ ] **Step 4: Owner says "spec approved" in chat.** Do not proceed without those words or an unambiguous equivalent.
- [ ] **Step 5: Commit, push the branch and open a PR to `main`** (ask before pushing). The owner merges it, so the spec lands on `main` before the wipe.

```bash
git add docs
git commit -m "docs(spec): nosh-v2 spec approved by owner"
```

### Task 5: Archive and wipe `main`

Runs only after Task 4 Step 4 and after the spec PR is merged.

**Files:**
- Delete: everything tracked except the keep-list below.
- Keep: `docs/superpowers/**`, `docs/restart/**`, `.github/workflows/claude.yml`,
  `.github/workflows/claude-code-review.yml`, `.github/workflows/claude-build.yml`,
  `.gitignore`, `.gitattributes` (if present), `.claude/settings.json`,
  `.claude/launch.json`, `.agents/**`, `skills-lock.json`.
- Create: `CLAUDE.md` (new, short), `README.md` (three lines), `docs/decisions.md` (new),
  `docs/backlog.md` (new).
- Modify: `.claude/agents/nosh-dev.md`, `.claude/agents/nosh-reviewer.md`: replace
  old-stack instructions with the Shape 1 stack and "spec criteria are the
  source of truth"; keep their roles.
- Modify: `.claude/launch.json`: remove entries pointing at deleted paths.

**Interfaces:**
- Produces: tag `legacy-v1` and branch `legacy`, both at the pre-wipe `main`
  commit; a lean `main` ready for the skeleton + auth plan.

- [ ] **Step 1: Confirm the archive points at the right commit**

```bash
git fetch origin
git tag legacy-v1 origin/main
git branch legacy origin/main
git rev-parse legacy-v1^{commit} legacy origin/main
```
Expected: three identical SHAs.

- [ ] **Step 2: Ask the owner, then push the archive**: `git push origin legacy-v1 legacy`.

Run: `git ls-remote origin legacy-v1 refs/heads/legacy`
Expected: both present, same SHA as Step 1.

- [ ] **Step 3: On a new branch `claude/restart-wipe` from `origin/main`, remove everything not on the keep-list**

```bash
git switch -c claude/restart-wipe origin/main
git ls-files | grep -vE '^(docs/superpowers/|docs/restart/|\.agents/|\.github/workflows/claude(-code-review|-build)?\.yml$|\.gitignore$|\.gitattributes$|\.claude/(settings\.json|launch\.json|agents/)|skills-lock\.json$)' | xargs git rm -q
```
This also removes `.github/workflows/ci.yml`, so no new image is published
and Watchtower keeps running the old app (Review Focus 5).

- [ ] **Step 4: Write the new lean files**
  - `CLAUDE.md` (≤ 40 lines): one-paragraph purpose; stack (design §6);
    "spec in `docs/superpowers/specs/nosh-v2/` is the source of truth, tests
    cite criterion IDs"; "design doc §7 + `docs/restart/style-log.md` are
    normative for UI and win over any design plugin"; superpowers flow per
    feature group; always use worktrees; record decisions in
    `docs/decisions.md`, keep `docs/backlog.md` current; old code is on the
    `legacy` branch for lookups. **No mentor/teaching section.**
  - `docs/decisions.md`: one entry, 2026-11-24 restart, pointing at the
    design doc; note that the old ADRs live on `legacy`.
  - `docs/backlog.md`: Backlog = remaining restart steps (build order from
    design §8, cutover §11, fix shadcn CLI on Windows) plus the post-release
    items from design §2 non-goals; Completed = spec approved, wipe done.
  - `README.md`: name, one line, link to `CLAUDE.md` and the design doc.
- [ ] **Step 5: Verify the tree**

Run: `git ls-files`
Expected: only keep-list paths plus the four new files; no `backend/`,
`frontend/`, `packages/`, `docker-compose*`, `ci.yml`.

Run: `git diff --stat legacy-v1 -- docs/superpowers docs/restart`
Expected: no changes (the spec survived intact).

- [ ] **Step 6: Commit, then ask before pushing and opening the PR**

```bash
git add -A
git commit -m "chore: archive v1 as legacy-v1 and clear main for the restart"
```
PR title: `chore: clear main for the nosh restart`; body says `legacy-v1`
and `legacy` hold the old app, production is unaffected (no CI publish), and
links the design doc and spec index. The owner merges.

- [ ] **Step 7: After merge, confirm production is untouched**

Ask the owner to confirm `https://nosh.itsthomassito.com` still serves the old
app (or, once SSH exists, check `docker ps` image digests haven't changed).

---

**Next plan after this one:** skeleton + auth (design §8), written from the
approved AUTH and SEC criteria.

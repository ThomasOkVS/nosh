# Search

## Purpose
Lets the owner find recipes in their library by typing words, and narrow any
list of recipes by tag or by folder. One search box, available everywhere,
searches the current folder and everything below it, or the whole library from
Home.

## Sources
- `backend/src/repositories/recipes.ts`
- `backend/migrations/1700000000006_recipe-search-vectors.js`
- `frontend/src/components/LibrarySearch.tsx`
- `frontend/src/components/LibrarySearch.test.tsx`

## ADRs
- 2026-08-05: Search via Postgres full-text search
- 2026-08-06: Full-text search implemented via triggers, not a single generated column
- 2026-08-19: Collections added as a first-class concept distinct from tags; tag browsing via a query param
- 2026-09-23: Library unified; recipes may live at Home

## Features
| Feature | Verdict | Why |
|---|---|---|
| One search box in the header on every page | keep | Recipes can be found from anywhere; one box instead of a page box plus a header box (ADR 2026-09-23). |
| Search scoped to the current folder and below, with "Search everywhere" | keep | Supports "I know it's somewhere in Baking" without losing whole-library search (ADR 2026-09-23). |
| Search across title, description, ingredients, steps and tags | keep | Core of finding a recipe by what is in it. |
| Relevance ranking (title above description and tags above ingredients above steps) | keep | Titles are the strongest signal. |
| Tag filter via clicking a tag chip, combinable with a search | keep | Tag browsing without a separate tag list (ADR 2026-08-19). |
| Matching of Dutch words, accents and partial words | owner? | Today only English word forms are understood. Dutch recipes match exact words only, accents must match exactly, and half-typed words match nothing. See open questions 1 and 2. |
| Debounced search-as-you-type | keep | Results follow typing without a submit step. |
| Folder filters on the recipe list (`collection`, `within`) | keep | The library page needs "direct contents" and "whole subtree" views. |
| Search ignored when the query is blank | keep | A blank search is a browse, not an error in the UI. |

## Acceptance criteria

### SRCH-01 Search box is on every page
**Given** the owner is signed in **When** they view any page (library, a recipe, a settings page) **Then** a search box labelled "Search recipes" is available in the header with the placeholder "Search recipes…".
Cites: `frontend/src/components/LibrarySearch.tsx`, ADR 2026-09-23

### SRCH-02 Typing on a library page searches after a short pause
**Given** the owner is on Home or a folder page **When** they type into the search box **Then** nothing changes while they type, and 300 ms after the last keystroke the page's search becomes the typed text with surrounding spaces trimmed (the search is kept in the page address as `q`, replacing the current history entry rather than adding one).
Cites: `frontend/src/components/LibrarySearch.test.tsx` "writes a debounced ?q onto the current folder while typing"

### SRCH-03 Pressing Enter on a library page searches immediately
**Given** the owner is on Home or a folder page and has typed a query **When** they press Enter **Then** the search applies at once, without waiting for the pause, for the current folder.
Cites: `frontend/src/components/LibrarySearch.tsx`

### SRCH-04 Clearing the box returns to browsing
**Given** the owner is on a library page with a search active **When** they clear the search box **Then**, after the same short pause, the search is removed from the address and the page shows the normal folder contents again.
Cites: `frontend/src/components/LibrarySearch.test.tsx` "removes ?q when the box is cleared"

### SRCH-05 Searching from outside the library jumps to Home's results
**Given** the owner is on a page that is not Home or a folder (for example a recipe page) **When** they type a query and press Enter **Then** they are taken to Home with that query, searching the whole library. Typing alone never navigates them away, and pressing Enter with an empty box does nothing.
Cites: `frontend/src/components/LibrarySearch.test.tsx` "jumps to a whole-library search from a non-library page on Enter"

### SRCH-06 The search box follows the page address
**Given** the search box shows a query for the current folder **When** the page address changes from outside the box (Back/Forward, opening another folder, following "Search everywhere", leaving the library) **Then** the box shows the query now in the address, which is empty when there is none, and does not remove a trailing space the owner is partway through typing.
Cites: `frontend/src/components/LibrarySearch.test.tsx` "follows the URL when it changes from elsewhere (e.g. opening another folder)"

### SRCH-07 A search covers the current folder and everything below it
**Given** the owner is in a folder that has sub-folders, each holding recipes **When** they search **Then** results come from that folder's own recipes and from every recipe in any sub-folder at any depth, shown as one flat list, and the heading names the folder.
Cites: `backend/src/routes/recipes.test.ts` "scopes a text search to a folder's subtree with within", ADR 2026-09-23

### SRCH-08 Searching from Home covers the whole library
**Given** the owner is on Home **When** they search **Then** results come from every recipe they own, wherever it is filed, and the heading says "your whole library". A recipe that sits directly at Home is included, and appears in no folder-scoped search (see COL for the "at Home" rule).
Cites: `backend/src/routes/recipes.test.ts` "scopes a text search to a folder's subtree with within", ADR 2026-09-23

### SRCH-09 "Search everywhere" widens a folder search
**Given** a search is active inside a folder (not Home) **When** the owner follows "Search everywhere" **Then** they land on Home with the same query and the same tag filter, so the same search runs over the whole library. The link is not shown at Home.
Cites: `frontend/src/components/LibrarySearch.tsx`, ADR 2026-09-23

### SRCH-10 Results heading shows count, query and scope
**Given** a search or tag filter is active **When** results are shown **Then** a heading shows the number of results (singular or plural), the query in quotation marks when there is one, and the scope (the folder name, or "your whole library"). While a new search is loading, the previous results stay on screen with a small "Searching" indicator instead of being replaced by a skeleton.
Cites: `backend/src/repositories/recipes.ts`, ADR 2026-09-23

### SRCH-11 Empty result states
**Given** a search or tag filter matches nothing **When** the results show **Then** the page says "No recipes match". Inside a folder it adds that nothing is in the folder or its sub-collections and suggests searching everywhere; at Home it suggests a different term or clearing the filter.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-12 Searched fields
**Given** the owner has a recipe **When** they search for a word that appears in its title, its description, the name of one of its ingredients, the text of one of its steps, or one of its tags **Then** the recipe is in the results. Words appearing only in an ingredient's quantity or unit, or in the source URL, do not match.
Cites: `backend/src/routes/recipes.test.ts` "finds a recipe via full-text search on an ingredient name", ADR 2026-08-05

### SRCH-13 Search always reflects the latest recipe content
**Given** a recipe has been created or edited (title, description, ingredients, steps or tags added, changed or removed) **When** the owner searches next **Then** the recipe matches its current content only: new words match straight away and removed words no longer match.
Cites: `backend/migrations/1700000000006_recipe-search-vectors.js`, ADR 2026-08-06

### SRCH-14 All words must match
**Given** the owner searches for several words **When** results are computed **Then** only recipes containing every word are returned, in any order and spread over any of the searched fields (one word in the title and another in an ingredient is a match).
Cites: `backend/src/repositories/recipes.ts`

### SRCH-15 English word forms and case are ignored
**Given** a recipe contains "tomatoes" **When** the owner searches for "tomato", "Tomatoes" or "TOMATOES" **Then** the recipe is found. Common English endings (plural, "-ing", "-ed") are treated as the same word.
Cites: `backend/src/routes/recipes.test.ts` "finds a recipe via full-text search on an ingredient name", ADR 2026-08-05

### SRCH-16 Whole words only; no partial-word matching
**Given** a recipe contains "chocolate" **When** the owner searches for "choc" **Then** the recipe is not found; only whole words (after the English word-form rule in SRCH-15) match. The search does not complete half-typed words.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-17 Dutch content and accents match as written
**Given** a recipe written in Dutch or containing accented letters **When** the owner searches **Then** a word matches only if it is the same word as written, apart from case: Dutch plurals and inflections are not related to their base word ("tomaat" does not find "tomaten"), and an accented letter does not match its plain form ("crème" does not find "creme"). Dutch and English recipes are searched together in one library, with no per-recipe language setting.
Cites: `backend/migrations/1700000000006_recipe-search-vectors.js`, ADR 2026-08-05

### SRCH-18 Results are ranked by where the words match
**Given** several recipes match a search **When** results are shown **Then** the best matches come first: a match in the title counts most, then a match in the description or tags, then in ingredient names, then in step text. The order among equally good matches is not defined.
Cites: `backend/migrations/1700000000006_recipe-search-vectors.js`, `backend/src/repositories/recipes.ts`

### SRCH-19 A blank query is refused by the search endpoint
**Given** a signed-in owner **When** they request a search with no query, an empty query or only spaces **Then** the answer is 400 "Query parameter 'q' is required". The screen never sends this: with no query and no tag it shows normal browse contents instead.
Cites: `backend/src/routes/recipes.test.ts` "requires a query parameter for search"

### SRCH-20 Queries with no usable words match nothing
**Given** the owner searches for text with no searchable words (only punctuation, or only very common words such as "the") **When** results are computed **Then** the result is an empty list with a normal success answer, not an error, and the empty state of SRCH-11 shows.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-21 Filtering by tag
**Given** the owner has recipes with different tags **When** they filter by a tag **Then** only recipes carrying a tag with exactly that name are listed (a recipe tagged more than once is listed once), and recipes without it are left out.
Cites: `backend/src/routes/recipes.test.ts` "filters the recipe list by tag", ADR 2026-08-19

### SRCH-22 Tag filter combines with a search
**Given** a search query and a tag filter **When** results are computed **Then** only recipes that match the query and carry the tag are returned; a tag no matching recipe has gives an empty list.
Cites: `backend/src/routes/recipes.test.ts` "combines a text search with a tag filter"

### SRCH-23 Clicking a tag on a recipe filters the library by it
**Given** a recipe card shows tags **When** the owner clicks a tag **Then** they are taken to Home filtered by that tag across the whole library, shown with the same results heading, plus a removable chip showing the active tag. Removing the chip drops the tag but keeps any query and scope.
Cites: `backend/src/repositories/recipes.ts`, ADR 2026-08-19

### SRCH-24 A blank tag filter is ignored
**Given** a request whose tag filter is empty or only spaces **When** the list or search is requested **Then** the tag filter is ignored and the request succeeds as if no tag were given.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-25 Browse versus search on library pages
**Given** a library page **When** neither a query nor a tag is active **Then** the page browses: it shows the folder's sub-folders and only the recipes directly in that folder, newest first. **When** a query or a tag is active **Then** it shows one flat list of matching recipes from the folder and everything below it, with no sub-folders shown and no new-folder form.
Cites: `backend/src/routes/recipes.test.ts` "lists only the recipes directly in one collection", ADR 2026-09-23

### SRCH-26 Folder filters on the recipe list
**Given** a library with recipes at Home, in a folder, and in a sub-folder of it **When** the list is requested with the folder filter set to Home **Then** only recipes directly at Home are returned. **When** it is set to one folder **Then** only recipes directly in that folder are returned. **When** the subtree filter is set to a folder **Then** recipes in that folder and all of its sub-folders are returned. Unfiltered lists return everything the owner has, newest first.
Cites: `backend/src/routes/recipes.test.ts` "lists only the recipes directly at Home with collection=root", "lists only the recipes directly in one collection", "includes every nested sub-collection with within"

### SRCH-27 Malformed folder filters are rejected
**Given** a folder filter that is not a positive whole number (or the word for Home) **When** the list or search is requested **Then** the answer is 400 with a message.
Cites: `backend/src/routes/recipes.test.ts` "rejects a malformed folder filter"

### SRCH-28 Only the owner's own recipes are ever returned
**Given** two owners **When** one lists or searches, including with a folder id that belongs to the other **Then** only their own recipes come back; a foreign folder id gives an empty list, not an error and not the other owner's recipes. Without a signed-in session the answer is 401.
Cites: `backend/src/routes/recipes.test.ts` "never returns another user's recipes through within", "rejects requests with no session"

## Rationale
SRCH-02, SRCH-05, SRCH-06: the page address holds the query, so it survives
reload, Back/Forward and sharing a link, and the box is only a view of it.
Outside the library there is no results page to update, so Enter is needed to
go there (ADR 2026-09-23).

SRCH-07 and SRCH-08: ADR 2026-09-23 chose "this folder and below" over "always
everything" (which loses narrowing) and over "only this folder" (which hides
recipes in sub-folders). At Home this scope is the whole library, which
replaced the old flat "all recipes" page.

SRCH-12 and SRCH-13: ADR 2026-08-05 chose indexed full-text search over
substring matching for relevance; ADR 2026-08-06 records that the corpus spans
several tables, so the index is kept current whenever a recipe or its
ingredients, steps or tags change.

SRCH-15 to SRCH-17: today the matching is built for English only, even though
recipe content is often Dutch. These criteria describe what the owner gets
today, so the rewrite can decide on purpose whether to keep or improve it
(open questions 1 and 2).

SRCH-21 and SRCH-23: tag browsing is a filter reached by clicking a tag, not a
separate tag list; an early version with a chip row of all tags was cut as
clutter (ADR 2026-08-19).

## Tests not carried
- `frontend/src/components/LibrarySearch.test.tsx`: all four tests are carried (SRCH-02, SRCH-04, SRCH-05, SRCH-06).

## Open questions for the owner
1. Dutch support: should search understand Dutch word forms ("tomaten" finds "tomaat")? Recommendation: yes, since much recipe content is Dutch; choose the matching language per recipe from its language setting (see UNIT) or match both languages.
2. Accents and partial words: should "creme" find "crème", and should "choc" find "chocolate" while typing? Recommendation: yes to accent-insensitive matching; yes to prefix matching on the last word typed, as it suits search-as-you-type.
3. Tag matching: tags match by exact name, so "Dessert" and "dessert" are different tags. Recommendation: treat tag names case-insensitively when filtering and when saving.
4. Tie order: equally ranked matches have no defined order. Recommendation: break ties by newest first, matching the plain list.

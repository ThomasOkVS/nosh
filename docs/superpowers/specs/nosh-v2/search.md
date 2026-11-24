# Search

## Purpose
Lets the owner find recipes in their library by typing words, and narrow any
list of recipes by tag or by folder. One search box on the library screen
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
| One search box in the header on every page | drop | Design §7 replaces the old header search: the new nav is a bottom pill and the library screen has its own rounded search box. Searching from a recipe page now means going back to the library first. |
| One search box on the library screen (Home and every folder) | keep | One box, not a page box plus a header box (ADR 2026-09-23); placed on the library as design §7 shows. |
| Search scoped to the current folder and below, with "Search everywhere" | keep | Supports "I know it's somewhere in Baking" without losing whole-library search (ADR 2026-09-23). |
| Search across title, description, ingredients, steps and tags | keep | Core of finding a recipe by what is in it. |
| Relevance ranking (title above description and tags above ingredients above steps) | keep | Titles are the strongest signal. |
| Tag filter via clicking a tag chip, combinable with a search | keep | Tag browsing without a separate tag list (ADR 2026-08-19). |
| Matching of Dutch word forms ("tomaten" finds "tomaat") | drop | Design §2 and §5 (decided): Dutch-aware search stays in the backlog for after cutover. Today Dutch recipes match exact words only (SRCH-17). |
| Accent-insensitive and partial-word matching | drop | Decided by the owner (index Q14): today's matching is kept for the first release (SRCH-16, SRCH-17); both improvements go to the backlog next to Dutch-aware search (design §2, §6). |
| Debounced search-as-you-type | keep | Results follow typing without a submit step. |
| Folder filters on the recipe list (`collection`, `within`) | keep | The library page needs "direct contents" and "whole subtree" views. |
| Search ignored when the query is blank | keep | A blank search is a browse, not an error in the UI. |

## Acceptance criteria

### SRCH-01 Search box on the library screen
**Given** the owner is signed in **When** they view Home or any folder **Then** a search box labelled "Search recipes" is shown with the placeholder "Search recipes…". (Today the box sits in the header of every page; design §7 moves it onto the library screen.)
Cites: `frontend/src/components/LibrarySearch.tsx`, ADR 2026-09-23, design §7

### SRCH-02 Typing on a library page searches after a short pause
**Given** the owner is on Home or a folder page **When** they type into the search box **Then** nothing changes while they type, and 300 ms after the last keystroke the page's search becomes the typed text with surrounding spaces trimmed (the search is kept in the page address as `q`, replacing the current history entry rather than adding one).
Cites: `frontend/src/components/LibrarySearch.test.tsx` "writes a debounced ?q onto the current folder while typing"

### SRCH-03 Pressing Enter on a library page searches immediately
**Given** the owner is on Home or a folder page and has typed a query **When** they press Enter **Then** the search applies at once, without waiting for the pause, for the current folder.
Cites: `frontend/src/components/LibrarySearch.tsx`

### SRCH-04 Clearing the box returns to browsing
**Given** the owner is on a library page with a search active **When** they clear the search box **Then**, after the same short pause, the search is removed from the address and the page shows the normal folder contents again.
Cites: `frontend/src/components/LibrarySearch.test.tsx` "removes ?q when the box is cleared"

### SRCH-05 ~~Searching from outside the library jumps to Home's results~~
Struck in the consistency pass: with the search box only on the library screen (SRCH-01, design §7) there is no search from outside the library. The test is listed under Tests not carried.
Cites: none (struck)

### SRCH-06 The search box follows the page address
**Given** the search box shows a query for the current folder **When** the page address changes from outside the box (Back/Forward, opening another folder, following "Search everywhere") **Then** the box shows the query now in the address, which is empty when there is none, and does not remove a trailing space the owner is partway through typing.
Cites: `frontend/src/components/LibrarySearch.test.tsx` "follows the URL when it changes from elsewhere (e.g. opening another folder)"

### SRCH-07 A search covers the current folder and everything below it
**Given** the owner is in a folder that has sub-folders, each holding recipes **When** they search **Then** results come from that folder's own recipes and from every recipe in any sub-folder at any depth, shown as one flat list, and the heading names the folder.
Cites: `backend/src/routes/recipes.test.ts` "scopes a text search to a folder's subtree with within", ADR 2026-09-23

### SRCH-08 Searching from Home covers the whole library
**Given** the owner is on Home **When** they search **Then** results come from every recipe they own, wherever it is filed, and the heading says "your whole library". A recipe that sits directly at Home is included, and appears in no folder-scoped search (see COL for the "at Home" rule).
Cites: `backend/src/routes/recipes.test.ts` "scopes a text search to a folder's subtree with within", ADR 2026-09-23

### SRCH-09 "Search everywhere" widens a folder search
**Given** a search is active inside a folder (not Home) **When** the owner follows "Search everywhere" **Then** they land on Home with the same query and the same tag filter, so the same search runs over the whole library. The link is not shown at Home.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "offers a Search everywhere link that drops the folder scope", "filters the whole library by tag at Home, and the tag can be cleared", ADR 2026-09-23

### SRCH-10 Results heading shows count, query and scope
**Given** a search or tag filter is active **When** results are shown **Then** a heading shows the number of results (singular or plural), the query in quotation marks when there is one, and the scope (the folder name, or "your whole library"). While a new search is loading, the previous results stay on screen with a small "Searching" indicator instead of being replaced by a skeleton.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "searches this collection and everything below it, labelling where each result lives", `frontend/src/pages/CollectionsPage.tsx` (heading wording and the "Searching" indicator have no test), ADR 2026-09-23

### SRCH-11 Empty result states
**Given** a search or tag filter matches nothing **When** the results show **Then** the page says "No recipes match". Inside a folder it adds that nothing is in the folder or its sub-collections and suggests searching everywhere; at Home it suggests a different term or clearing the filter.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "offers a Search everywhere link that drops the folder scope"

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
**Given** several recipes match a search **When** results are shown **Then** the best matches come first: a match in the title counts most, then a match in the description or tags, then in ingredient names, then in step text. Equally good matches are ordered newest created first, like the plain list.
Decision: owner 2026-11-24, index Q32 (v1 left the order among equally good matches undefined)
Cites: `backend/migrations/1700000000006_recipe-search-vectors.js`, `backend/src/repositories/recipes.ts`

### SRCH-19 A blank query is refused by the search endpoint
**Given** a signed-in owner **When** they request a search with no query, an empty query or only spaces **Then** the answer is 400 "Query parameter 'q' is required". The screen never sends this: with no query and no tag it shows normal browse contents instead.
Cites: `backend/src/routes/recipes.test.ts` "requires a query parameter for search"

### SRCH-20 Queries with no usable words match nothing
**Given** the owner searches for text with no searchable words (only punctuation, or only very common words such as "the") **When** results are computed **Then** the result is an empty list with a normal success answer, not an error, and the empty state of SRCH-11 shows.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-21 Filtering by tag
**Given** the owner has recipes with different tags **When** they filter by a tag **Then** only recipes carrying that tag, compared ignoring letter case ("Dessert" finds recipes tagged "dessert"), are listed (a recipe tagged more than once is listed once), and recipes without it are left out.
Decision: owner 2026-11-24, index Q5 (v1 matched the exact tag name, case-sensitively)
Cites: `backend/src/routes/recipes.test.ts` "filters the recipe list by tag", ADR 2026-08-19

### SRCH-22 Tag filter combines with a search
**Given** a search query and a tag filter **When** results are computed **Then** only recipes that match the query and carry the tag are returned; a tag no matching recipe has gives an empty list.
Cites: `backend/src/routes/recipes.test.ts` "combines a text search with a tag filter"

### SRCH-23 Clicking a tag on a recipe filters the library by it
**Given** a recipe card shows tags **When** the owner clicks a tag **Then** they are taken to Home filtered by that tag across the whole library, shown with the same results heading, plus a removable chip showing the active tag. Removing the chip drops the tag but keeps any query and scope.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "filters the whole library by tag at Home, and the tag can be cleared", ADR 2026-08-19

### SRCH-24 A blank tag filter is ignored
**Given** a request whose tag filter is empty or only spaces **When** the list or search is requested **Then** the tag filter is ignored and the request succeeds as if no tag were given.
Cites: `backend/src/repositories/recipes.ts`

### SRCH-25 Browse versus search on library pages
**Given** a library page **When** neither a query nor a tag is active **Then** the page browses: it shows the folder's sub-folders and only the recipes directly in that folder, newest first. **When** a query or a tag is active **Then** it shows one flat list of matching recipes from the folder and everything below it, with no sub-folders shown and no new-folder form.
Cites: `backend/src/routes/recipes.test.ts` "lists only the recipes directly in one collection", `frontend/src/pages/CollectionsPage.test.tsx` "shows top-level collections and the recipes filed directly at Home", "renders a collection's sub-collections and its direct recipes", "searches this collection and everything below it, labelling where each result lives", ADR 2026-09-23

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
SRCH-02, SRCH-06: the page address holds the query, so it survives
reload, Back/Forward and sharing a link, and the box is only a view of it
(ADR 2026-09-23). SRCH-05 (Enter on a non-library page jumps to Home's
results) only existed because the box was in the header of every page.

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
today. The owner kept them for the first release; Dutch word forms, accents
and partial words are in the backlog (design §2, §5; index Q14).

SRCH-21 and SRCH-23: tag browsing is a filter reached by clicking a tag, not a
separate tag list; an early version with a chip row of all tags was cut as
clutter (ADR 2026-08-19).

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q5 tag case: the tag filter ignores letter case; tags are stored lower-case (REC-07). SRCH-21.
- Q9 search placement: search stays on the library screen only. No change (SRCH-01; SRCH-05 stays struck).
- Q14 accents and partial words: today's matching is kept; both go to the backlog. No criterion changed (SRCH-16, SRCH-17).
- Q32 search ties: equally ranked results are ordered newest first. SRCH-18.
- Group E note: Dutch word forms stay in the backlog (design §2, §5). No change.

## Tests not carried
- `frontend/src/components/LibrarySearch.test.tsx` "jumps to a whole-library search from a non-library page on Enter": the header search on every page is dropped (design §7), so SRCH-05 is struck. The other three tests are carried (SRCH-02, SRCH-04, SRCH-06).

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.

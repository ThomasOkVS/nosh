# Collections

## Purpose
Collections are the owner's folders for recipes: an unlimited-depth tree, with the library root called "Home". The library home page and every collection page are the same screen. It shows what is directly inside the folder, and the owner creates, renames, moves, deletes and drags recipes between folders from there.

## Sources
- `backend/src/routes/collections.ts`
- `backend/src/routes/collections.test.ts`
- `backend/src/validation/collections.ts`
- `backend/src/repositories/collections.ts`
- `backend/src/utils/groupBy.ts`
- `backend/migrations/1700000000009_create-collections.js`
- `backend/migrations/1700000000010_nest-collections.js`
- `backend/migrations/1700000000012_recipes-at-home.js`
- `frontend/src/api/collections.ts`
- `frontend/src/pages/CollectionsPage.tsx`
- `frontend/src/pages/CollectionsPage.test.tsx`
- `frontend/src/components/CollectionBreadcrumb.tsx`
- `frontend/src/components/CollectionSelect.tsx`
- `frontend/src/components/RecipeCollectionPicker.tsx`
- `frontend/src/components/RecipeCollectionPicker.test.tsx`
- `frontend/src/lib/collectionTree.ts`
- `frontend/src/lib/collectionTree.test.ts`
- `frontend/src/lib/recipeDrag.ts`
- `frontend/src/lib/recipeDrag.test.ts`
- `frontend/src/hooks/useRecipeDropTargets.ts`

## ADRs
- 2026-08-19: Collections added as a first-class concept distinct from tags; tag browsing via a query param
- 2026-08-28: Collections redesigned as a nested, mandatory hierarchy; becomes the home page
- 2026-09-23: Library unified; recipes may live at Home

## Features
| Feature | Verdict | Why |
|---|---|---|
| Nested collections (unlimited depth, per-owner) | keep | Core of the library; design section 5 says keep. |
| Home as the library root, holding collections and recipes | keep | Replaced the forced "Other" folder (ADR 2026-09-23). |
| One location per recipe (a recipe is in exactly one collection or at Home) | keep | The file-system mental model the owner asked for (ADR 2026-08-28). |
| Folder view shows only direct contents | keep | Keeps Home from being a second "all recipes" list. |
| Create, rename, move (reparent) collection | keep | Rename and reparent are one "edit" action. |
| Delete collection deletes everything inside it | owner? | Deliberate (ADR 2026-08-28) and I recommend keeping it, with the count warning. See open question 1. |
| Breadcrumb navigation (Home / A / B) | keep | Also a drop target. |
| Drag a recipe card onto a sub-collection or breadcrumb crumb to move it | owner? | Fast way to file recipes, but mouse-only and nosh is mainly used on iPhone. See open question 3. |
| Move-recipe dropdown on recipe detail page | keep | Non-drag alternative; works on touch. |
| Sibling-name uniqueness | keep | Two siblings may not share a name; non-siblings may. |
| Collection-scoped search and tag filtering on the library page | keep | Behaviour belongs to SRCH. This file only fixes the scope rule (COL-04). |
| Per-collection recipe counts on collection rows | keep | Direct recipes only, not the subtree. |
| Auto-created "Other" collection | drop | Superseded by Home (ADR 2026-09-23). Existing data handled by migration (COL-23). |
| Many-to-many recipe-to-collection membership | drop | Replaced by a single location (ADR 2026-08-28). |

## Acceptance criteria

### COL-01 Collections need a signed-in owner
**Given** a request with no session **When** it calls any collection endpoint (list, create, rename or move, delete) **Then** it is rejected with 401 and nothing is read or changed.
Cites: `backend/src/routes/collections.test.ts` "rejects requests with no session"

### COL-02 Collections are private to their owner
**Given** a collection owned by Alice **When** Bob tries to rename, move or delete it, or to create a collection or file a recipe under it **Then** the response is 404 ("Collection not found", or "Parent collection not found" for a create or a move target), exactly as if it did not exist, and nothing changes. The list endpoint returns only the caller's own collections.
Cites: `backend/src/routes/collections.test.ts` "refuses to create a collection under another user's collection", "refuses to rename another user's collection", "refuses to delete another user's collection"

### COL-03 Where a recipe lives: Home versus a collection
**Given** every recipe has a single location, which is either Home or exactly one collection **When** the app decides where a recipe appears **Then** these rules hold, and SRCH and REC must use the same ones:
1. A recipe is "at Home" if and only if it has no collection. It is "in collection C" if and only if its location is C. There is no third state, and never more than one location.
2. A recipe created without a collection is at Home. A recipe created with a collection id is in that collection. Editing a recipe never changes its location. Only the move action does (COL-17).
3. Browsing Home lists the recipes whose location is Home, plus the top-level collections. It does not list recipes that are inside a collection, however deeply nested.
4. Browsing collection C lists C's direct sub-collections plus the recipes whose location is C. It does not list recipes in C's sub-collections or in C's parent.
5. Recipe lists are newest-created first.
6. A search or tag filter on the library page is a different mode: it ignores the direct-contents rule and covers the whole subtree (COL-04).
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "shows top-level collections and the recipes filed directly at Home", "renders a collection's sub-collections and its direct recipes", ADR 2026-09-23

### COL-04 Search scope from a library page
**Given** the owner is on Home or on collection C and a search term or tag filter is active **When** results load **Then** the results are one flat list of matches from C and all of its descendants (at Home: the whole library), and each result is captioned with its full location as plain text such as "Home / Baking / Cookies" (a recipe at Home is captioned "Home"). The sub-collection list and the create-collection form are not shown in this mode. A "Search everywhere" link appears only when inside a collection. It repeats the same search and tag against the whole library, and it is absent at Home. The page says how many results there are, and for what, in which scope ("your whole library" at Home, otherwise the collection name). An active tag shows as a removable chip. Removing it returns to browse mode when there is no search term. Ranking, matching, tag semantics and the `q`/`tag` parameters belong to SRCH.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "searches this collection and everything below it, labelling where each result lives", "offers a Search everywhere link that drops the folder scope", "filters the whole library by tag at Home, and the tag can be cleared", ADR 2026-09-23

### COL-05 Empty and not-found states
**Given** a folder view **When** it has no sub-collections and no recipes in browse mode **Then** it shows an empty state: "Your library is empty" at Home, "This collection is empty" inside a collection. In search mode with no matches it shows "No recipes match", with a hint to search everywhere when inside a collection. **Given** the URL names a collection that does not exist, is not the caller's, or has a non-numeric id **When** the page loads **Then** it shows "Collection not found" with a link back to the library, and no folder contents.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "shows an empty state when the library has nothing in it", "shows an empty state when a collection has no sub-collections or recipes", "says so when the collection doesn't exist (or isn't yours)", "offers a Search everywhere link that drops the folder scope"

### COL-06 Home page lists top-level collections only
**Given** a library with nested collections **When** the owner opens Home (the app's landing page) **Then** only collections with no parent are listed as folders, each with its recipe count in parentheses. Nested collections appear only inside their parent's page.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "only lists root-level collections, not nested ones", "shows top-level collections and the recipes filed directly at Home"

### COL-07 Collection counts
**Given** a collection row in a folder view **When** it is shown **Then** its count is the number of recipes directly in that collection, not including its sub-collections. In browse mode the page header also shows how many sub-collections and how many recipes the current folder directly holds, pluralised ("1 collection", "2 recipes"), but only when the folder is not empty.
Cites: `backend/src/routes/collections.test.ts` "creates and lists a root-level collection with a recipe count"

### COL-08 Create a collection
**Given** the owner is in browse mode on Home or on collection C **When** they enter a name and submit the form **Then** a collection of that name is created under Home or under C (201), the list refreshes, and the input clears. The submit button is disabled while the trimmed name is empty. A new collection starts with a count of 0. If the request fails, a toast "Failed to create collection" is shown.
Cites: `backend/src/routes/collections.test.ts` "creates and lists a root-level collection with a recipe count", "creates a nested collection under a parent"; `frontend/src/pages/CollectionsPage.test.tsx` "creates a root-level collection and reloads the list", "creates a sub-collection inside the currently viewed collection"

### COL-09 Name validation
**Given** a create or rename request **When** the name is empty or only whitespace, or missing **Then** it is rejected with 400. Otherwise the name is stored trimmed of surrounding whitespace. There is no maximum length today (see open question 4). The parent id, when given, must be a positive integer or null, and null or absent means top level.
Cites: `backend/src/routes/collections.test.ts` "rejects a collection with no name"

### COL-10 Sibling names are unique, other names may repeat
**Given** two collections with the same parent (or two at the top level) of the same owner **When** a create, rename or move would give them the same name **Then** it is refused and nothing is saved. Names are compared exactly (case-sensitive). **Given** collections that are not siblings **When** they share a name (for example "Desserts" under both "Baking" and "Dinners") **Then** that is allowed. Today a refused duplicate surfaces as a generic server error (500) and the UI shows "Failed to create collection" or "Failed to save changes". See open question 2.
Cites: `backend/src/routes/collections.test.ts` "allows the same name for collections that are not siblings", ADR 2026-08-28

### COL-11 Nesting depth
**Given** a collection **When** the owner creates sub-collections under it **Then** there is no limit on depth. A collection's parent is either none (top level) or another collection of the same owner.
Cites: `backend/src/routes/collections.test.ts` "creates a nested collection under a parent", ADR 2026-08-28

### COL-12 Rename a collection
**Given** the owner is viewing collection C **When** they choose Rename **Then** the heading becomes a form with the name, pre-filled, and a parent selector, with Save and Cancel. Saving with a non-empty name updates C (200 with the new name and count), refreshes the list, and leaves edit mode. Save is disabled while the name is blank. Cancel discards the draft. Failure shows a toast "Failed to save changes". Rename is not offered on Home, which is not a collection.
Cites: `backend/src/routes/collections.test.ts` "renames a collection"; `frontend/src/pages/CollectionsPage.test.tsx` "renames a collection"

### COL-13 Move a collection under another parent
**Given** collection C in the rename form **When** the owner picks a different parent, or "Home (top level)" **Then** saving moves C, with all its contents, under that parent (200, new parent id). The parent selector lists the whole tree depth-first with indentation (two branches may share a name), and it leaves out C and all of C's descendants so an impossible destination is never offered. The target parent must exist and belong to the caller (COL-02).
Cites: `backend/src/routes/collections.test.ts` "reparents a collection to a different collection"; `frontend/src/lib/collectionTree.test.ts` "flattens depth-first with depths, regardless of input order", "collects a collection's whole subtree, including itself"

### COL-14 A collection can never be moved inside itself
**Given** collection C **When** an update sets C's parent to C itself or to any descendant of C **Then** it is rejected with 400 ("A collection can't be moved inside itself or its own contents") and the tree is unchanged.
Cites: `backend/src/routes/collections.test.ts` "refuses to reparent a collection into its own descendant", "refuses to reparent a collection under itself"

### COL-15 Delete a collection and everything inside it
**Given** collection C with sub-collections and recipes **When** the owner confirms Delete **Then** C, all its descendant collections and every recipe located anywhere in that subtree are deleted together (204), along with the recipes' ingredients, steps, tag links and stored photos. Recipes at Home, and recipes in other collections, are never touched. Photo files for the whole subtree are removed from storage after the data is deleted, and a file that cannot be removed does not fail the request. After deleting, the app goes to the deleted collection's parent (or Home) and the list no longer shows it, including when the deleted collection was top level.
Cites: `backend/src/routes/collections.test.ts` "deletes a collection, cascading to its sub-collections and recipes", "never touches recipes at Home when deleting a collection"; `frontend/src/pages/CollectionsPage.test.tsx` "deletes a root-level collection and reflects that on Home", "deletes a collection, warning about what's inside it, and navigates to its parent", ADR 2026-08-28

### COL-16 Delete confirmation states what will be lost
**Given** the owner chooses Delete on a collection **When** the confirmation dialog opens **Then** it is titled "Delete this collection?" and says how many sub-collections and recipes (summed over the whole subtree, not only direct ones) will be deleted, for example "This deletes 3 recipes inside it. This can't be undone." Singular and plural are respected. When it holds nothing, it says only "This can't be undone." Cancelling deletes nothing. A failed delete shows a toast "Failed to delete collection".
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "deletes a collection, warning about what's inside it, and navigates to its parent"

### COL-17 Move a recipe between locations (API)
**Given** a recipe the caller owns **When** the caller moves it to a collection id, or to null **Then** the recipe's single location becomes that collection, or Home, and the updated recipe is returned. A collection id that does not exist or belongs to someone else gives 404 and leaves the recipe where it was. The body must contain the collection field, which is a positive integer or null; an absent or malformed field is rejected with 400 rather than silently moving the recipe to Home. Moving a recipe that does not exist or belongs to someone else gives 404, and a malformed recipe id gives 400. In every one of these failures nothing moves. Creating a recipe takes the same optional collection id with the same ownership check. The recipe endpoints themselves are specified in REC.
Cites: `frontend/src/components/RecipeCollectionPicker.test.tsx` "moves the recipe to a different collection when a new one is selected", "moves the recipe back to Home"; `backend/src/routes/recipes.test.ts` "moves a recipe to a different collection", "moves a recipe back to Home with a null collectionId", "rejects a move with no collectionId at all", "refuses to move a recipe into another user's collection", "refuses to move another user's recipe"

### COL-18 Move a recipe from its detail page
**Given** the recipe detail page **When** it shows the Collection section **Then** it shows the recipe's location as a breadcrumb trail (a recipe at Home shows just "Home", linking to Home) and a selector of all collections, indented, with "Home (top level)" as the first option, preselected to the current location. Choosing a different option moves the recipe and refreshes the page, and the breadcrumb updates. Choosing the current location does nothing. While the move runs, "Moving…" shows. Failure shows a toast "Failed to move recipe".
Cites: `frontend/src/components/RecipeCollectionPicker.test.tsx` "shows the breadcrumb trail for the recipe's current collection", "shows a Home recipe as living at Home", "moves the recipe to a different collection when a new one is selected", "moves the recipe back to Home"

### COL-19 Breadcrumbs
**Given** the owner is in collection C **When** the page shows the breadcrumb **Then** it is the trail "Home / ancestor / ... / C", root first, and every crumb links to that folder (Home is `/`, a collection is `/collections/<id>`). The last crumb is marked as the current page. Home itself shows no breadcrumb. The trail is also available as plain text ("Home / Baking / Cookies") where a link cannot be nested, namely the caption on a search result.
Cites: `frontend/src/lib/collectionTree.test.ts` "builds a root-first breadcrumb, empty for Home", "labels a location as a plain-text path starting at Home", "maps folders to library URLs and recognizes them"; `frontend/src/components/RecipeCollectionPicker.test.tsx` "shows the breadcrumb trail for the recipe's current collection"

### COL-20 Drag a recipe onto a folder to move it
**Given** the owner is in browse mode **When** they drag a recipe card onto a sub-collection row, onto an ancestor crumb of the breadcrumb, or onto the Home crumb **Then** the recipe is moved there (to Home for the Home crumb), the folder view reloads, and the drop target is highlighted while the drag hovers it. Only recipe-card drags count: dragging a plain link or selected text does not light up or trigger any target. The current folder's own (last) crumb is not a drop target. A failed move shows a toast "Failed to move recipe". Recipe cards are draggable only in browse mode, not in search results. A recipe dropped anywhere that is not a target must not navigate the page away.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "moves a recipe to a sub-collection when dropped on its row", "moves a recipe to an ancestor when dropped on its breadcrumb crumb", "moves a recipe to Home when dropped on the Home crumb", "does not offer the current collection's own crumb as a drop target"; `frontend/src/lib/recipeDrag.test.ts` "round-trips a recipe id through setData/getData", "getDraggedRecipeId returns null when the payload is missing or malformed", "isRecipeDrag distinguishes a recipe-card drag from any other drag"

### COL-21 New recipe and Import file into the current folder
**Given** the owner is on Home or on collection C **When** they choose New recipe or Import **Then** the new recipe form (or import) starts with its location preset to C, or to Home on Home, and it can be changed on the form before saving. A newly saved recipe returns the owner to its folder. An import started from a folder files the result there, using the folder where it was started, even if the dialog is reopened elsewhere meanwhile. The form and the import job themselves are specified in REC and IMP.
Cites: `frontend/src/pages/CollectionsPage.test.tsx` "offers New recipe straight into Home", "offers New recipe pre-filed into this collection", ADR 2026-09-23

### COL-22 Listing collections
**Given** the owner has collections **When** the list endpoint is called **Then** it returns all of the caller's collections as one flat list (id, parent id, name, created time, direct recipe count) ordered by name. The client builds each folder view, its sub-collections, its breadcrumb and the move selectors from this single list, with no per-folder request.
Cites: `backend/src/routes/collections.test.ts` "creates and lists a root-level collection with a recipe count", ADR 2026-09-23

### COL-23 Existing data: legacy "Other" collection
**Given** the legacy database has each user's auto-created top-level "Other" collection, and may hold recipes that were once in several collections **When** data is carried to the new app **Then** every recipe keeps exactly one location (a recipe that was in several collections keeps the one with the lowest id). Recipes directly in a top-level collection named exactly "Other" move to Home. That "Other" collection is removed only if it then has no sub-collections, otherwise it stays as an ordinary folder. New accounts get no "Other" collection.
Cites: `backend/migrations/1700000000010_nest-collections.js`, `backend/migrations/1700000000012_recipes-at-home.js`, ADR 2026-09-23

### COL-24 Loading and failure
**Given** the library page loads **When** recipes are still loading for the first time **Then** placeholder cards are shown. When the owner changes search term or tag, the previous results stay on screen with a small "Searching" indicator instead of being replaced by placeholders. A failure to load collections or recipes shows an error message on the page.
Cites: `frontend/src/pages/CollectionsPage.tsx`

## Rationale
- COL-03, COL-04: ADR 2026-09-23 chose "a folder shows only what is directly in it" (rejected: showing nested recipes, which would make Home a second "all recipes" list) and "search covers the folder and everything beneath" (rejected: always searching everything). At Home the search scope is the whole library, which replaced the old separate all-recipes page. SRCH and REC should refer to COL-03 rather than restate it.
- COL-03 rule 1: the legacy store used a nullable collection reference. In the rewrite it can be modelled differently, as long as the observable rules hold.
- COL-10: legacy used two unique indexes because a NULL parent is not equal to another NULL in a single unique constraint. The rewrite needs the same rule that top-level names are unique too, however it is built (ADR 2026-08-28).
- COL-14: the check follows the parent chain so a collection can never end up under its own descendant, which would disconnect the whole branch from Home.
- COL-15: deletion is deliberately destructive (ADR 2026-08-28), chosen over promoting contents to the parent or refusing to delete a non-empty folder. The confirmation count (COL-16) is the safeguard. Photo files live outside the data store, so the files for the whole subtree must be found before the rows disappear.
- COL-17: the move body field is required, not defaulted, so a malformed request cannot send a recipe to Home by accident.
- COL-20: the drag payload is a dedicated type so that an ordinary link drag is never mistaken for a recipe, and drops outside targets are swallowed, because a recipe card is itself a link and the browser would otherwise navigate to it.
- COL-23: the migration archived the many-to-many membership before collapsing it. The restart's data migration should preserve the same "lowest id wins" outcome (design section 11).

## Tests not carried
- None. Every test case in the listed test files is carried by a criterion above, and the five recipe-move tests in `backend/src/routes/recipes.test.ts` (a file REC owns) are cited on COL-17. The helper `backend/src/utils/groupBy.ts` and `frontend/src/hooks/useRecipeDropTargets.ts` have no tests of their own and no behaviour beyond COL-20.

## Open questions for the owner
1. Keep "deleting a folder deletes everything inside it"? Recommend keep, with the count warning, as decided in 2026-08-28. Optionally add an undo or a recently-deleted bin, but that is a new feature, so post-release.
2. A duplicate sibling name currently produces a generic 500. Recommend the rewrite returns 409 with a clear message ("A collection with that name already exists here") and shows it in the form (`owner?` only if you would rather keep today's behaviour exactly).
3. Drag and drop works with a mouse only, not on iPhone, which is the main device. Recommend keeping it for desktop, but making sure the dropdown move (COL-18) is also reachable from the folder view's recipe cards on touch devices. This is new UI, so it is the owner's call.
4. Collection names have no length limit. Recommend a cap (for example 100 characters) in line with recipe titles. Check REC's cap and agree one number. (Merged in index.md with REC open question 6.)
5. The rename form combines rename and move. Recommend keeping it, but allowing moving a sub-collection by dragging it onto another folder is a possible later feature, not in scope now.
6. The library page heading reads "Library" while the root is called "Home" everywhere else (breadcrumb, selectors, captions). Recommend one name in the redesign; I suggest "Home" for the root crumb and page title.

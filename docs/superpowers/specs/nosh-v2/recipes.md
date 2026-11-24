# Recipes

## Purpose
Recipes are the heart of nosh: the owner creates, views, edits and deletes recipes made of a title, optional description, servings and times, an ordered ingredient list, ordered steps, free-form tags, an optional source link and photos. This area covers the recipe data and its API rules, the photo handling (including today's multiple images per recipe), and the screens for viewing, creating and editing a recipe. Unit conversion and scaling are in `units.md` (UNIT), collections and moving recipes in `collections.md` (COL), search ranking in `search.md` (SRCH), URL import in `import.md` (IMP).

## Sources
- `backend/src/routes/recipes.ts`
- `backend/src/routes/recipes.test.ts`
- `backend/src/validation/recipes.ts`
- `backend/src/repositories/recipes.ts`
- `backend/src/services/imageSniff.ts`
- `backend/src/services/imageFromUrl.ts`
- `backend/src/services/imageFromUrl.test.ts`
- `backend/migrations/1700000000001_create-recipes.js`
- `backend/migrations/1700000000002_create-ingredients.js`
- `backend/migrations/1700000000003_create-steps.js`
- `backend/migrations/1700000000004_create-tags.js`
- `backend/migrations/1700000000005_create-recipe-images.js`
- `backend/migrations/1700000000008_add-source-url-to-recipes.js`
- `frontend/src/api/recipes.ts`
- `frontend/src/pages/RecipeDetailPage.tsx`
- `frontend/src/pages/RecipeDetailPage.test.tsx`
- `frontend/src/pages/RecipeFormPage.tsx`
- `frontend/src/pages/RecipeFormPage.test.tsx`
- `frontend/src/pages/NewRecipePage.tsx`
- `frontend/src/pages/NewRecipePage.test.tsx`
- `frontend/src/components/IngredientList.tsx`
- `frontend/src/components/AutoGrowTextarea.tsx`
- `frontend/src/components/TagChip.tsx`
- `frontend/src/components/TagChip.test.tsx`
- `frontend/src/components/TagInput.tsx`
- `frontend/src/components/TagInput.test.tsx`
- `frontend/src/components/RecipeCard.tsx`
- `frontend/src/components/RecipeCard.test.tsx`
- `frontend/src/components/ConfirmDialog.tsx`
- `frontend/src/components/ConfirmDialog.test.tsx`
- `frontend/src/components/Skeleton.tsx`
- `frontend/src/components/EmptyStateIllustration.tsx`

## ADRs
- 2026-08-05: Local disk storage for recipe images
- 2026-08-06: Recipe images served through an authenticated route, not a static mount
- 2026-08-13: Recipe photo auto-import — post-save fetch, not staged uploads
- 2026-09-23: Library unified; recipes may live at Home

## Features
| Feature | Verdict | Why |
|---|---|---|
| Recipe create, view, edit, delete | keep | Core of the app. |
| Title, description, servings, prep and cook minutes | keep | Parity. |
| Ingredients as quantity / unit / name rows (free-text quantity) | keep | Free text carries "2-3", "½", "a pinch"; UNIT parses it for scaling. |
| Ordered steps | keep | Parity. |
| Free-form tags on a recipe | keep | Parity; tag browsing lives in the library. |
| Source URL link ("Imported from …") | keep | Parity; shown on imported recipes. |
| Photo upload (JPEG, PNG, WEBP, HEIC/HEIF, up to 5 MB) | keep | Parity, plus HEIC/HEIF (owner, index Q13). |
| Photo attach from a URL (used by import) | keep | Import fetches the photo after save (ADR 2026-08-13). |
| Image gallery (multiple images per recipe) | drop | Decided by the owner (index Q4): every stored photo is migrated and kept, but the UI shows and edits one cover photo, which can be replaced (after a confirmation) or removed; other v1 photos stay stored, hidden. A gallery may come back later. |
| Drag-and-drop photo upload on the recipe form | keep | Cheap on desktop; harmless on phone. |
| Confirm before deleting a recipe or photo, or replacing the cover photo | keep | Destructive actions are irreversible; replacing the cover deletes the old one (index Q4, REC-33). |
| New-recipe form seeded from a finished import, opened from the dialog, a toast or a notification tap | keep | The owner always reviews an import before anything is saved (REC-36, REC-37; the import side is IMP-41 to IMP-45). |
| Tag names normalised to one case | keep | Decided by the owner (index Q5): tags are case-insensitive, stored lower-case, and merged on migration (REC-07, REC-35, SRCH-21). |
| HEIC/HEIF photos (iPhone default) | keep | Decided by the owner (index Q13): accepted on upload and converted to JPEG (REC-14). |

## Acceptance criteria

### REC-01 Recipes need a session
**Given** a visitor with no session **When** they call any recipe endpoint (list, read, create, update, delete, image upload, image read, image delete, image from URL) **Then** the answer is 401 and nothing is read or changed.
Cites: `backend/src/routes/recipes.test.ts` "rejects requests with no session", `backend/src/routes/recipes.ts`

### REC-02 Create a recipe with its content
**Given** a signed-in owner **When** they create a recipe with a title, description, servings, prep and cook minutes, ingredients, steps and tags **Then** the answer is 201 with the saved recipe, including an id, the owner's user id, created and updated timestamps, the ingredients and steps each with an id and a zero-based position in the order sent, the tags, an empty image list and its collection.
Cites: `backend/src/routes/recipes.test.ts` "creates a recipe with nested ingredients, steps, and tags", `backend/migrations/1700000000001_create-recipes.js`, `backend/migrations/1700000000002_create-ingredients.js`, `backend/migrations/1700000000003_create-steps.js`

### REC-03 Recipe input rules
**Given** a create or update request **When** it is validated **Then** these rules hold, and a violation is a 400 whose body is `{ "error": <message> }`:
- `title` is required; leading and trailing whitespace is trimmed and a blank title is refused; at most 200 characters.
- `description`, if given, is non-blank after trimming (an empty string is refused; use `null` or omit it for none). Omitted means `null`.
- `servings` is a positive whole number or `null`.
- `prepTimeMinutes` and `cookTimeMinutes` are positive whole numbers or `null`; 0 is refused. A 0 stored by v1 is carried over as `null`.
- `ingredients` and `steps` default to an empty list, with at most 100 ingredients and at most 100 steps. Each ingredient needs a non-blank `name`; `quantity` and `unit`, if given, are non-blank text or `null`. Each step needs a non-blank `instruction`.
- `tags` defaults to an empty list, with at most 30 tags; each tag is non-blank text after trimming.
- All text values are stored trimmed.
- There are no other maximum lengths.
Decision: owner 2026-11-24, index Q12 and Q17 (v1 had no caps, and accepted 0 minutes, which it then never displayed)
Cites: `backend/src/routes/recipes.test.ts` "rejects a recipe with no title", `backend/src/validation/recipes.ts`

### REC-04 Source URL
**Given** a recipe **When** it is created, read or updated **Then** `sourceUrl` is `null` unless given; a given value must be an `http` or `https` URL (anything else, such as `javascript:` or `ftp:`, is a 400); surrounding whitespace is trimmed; it comes back unchanged on read; and updating with `null` clears it.
Cites: `backend/src/routes/recipes.test.ts` "defaults sourceUrl to null and round-trips it when provided", `backend/migrations/1700000000008_add-source-url-to-recipes.js`

### REC-05 Ingredient and step order
**Given** a recipe saved with several ingredients and steps **When** it is read back **Then** ingredients and steps come back in the order they were saved, each carrying its position.
Cites: `backend/src/routes/recipes.test.ts` "creates a recipe with nested ingredients, steps, and tags", `backend/src/repositories/recipes.ts`

### REC-06 Ingredient quantity is free text
**Given** an ingredient **When** it is saved **Then** `quantity` is stored as the text given (for example "2-3", "1/2", "a pinch" or "1.5"), `unit` is optional, and an ingredient with only a name is valid.
Cites: `backend/src/validation/recipes.ts`, `backend/migrations/1700000000002_create-ingredients.js`, `frontend/src/pages/RecipeDetailPage.test.tsx` "offers no scale-from button for amounts that can't anchor"

### REC-07 Tags
**Given** recipes with tags **When** they are saved and read **Then**:
- a tag is stored trimmed and lower-cased ("Soup" is stored as "soup");
- a tag name is created the first time any recipe uses it and reused afterwards (one tag per lower-cased name, shared across all users' recipes in the tags table);
- repeating the same name within one recipe, in any letter case, stores it once;
- a recipe's tags come back sorted alphabetically by name, not in the order sent;
- saving a recipe replaces its tag set; removing a recipe, or a tag from a recipe, leaves the tag name in the tags table;
- v1 tags that differ only in letter case are merged into one lower-cased tag when data is carried over, and a recipe linked to several of them keeps one link.
Decision: owner 2026-11-24, index Q5 (v1 stored tags as typed, case-sensitive: "Soup" and "soup" were two tags)
Cites: `backend/src/routes/recipes.test.ts` "creates a recipe with nested ingredients, steps, and tags", `backend/migrations/1700000000004_create-tags.js`, `backend/src/repositories/recipes.ts`

### REC-08 Read one recipe
**Given** a signed-in owner **When** they read a recipe by id **Then** they get 200 with the full recipe (ingredients, steps, tags, images). A recipe id that does not exist, or belongs to another user, is a 404 `Recipe not found` (a recipe's existence is never revealed to others); an id that is not a positive whole number is a 400 `Invalid recipe id`.
Cites: `backend/src/routes/recipes.test.ts` "fetches a recipe by id", "hides another user's recipe behind a 404", "rejects a non-numeric recipe id"

### REC-09 List my recipes
**Given** several users each with recipes **When** one lists recipes **Then** only their own come back, newest created first, each with its ingredients, steps, tags and images.
Cites: `backend/src/routes/recipes.test.ts` "lists only the current user's recipes", `backend/src/repositories/recipes.ts`

### REC-10 List filters
**Given** a library with recipes at Home and in nested collections **When** the owner lists recipes with filters **Then**:
- `tag=<name>` returns only recipes carrying that tag, compared ignoring letter case (a recipe with several tags still appears once);
- `collection=root` returns only recipes directly at Home;
- `collection=<id>` returns only recipes directly in that collection;
- `within=<id>` returns recipes in that collection and every collection nested beneath it;
- filters combine;
- a collection id that is not the owner's yields an empty list, never another user's recipes;
- a malformed `collection` (not `root` or a positive whole number) or `within` is a 400; an unusable `tag` is ignored.
The same filters apply to search (see SRCH); collection semantics are in COL.
Decision: owner 2026-11-24, index Q5 (v1 matched the exact tag name, case-sensitively)
Cites: `backend/src/routes/recipes.test.ts` "filters the recipe list by tag", "lists only the recipes directly at Home with collection=root", "lists only the recipes directly in one collection", "includes every nested sub-collection with within", "never returns another user's recipes through within", "rejects a malformed folder filter", `frontend/src/api/recipes.ts`

### REC-11 Where a new recipe goes
**Given** a signed-in owner **When** they create a recipe **Then** with no `collectionId` (or `null`) it sits at Home and no placeholder collection is created; with the id of one of their own collections it is filed there; with a collection that does not exist or belongs to someone else the answer is 404 `Collection not found` and no recipe is created.
Cites: `backend/src/routes/recipes.test.ts` "puts a new recipe at Home when no collection is given", "creates a recipe directly into a given collection", "refuses to create a recipe in another user's collection", ADR 2026-09-23

### REC-12 Update a recipe
**Given** an owner's recipe **When** they save changes **Then** title, description, servings, times and source URL are replaced by the request, the ingredients and steps are replaced wholesale by the lists sent (new positions from zero), the tags are replaced, and the recipe's collection and its images are left untouched (moving a recipe is a separate action, see COL). The answer is 200 with the updated recipe and the updated timestamp moves forward. Another user's or an unknown recipe is a 404.
Cites: `backend/src/routes/recipes.test.ts` "updates a recipe, replacing its ingredients and steps", "refuses to update another user's recipe", `backend/migrations/1700000000001_create-recipes.js`

### REC-13 Delete a recipe
**Given** an owner's recipe **When** they delete it **Then** the answer is 204, the recipe and its ingredients, steps, tag links and image records are gone, its image files are removed from storage (a file that is already missing is not an error), and reading it afterwards is a 404. Another user's or an unknown recipe is a 404 and nothing is deleted. Deleting the owning user's account removes their recipes too.
Cites: `backend/src/routes/recipes.test.ts` "deletes a recipe", "refuses to delete another user's recipe", `backend/migrations/1700000000002_create-ingredients.js`, `backend/migrations/1700000000005_create-recipe-images.js`

### REC-14 Photo upload: types, size, checks
**Given** an owner's recipe **When** they upload a photo (one file per request) **Then** it is accepted only if it is JPEG, PNG, WEBP or HEIC/HEIF, at most 5 MB, and its actual bytes match the declared type (a text or HTML file labelled as an image is refused). A HEIC/HEIF photo is converted and stored as JPEG. It is stored under a generated unguessable name with the extension for its stored type. The answer is 201 with the image, which becomes the recipe's cover or replaces it (REC-15). A wrong type, a mismatched file, a file over 5 MB or a missing file is a 400 with a message saying which, and nothing is stored. The 20-photo cap never refuses an upload (REC-15).
Decision: owner 2026-11-24, index Q4, Q12 and Q13 (v1 refused HEIC/HEIF, added every upload beside the existing photos, and had no cap on photos per recipe)
Cites: `backend/src/routes/recipes.test.ts` "uploads an image to a recipe", "rejects an unsupported image type", `backend/src/services/imageSniff.ts`, `backend/migrations/1700000000005_create-recipe-images.js`, ADR 2026-08-05

### REC-15 Photos: one cover, the rest kept hidden
**Given** a recipe **When** its photos are read or changed **Then**:
- a recipe has at most one cover photo, the only photo shown anywhere (library card, detail page, form); the recipe read says which photo is the cover, or that there is none;
- adding a photo (upload, REC-14, or from a URL, REC-18) to a recipe with no cover makes it the cover;
- adding a photo to a recipe that has a cover replaces it as one step: the new photo becomes the cover and the old cover's record and file are deleted; if the new photo is refused, the old cover stays;
- removing the cover (REC-17) leaves the recipe with no photo;
- photos carried over from v1 keep their order; the first one (lowest position) becomes the cover, and every other one stays stored but is never shown and never becomes the cover, also not when the cover is removed or replaced;
- a recipe never gains a stored photo beside its cover, so the 20-photo cap never refuses a replace or a new cover, however many hidden v1 photos the recipe holds;
- there is no way to reorder photos.
Decision: owner 2026-11-24, index Q4 and Q12 (v1 appended a new photo after the last one, kept every photo, showed the lowest-position photo as the cover so removing it promoted the next one, and had no cap)
Cites: `backend/src/routes/recipes.test.ts` "uploads an image to a recipe", `backend/src/repositories/recipes.ts`, `backend/migrations/1700000000005_create-recipe-images.js`

### REC-16 Photos are served only to their owner
**Given** a stored photo **When** its URL is requested **Then** the owner gets the file (200); a request with no session is 401; another user, an unknown recipe, an unknown image, or an image id that belongs to a different recipe is 404; a non-numeric id is 400. There is no public static route to the files.
Cites: `backend/src/routes/recipes.test.ts` "serves an uploaded image back to its owner", "refuses to serve an image without a session", "refuses to serve another user's image", ADR 2026-08-06

### REC-17 Remove a photo
**Given** a recipe photo **When** the owner removes it **Then** the answer is 204, the image record and its file are deleted (a missing file is not an error), and the recipe's image list no longer contains it. Removing the cover leaves the recipe with no photo; no hidden photo takes its place (REC-15). An image not found on that recipe is a 404.
Decision: owner 2026-11-24, index Q4 (v1 showed the lowest remaining photo as the new cover)
Cites: `backend/src/routes/recipes.test.ts` "deletes an image from a recipe"

### REC-18 Attach a photo from a URL
**Given** an owner's recipe and an `http(s)` image URL **When** they ask nosh to attach it **Then** the server fetches the image itself and stores it as a new photo exactly as an upload would be (201 with the image, which becomes the cover, or replaces the cover as one step when there is one, REC-15). Ownership is checked before anything is fetched. The URL is checked against the SSRF rules (see SEC) before every request and on every redirect (up to 5 redirects are followed); a blocked address, such as a metadata or private address, is a 400 and nothing is fetched. The fetch has a 10 second timeout. The same limits as upload apply: JPEG, PNG or WEBP by the response type, bytes that match that type, and 5 MB, checked both from the declared length and while reading. A user may make at most 60 such requests per hour (see SEC).
Decision: owner 2026-11-24, index Q4 (v1 gave the fetched photo the next position after the last one and kept every existing photo)
Cites: `backend/src/routes/recipes.test.ts` "attaches an image fetched from a URL", "requires ownership to attach an image from a URL", "rejects a from-url attach pointed at a blocked host", `backend/src/services/imageFromUrl.test.ts` "fetches an allowed image URL and reports its extension", "maps %s to %s", "rejects a blocked host before making any request", "rejects a redirect into a blocked host", "follows a redirect to an allowed host", ADR 2026-08-13

### REC-19 Photo-from-URL failures
**Given** an attach-from-URL request **When** it cannot complete **Then** the answer is a specific status and message, never a 500, and no photo is added: a malformed or blocked URL is 400; a type that is not JPEG, PNG or WEBP, bytes that do not match the type, or an image over 5 MB is 422; a non-success response from the remote server, a network failure, a timeout, a redirect with no target, or more than 5 redirects is 502.
Cites: `backend/src/routes/recipes.test.ts` "surfaces a from-url fetch failure as a real status, not a 500", `backend/src/services/imageFromUrl.test.ts` "rejects an unsupported content type", "rejects a body whose bytes don't match the declared image type", "rejects an image declared too large via content-length", "rejects an image that exceeds the cap while streaming, despite no content-length", "throws ImageFetchError on a non-2xx status", "throws ImageFetchError when the fetch itself rejects", "throws ImageFetchError after too many redirects"

### REC-20 Detail page shows the recipe
**Given** a recipe **When** the owner opens it **Then** the page shows the title, the description if any, a line with "Serves N", "Prep N min" and "Cook N min", each shown only when its value is set, the tags, the ingredients as a numbered list (shown only when there are any), and the steps as a numbered list (shown only when there are any). Amounts are shown scaled and in the owner's units (see UNIT) and oven temperatures in steps in the owner's temperature unit. There are edit and delete controls and a link back to the library at the recipe's collection.
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, `frontend/src/components/IngredientList.tsx`, `frontend/src/pages/RecipeDetailPage.test.tsx` "shows amounts in the user's units and converts oven temperatures"

### REC-21 Detail page photo
**Given** a recipe **When** its detail page is shown **Then** the cover photo (REC-15) is shown large; with no cover a placeholder is shown instead. Hidden photos carried over from v1 are never shown.
Decision: owner 2026-11-24, index Q4 (v1 showed further photos as a row of small, unclickable thumbnails)
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, ADR 2026-08-06

### REC-22 Detail page source link
**Given** a recipe with a source URL **When** the detail page is shown **Then** an "Imported from <hostname>" link opens the source in a new tab. A stored value that is not a valid `http(s)` URL shows no link and never breaks the page.
Cites: `frontend/src/pages/RecipeDetailPage.tsx`

### REC-23 Detail page tags
**Given** a recipe with tags **When** the owner selects a tag **Then** the library opens at Home filtered by that tag across the whole library (not limited to the recipe's collection; see SRCH).
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, `frontend/src/components/TagChip.tsx`

### REC-24 Delete from the detail page
**Given** the detail page **When** the owner chooses delete **Then** a confirmation "Delete this recipe? This can't be undone." appears first; cancelling does nothing; confirming deletes the recipe and returns to the library at the collection it was in (Home if it had none). If the delete fails the owner sees a "Failed to delete recipe" message and stays on the page.
Cites: `frontend/src/pages/RecipeDetailPage.tsx`

### REC-25 Detail page loading and errors
**Given** the detail page **When** the recipe is loading **Then** a placeholder shaped like the page is shown with the back link already usable; if loading fails (unknown or someone else's recipe, network) the error message is shown.
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, `frontend/src/components/Skeleton.tsx`

### REC-26 Detail page scaling and units
**Given** the detail page **When** the owner changes servings or scales from an ingredient **Then** amounts, the "Serves" figure and units follow the rules in UNIT. The scale is view-only and never changes the stored recipe. (Behaviour specified in `units.md`; not duplicated here.)
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, `frontend/src/components/IngredientList.tsx`

### REC-27 Form: create and edit modes
**Given** the recipe form **When** opened at the new-recipe address **Then** it is a blank "New recipe" form; **When** opened for an existing recipe **Then** it shows "Edit recipe", loads that recipe into the fields (placeholder while loading, error message if it cannot be loaded), and links back to the recipe. A blank form starts with one empty ingredient row and one empty step row; an existing recipe with none also gets one empty row each.
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/pages/RecipeFormPage.test.tsx` "adds and removes ingredient and step rows"

### REC-28 Form: fields and rows
**Given** the form **Then** the owner can set title (required, at most 200 characters), description, servings (whole number, minimum 1), prep and cook minutes (whole numbers, minimum 1, or empty); add ingredient rows (quantity, unit, name) and step rows (instructions), up to 100 of each; and remove any row, including the last one. A prep or cook time of 0 is refused in the form with a message before anything is sent. Step numbers shown beside the rows follow their order. Long descriptions and steps are shown in full, in a text area that grows with its content rather than scrolling or clipping. A form pre-filled from an import may hold more than a cap allows (a title over 200 characters, more than 100 ingredients or steps; IMP-23): all of it is shown, and saving is refused with a message naming the cap until the owner brings it within.
Decision: owner 2026-11-24, index Q12 and Q17 (v1 had no caps and accepted 0 minutes)
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/components/AutoGrowTextarea.tsx`, `frontend/src/pages/RecipeFormPage.test.tsx` "adds and removes ingredient and step rows"

### REC-29 Form: what is sent on save
**Given** the form **When** the owner saves **Then** the request carries trimmed values; empty description, quantity and unit become `null`; empty servings, prep and cook fields become `null`; a typed "0" for servings, prep or cook time never reaches the API (REC-28); ingredient rows with a blank name and step rows with a blank instruction are dropped; tags are sent as entered; the source URL (set only by import, kept unchanged when editing) and, when creating, the chosen collection are included.
Decision: owner 2026-11-24, index Q17 (v1 sent a typed 0 as 0; the API accepted 0 minutes and refused 0 servings)
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "submits a trimmed, filtered payload and navigates to the new recipe's edit page", `frontend/src/pages/RecipeFormPage.tsx`

### REC-30 Form: saving, feedback and navigation
**Given** the form **When** the owner presses save **Then** the button shows "Saving…" and is disabled until done. On failure a visible error banner shows the server's message (or "Something went wrong"), keyboard focus moves to it, and the entered data is kept. On success, of an edit or of a create, the owner lands on the recipe's detail page; after a create, the create form is replaced in history, so Back never returns to a form that would create a duplicate.
Decision: owner 2026-11-24, index Q16 (v1 landed on the new recipe's edit form after a create, so photos could be added)
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/pages/RecipeFormPage.test.tsx` "submits a trimmed, filtered payload and navigates to the new recipe's edit page"

### REC-31 Form: collection for a new recipe
**Given** the create form **Then** a Collection choice is offered (default "Home (top level)"), preselected from the folder the owner came from (the `collection` address parameter, or the folder an import was started in), with only a positive whole number trusted (anything else means Home), and the back link returns to that folder. The choice is not offered when editing (moving is done from the detail page, see COL).
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "defaults to Home", "starts in the folder given by ?collection= (a folder's New recipe button)", "starts in the folder an import was started from (router state)", "ignores a malformed ?collection= value", "sends the chosen folder with the new recipe"

### REC-32 Form: no stale draft carried between routes
**Given** the owner has typed into the create form **When** they navigate to an edit form (or any other form instance) **Then** the fields start fresh; nothing typed earlier is carried over.
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "remounts (does not carry over state) when routing from the create form to an edit form"

### REC-33 Form: cover photo
**Given** the create or edit form **Then** a Photo section shows the current cover photo, if any, with a remove control, and lets the owner choose a file or drop one onto the drop area to add or replace it; the accepted types (JPEG, PNG, WEBP, HEIC) are stated; only the first file is taken when several are chosen.
- On the edit form with no cover, the chosen photo is uploaded at once and becomes the cover.
- On the edit form with a cover, choosing or dropping a photo first asks "Replace this photo? The current one will be deleted." (a confirmation as in REC-39, confirm label "Replace"); cancelling uploads nothing and keeps the current cover; confirming uploads the new photo, which replaces the cover and deletes the old one (REC-15). The photo cap never blocks this.
- While uploading the area shows "Uploading…" and is disabled. A failed upload keeps the current cover, if any, and shows the server's reason (for example the wrong type or over 5 MB), or "Failed to upload image" when there is none.
- On the create form nothing is stored yet: the chosen photo is shown as a preview, choosing another replaces the preview without asking, and it is uploaded right after the recipe is created; if that upload fails, the recipe stays saved and the server's reason is shown.
Decision: owner 2026-11-24, index Q4, Q16 and Q18 (v1 listed every photo as a thumbnail, added photos without removing any, said "Save the recipe first to add photos." on the create form, and showed only "Failed to upload image")
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/api/recipes.ts`

### REC-34 Form: removing a photo asks first
**Given** a photo on the edit form **When** the owner chooses remove **Then** a confirmation "Remove this photo? This can't be undone." appears and nothing is deleted yet; cancelling closes it and keeps the photo; confirming deletes the photo and it disappears from the form, leaving the recipe with no photo (no hidden v1 photo takes its place, REC-15). A failed delete shows "Failed to delete image".
Decision: owner 2026-11-24, index Q4 (v1 listed every photo, so removing one left the others in view)
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "asks for confirmation before deleting a photo, and only deletes once confirmed"

### REC-35 Tag entry
**Given** the tag field on the form **When** the owner types a tag and presses Enter or comma, or leaves the field **Then** the tag (trimmed and lower-cased) is added as a removable chip and the field clears; an empty entry or a tag already on the recipe (ignoring letter case) is ignored; once the recipe has 30 tags the field adds no more and says "At most 30 tags"; Backspace in an empty field removes the last tag; each chip has its own remove control. A hint says "Press Enter or comma to add a tag."
Decision: owner 2026-11-24, index Q5 and Q12 (v1 kept the typed case, only ignored an exact duplicate, and had no tag cap)
Cites: `frontend/src/components/TagInput.test.tsx` "commits a tag on Enter and clears the draft", "commits a tag on comma", "does not add a duplicate tag", "removes the last tag on backspace when the draft is empty", "removes a specific tag when its remove button is clicked"

### REC-36 Form: seeded from an import
**Given** the owner arrives at the create form from a finished import **Then** every field (title, description, servings, times, ingredients, steps, tags, source URL) is pre-filled for review and edit, nothing is saved until the owner presses save, and saving uses the normal create path with the source URL attached. If the import could not be translated, a notice "Couldn't translate this recipe — it's in its original language." is shown. The discovered photo, if any, is shown as the form's photo preview; the owner can replace it with their own (REC-33) or remove it. After a successful create, the photo the preview shows is stored: the owner's own photo is uploaded (REC-33); the discovered one is attached from its URL (REC-18); with none shown, nothing is attached. If attaching the discovered photo fails the recipe is still saved and a "Couldn't import the photo — add one manually" message is shown. The owner then lands on the recipe page (REC-30).
Decision: owner 2026-11-24, index Q16 (v1 landed on the edit form, had no photo choice on the create form, and never showed the discovered photo before saving)
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "pre-fills from imported recipe data passed via router state", "saves an imported recipe through the normal create path, carrying sourceUrl", "attaches the imported photo once the recipe is saved", "toasts but still saves when the imported photo fails to attach", `frontend/src/pages/NewRecipePage.test.tsx` "says when an import couldn't be translated", "shows no translation notice for a normal import", ADR 2026-08-13

### REC-37 New-recipe page opened from a finished import
**Given** the owner opens the new-recipe page for a finished import (for example by tapping a push notification, with no in-app state) **When** the page loads **Then** the import is fetched by id and the form is seeded from it (with a loading placeholder meanwhile), and the import is marked reviewed. With the data already available from the app, nothing is fetched again. If the import failed the page shows its error message and a "Start a blank recipe" link; if the import no longer exists it says "That import isn't available any more."; any other load failure says "Couldn't load that import." Without an import the page is simply the blank form and fetches nothing. (Import jobs are specified in IMP.)
Cites: `frontend/src/pages/NewRecipePage.tsx`, `frontend/src/pages/NewRecipePage.test.tsx` "is just the blank create form without an importId", "loads the import by id when cold-started from a notification (no router state)", "uses router state when it's already there, without refetching", "explains when the import failed", "explains when the import no longer exists"

### REC-38 Recipe card
**Given** a recipe in a list **Then** its card shows the cover photo (or a placeholder when there is none), the title, a line of "Serves N", "Prep N min", "Cook N min", each only when set, and its tags; an optional caption (for example the folder path in search results) appears above the title. Selecting the card opens the recipe; selecting a tag on the card filters the library by that tag instead and does not open the recipe. A card can be made draggable, carrying the recipe id, for dropping onto a collection (see COL); by default it is not draggable.
Cites: `frontend/src/components/RecipeCard.test.tsx` "clicking a tag chip filters the library by that tag, not the recipe detail page", "shows a caption above the title when given one", "clicking the card itself navigates to the recipe detail page", "is not draggable by default", "carries its id in a dedicated MIME type when draggable and dragged", `frontend/src/components/RecipeCard.tsx`

### REC-39 Confirmation dialog
**Given** a destructive action (delete recipe, remove photo, replace the cover photo) **When** the confirmation opens **Then** it shows a title and message, focus starts on Cancel (never the destructive button), the page behind cannot scroll, and the dialog closes without action on Cancel, on Escape and on a click outside it; only the confirm button ("Delete" or the given label, such as "Replace") performs the action. When closed it renders nothing.
Decision: owner 2026-11-24, index Q4 (v1 had no replace, so no replace confirmation)
Cites: `frontend/src/components/ConfirmDialog.test.tsx` "renders nothing when closed", "shows the title/message and focuses Cancel when open", "calls onCancel when Cancel is clicked", "calls onConfirm when the confirm button is clicked", "calls onCancel when the backdrop is clicked", "does not call onCancel when content inside the dialog is clicked", "calls onCancel when the native Escape/cancel event fires"

### REC-40 Loading and empty placeholders
**Given** a screen waiting for recipe data **Then** it shows placeholder shapes matching the final layout (recipe page, recipe form, recipe cards) rather than a blank screen; and the library's empty states (no recipes yet, no search results) each show an illustration rather than bare text.
Cites: `frontend/src/components/Skeleton.tsx`, `frontend/src/components/EmptyStateIllustration.tsx`, `frontend/src/components/RecipeCard.tsx`

## Rationale
- **REC-03, REC-12:** Update replaces ingredients, steps and tags rather than diffing them; the form always sends the full lists. Blank-description rejection exists because the form maps blanks to `null`; the API is stricter than the form on purpose.
- **REC-04:** only `http`/`https`, because the value is rendered as a link and a `javascript:` URL must never be storable. The detail page checks again when rendering, so a bad stored value cannot blank the page.
- **REC-11, REC-12:** a recipe's collection is only set on create or by an explicit move, never as a side effect of editing (ADR 2026-09-23: Home counts as a place, `collection_id` is nullable, no "Other" folder).
- **REC-13:** deletion removes image files on disk as well as rows; files are on a local volume (ADR 2026-08-05), so nothing else would clean them up.
- **REC-14, REC-16, REC-18:** photos are checked by their bytes, not just the claimed type, because both the browser and a remote server only claim a type (see SEC); they are served only through an owner-checked route, never a static folder (ADR 2026-08-06). Names are random so files cannot be guessed.
- **REC-18, REC-36:** the photo is attached by a second request after the recipe is saved rather than staged before it, to avoid orphaned uploads for imports that are never saved (ADR 2026-08-13). It is best-effort, so a failed photo never undoes a save.
- **REC-15:** the multi-image data model predates the editorial redesign; the UI never grew a gallery, so only the cover is really used. The design (§11) requires every image to survive migration regardless. The cover is marked, not derived from position, so removing it never surfaces a hidden v1 photo the owner has not seen in v2. Because a recipe never gains a photo beside its cover, the 20-photo cap (Q12) is never what refuses an upload: it bounds nothing new, and v1 recipes keep all their photos however many.
- **REC-36 preview:** showing the discovered photo on the form makes the Q16 precedence a knowing choice (final review, Minor 7). How the preview is loaded (directly or through the server) is the builder's call.
- **REC-30, REC-33:** v1 landed on the edit form after a create because photos need a saved recipe id. The owner chose to take the photo on the create form and upload it right after the create (index Q16), the same best-effort pattern as the import photo (ADR 2026-08-13).

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q4 several photos per recipe: every photo is migrated and kept; the UI shows and edits one replaceable cover; a new photo becomes the cover. REC-14, REC-15, REC-17, REC-18, REC-21, REC-33, REC-34, REC-39; gallery row dropped. The following sub-rules are a controller proposal, owner to confirm (final review, Important 4):
  - replacing the cover asks for confirmation first ("Replace this photo? The current one will be deleted."), the same as deleting a photo (REC-33, REC-34, REC-39);
  - after confirmation the new photo becomes the cover and the old cover is deleted (REC-15, REC-33);
  - extra photos migrated from v1 stay stored but are never shown and never promoted, so removing the cover leaves the recipe with no photo (REC-15, REC-17, REC-21, REC-34);
  - replacing the cover is a swap, so it is never blocked by the 20-photo cap (REC-14, REC-15).
  - Applier choice beyond the controller proposal, owner to confirm: setting a cover on a recipe that has none is not blocked by the cap either, so a v1 recipe with 20 or more hidden photos whose cover was removed can still get a new one (REC-15).
- Q5 tag case: tags are case-insensitive, stored lower-case, merged on migration. REC-07, REC-10, REC-35 (and SRCH-21).
- Q12 caps: title 200 characters, 100 ingredients, 100 steps, 30 tags, 20 photos per recipe. The tag field stops at 30; an imported draft over a cap opens in the form, which refuses to save until it is within (applier choice from the final review, Minor 3). REC-03, REC-14, REC-15, REC-28, REC-35 (collection names: COL-09; imports: IMP-23).
- Q13 HEIC: accepted on upload and converted to JPEG. REC-14, REC-33 (and SEC-25).
- Q16 after saving a new recipe: the create form takes a photo and the owner lands on the recipe page; a photo chosen on the form beats the imported one. REC-30, REC-33, REC-36 (and IMP-45). The imported photo is shown as the form's preview so the owner chooses knowingly (applier choice from the final review, Minor 7, owner to confirm).
- Q17 zero times: 0 minutes is refused in the form and by the API; a stored 0 is carried over as none. REC-03, REC-28, REC-29.
- Q18 upload errors: the server's reason is shown. REC-33.
- Q35 duplicating a recipe: out of scope for the first release. No criterion.

## Tests not carried
- `backend/src/routes/recipes.test.ts` "finds a recipe via full-text search on an ingredient name": search ranking and matching belong to SRCH.
- `backend/src/routes/recipes.test.ts` "requires a query parameter for search": belongs to SRCH.
- `backend/src/routes/recipes.test.ts` "combines a text search with a tag filter": belongs to SRCH.
- `backend/src/routes/recipes.test.ts` "scopes a text search to a folder's subtree with within": belongs to SRCH (and COL).
- `backend/src/routes/recipes.test.ts` "moves a recipe to a different collection": moving recipes belongs to COL.
- `backend/src/routes/recipes.test.ts` "moves a recipe back to Home with a null collectionId": belongs to COL.
- `backend/src/routes/recipes.test.ts` "rejects a move with no collectionId at all": belongs to COL (a missing `collectionId` is a 400, never a silent move to Home).
- `backend/src/routes/recipes.test.ts` "refuses to move a recipe into another user's collection": belongs to COL (404).
- `backend/src/routes/recipes.test.ts` "refuses to move another user's recipe": belongs to COL (404).
- `frontend/src/pages/RecipeDetailPage.test.tsx` "shows US units when that's the preference": unit conversion belongs to UNIT.
- `frontend/src/pages/RecipeDetailPage.test.tsx` "rescales every amount with the servings stepper": scaling belongs to UNIT.
- `frontend/src/pages/RecipeDetailPage.test.tsx` "scales from one ingredient, exactly (150 g → 200 g)": belongs to UNIT.
- `frontend/src/pages/RecipeDetailPage.test.tsx` "accepts another unit of the same kind": belongs to UNIT.
- `frontend/src/pages/RecipeDetailPage.test.tsx` "rejects an unusable amount and keeps the popover open": belongs to UNIT.
- `frontend/src/pages/RecipeDetailPage.test.tsx` "uses a batch multiplier when the recipe has no servings count": belongs to UNIT.
- `frontend/src/components/TagChip.test.tsx` "renders the default variant as a capitalized pill": tests visual variant classes; styling is being redesigned.
- `frontend/src/components/TagChip.test.tsx` "renders the editorial variant as an uppercase label, not a pill": tests visual variant classes; styling is being redesigned.

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.

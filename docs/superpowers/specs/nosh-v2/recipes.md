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
| Photo upload (JPEG, PNG, WEBP, up to 5 MB) | keep | Parity. |
| Photo attach from a URL (used by import) | keep | Import fetches the photo after save (ADR 2026-08-13). |
| Image gallery (multiple images per recipe) | owner? | Stored and uploadable today, but the UI only uses the first as the cover and shows the rest as small unclickable thumbnails with no reorder. The design (§11) says to keep every image on migration; whether the owner wants a real gallery, or a single photo per recipe, is their call. Recommend: keep migrating all images, ship the new UI with a single cover photo plus the ability to replace it, and revisit a gallery later. |
| Drag-and-drop photo upload on the edit form | keep | Cheap on desktop; harmless on phone. |
| Confirm before deleting a recipe or photo | keep | Destructive actions are irreversible. |
| New-recipe form seeded from a finished import, opened from the dialog, a toast or a notification tap | keep | The owner always reviews an import before anything is saved (REC-36, REC-37; the import side is IMP-41 to IMP-45). |
| Tag names normalised to one case | owner? | Today "Soup" and "soup" are two different tags. Recommend lower-casing on save. |
| HEIC/HEIF photos (iPhone default) | owner? | Rejected today. Recommend accepting and converting, since the owner uses an iPhone. |

## Acceptance criteria

### REC-01 Recipes need a session
**Given** a visitor with no session **When** they call any recipe endpoint (list, read, create, update, delete, image upload, image read, image delete, image from URL) **Then** the answer is 401 and nothing is read or changed.
Cites: `backend/src/routes/recipes.test.ts` "rejects requests with no session", `backend/src/routes/recipes.ts`

### REC-02 Create a recipe with its content
**Given** a signed-in owner **When** they create a recipe with a title, description, servings, prep and cook minutes, ingredients, steps and tags **Then** the answer is 201 with the saved recipe, including an id, the owner's user id, created and updated timestamps, the ingredients and steps each with an id and a zero-based position in the order sent, the tags, an empty image list and its collection.
Cites: `backend/src/routes/recipes.test.ts` "creates a recipe with nested ingredients, steps, and tags", `backend/migrations/1700000000001_create-recipes.js`, `backend/migrations/1700000000002_create-ingredients.js`, `backend/migrations/1700000000003_create-steps.js`

### REC-03 Recipe input rules
**Given** a create or update request **When** it is validated **Then** these rules hold, and a violation is a 400 whose body is `{ "error": <message> }`:
- `title` is required; leading and trailing whitespace is trimmed and a blank title is refused.
- `description`, if given, is non-blank after trimming (an empty string is refused; use `null` or omit it for none). Omitted means `null`.
- `servings` is a positive whole number or `null`.
- `prepTimeMinutes` and `cookTimeMinutes` are whole numbers of zero or more, or `null`.
- `ingredients` and `steps` default to an empty list. Each ingredient needs a non-blank `name`; `quantity` and `unit`, if given, are non-blank text or `null`. Each step needs a non-blank `instruction`.
- `tags` defaults to an empty list; each tag is non-blank text after trimming.
- All text values are stored trimmed.
- There are no maximum lengths and no cap on the number of ingredients, steps or tags.
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
- a tag name is created the first time any recipe uses it and reused afterwards (one tag per exact name, shared across all users' recipes in the tags table);
- repeating the same name within one recipe stores it once;
- names are case-sensitive and stored as typed (trimmed);
- a recipe's tags come back sorted alphabetically by name, not in the order sent;
- saving a recipe replaces its tag set; removing a recipe, or a tag from a recipe, leaves the tag name in the tags table.
Cites: `backend/src/routes/recipes.test.ts` "creates a recipe with nested ingredients, steps, and tags", `backend/migrations/1700000000004_create-tags.js`, `backend/src/repositories/recipes.ts`

### REC-08 Read one recipe
**Given** a signed-in owner **When** they read a recipe by id **Then** they get 200 with the full recipe (ingredients, steps, tags, images). A recipe id that does not exist, or belongs to another user, is a 404 `Recipe not found` (a recipe's existence is never revealed to others); an id that is not a positive whole number is a 400 `Invalid recipe id`.
Cites: `backend/src/routes/recipes.test.ts` "fetches a recipe by id", "hides another user's recipe behind a 404", "rejects a non-numeric recipe id"

### REC-09 List my recipes
**Given** several users each with recipes **When** one lists recipes **Then** only their own come back, newest created first, each with its ingredients, steps, tags and images.
Cites: `backend/src/routes/recipes.test.ts` "lists only the current user's recipes", `backend/src/repositories/recipes.ts`

### REC-10 List filters
**Given** a library with recipes at Home and in nested collections **When** the owner lists recipes with filters **Then**:
- `tag=<name>` returns only recipes carrying exactly that tag (a recipe with several tags still appears once);
- `collection=root` returns only recipes directly at Home;
- `collection=<id>` returns only recipes directly in that collection;
- `within=<id>` returns recipes in that collection and every collection nested beneath it;
- filters combine;
- a collection id that is not the owner's yields an empty list, never another user's recipes;
- a malformed `collection` (not `root` or a positive whole number) or `within` is a 400; an unusable `tag` is ignored.
The same filters apply to search (see SRCH); collection semantics are in COL.
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
**Given** an owner's recipe **When** they upload a photo (one file per request, form field `image`) **Then** it is accepted only if it is JPEG, PNG or WEBP, at most 5 MB, and its actual bytes match the declared type (a text or HTML file labelled as an image is refused). It is stored under a generated unguessable name with the extension for its type. The answer is 201 with the image (id, position). A wrong type, a mismatched file, a file over 5 MB or a missing file is a 400 with a message and nothing is stored.
Cites: `backend/src/routes/recipes.test.ts` "uploads an image to a recipe", "rejects an unsupported image type", `backend/src/services/imageSniff.ts`, `backend/migrations/1700000000005_create-recipe-images.js`, ADR 2026-08-05

### REC-15 Several photos, order and cover
**Given** a recipe **When** photos are added **Then** there is no cap on how many; each new photo gets the next position after the highest existing one (the first gets 0); a recipe's images always come back ordered by position; the lowest-position image is the cover shown on the library card and the detail page; there is no way to reorder, and removing a photo leaves a gap in the numbers but never reorders the rest (so removing the cover promotes the next one).
Cites: `backend/src/routes/recipes.test.ts` "uploads an image to a recipe", `backend/src/repositories/recipes.ts`, `backend/migrations/1700000000005_create-recipe-images.js`

### REC-16 Photos are served only to their owner
**Given** a stored photo **When** its URL is requested **Then** the owner gets the file (200); a request with no session is 401; another user, an unknown recipe, an unknown image, or an image id that belongs to a different recipe is 404; a non-numeric id is 400. There is no public static route to the files.
Cites: `backend/src/routes/recipes.test.ts` "serves an uploaded image back to its owner", "refuses to serve an image without a session", "refuses to serve another user's image", ADR 2026-08-06

### REC-17 Remove a photo
**Given** a recipe photo **When** the owner removes it **Then** the answer is 204, the image record and its file are deleted (a missing file is not an error), and the recipe's image list no longer contains it. An image not found on that recipe is a 404.
Cites: `backend/src/routes/recipes.test.ts` "deletes an image from a recipe"

### REC-18 Attach a photo from a URL
**Given** an owner's recipe and an `http(s)` image URL **When** they ask nosh to attach it **Then** the server fetches the image itself and stores it as a new photo exactly as an upload would be (201 with the image, next position). Ownership is checked before anything is fetched. The URL is checked against the SSRF rules (see SEC) before every request and on every redirect (up to 5 redirects are followed); a blocked address, such as a metadata or private address, is a 400 and nothing is fetched. The fetch has a 10 second timeout. The same limits as upload apply: JPEG, PNG or WEBP by the response type, bytes that match that type, and 5 MB, checked both from the declared length and while reading. A user may make at most 60 such requests per hour (see SEC).
Cites: `backend/src/routes/recipes.test.ts` "attaches an image fetched from a URL", "requires ownership to attach an image from a URL", "rejects a from-url attach pointed at a blocked host", `backend/src/services/imageFromUrl.test.ts` "fetches an allowed image URL and reports its extension", "maps %s to %s", "rejects a blocked host before making any request", "rejects a redirect into a blocked host", "follows a redirect to an allowed host", ADR 2026-08-13

### REC-19 Photo-from-URL failures
**Given** an attach-from-URL request **When** it cannot complete **Then** the answer is a specific status and message, never a 500, and no photo is added: a malformed or blocked URL is 400; a type that is not JPEG, PNG or WEBP, bytes that do not match the type, or an image over 5 MB is 422; a non-success response from the remote server, a network failure, a timeout, a redirect with no target, or more than 5 redirects is 502.
Cites: `backend/src/routes/recipes.test.ts` "surfaces a from-url fetch failure as a real status, not a 500", `backend/src/services/imageFromUrl.test.ts` "rejects an unsupported content type", "rejects a body whose bytes don't match the declared image type", "rejects an image declared too large via content-length", "rejects an image that exceeds the cap while streaming, despite no content-length", "throws ImageFetchError on a non-2xx status", "throws ImageFetchError when the fetch itself rejects", "throws ImageFetchError after too many redirects"

### REC-20 Detail page shows the recipe
**Given** a recipe **When** the owner opens it **Then** the page shows the title, the description if any, a line with "Serves N", "Prep N min" and "Cook N min", each shown only when its value is set and non-zero (a stored 0 is hidden), the tags, the ingredients as a numbered list (shown only when there are any), and the steps as a numbered list (shown only when there are any). Amounts are shown scaled and in the owner's units (see UNIT) and oven temperatures in steps in the owner's temperature unit. There are edit and delete controls and a link back to the library at the recipe's collection.
Cites: `frontend/src/pages/RecipeDetailPage.tsx`, `frontend/src/components/IngredientList.tsx`, `frontend/src/pages/RecipeDetailPage.test.tsx` "shows amounts in the user's units and converts oven temperatures"

### REC-21 Detail page photos
**Given** a recipe **When** its detail page is shown **Then** the cover photo (lowest position) is shown large; with no photo a placeholder is shown instead; any further photos appear as a row of small thumbnails (not clickable, not enlargeable).
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
**Given** the form **Then** the owner can set title (required), description, servings (whole number, minimum 1), prep and cook minutes (whole numbers, minimum 0); add any number of ingredient rows (quantity, unit, name) and step rows (instructions); and remove any row, including the last one. Step numbers shown beside the rows follow their order. Long descriptions and steps are shown in full, in a text area that grows with its content rather than scrolling or clipping.
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/components/AutoGrowTextarea.tsx`, `frontend/src/pages/RecipeFormPage.test.tsx` "adds and removes ingredient and step rows"

### REC-29 Form: what is sent on save
**Given** the form **When** the owner saves **Then** the request carries trimmed values; empty description, quantity and unit become `null`; empty servings, prep and cook fields become `null`; a typed "0" is sent as 0 (the API accepts 0 minutes but refuses 0 servings with a 400, which the form shows as the error banner); ingredient rows with a blank name and step rows with a blank instruction are dropped; tags are sent as entered; the source URL (set only by import, kept unchanged when editing) and, when creating, the chosen collection are included.
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "submits a trimmed, filtered payload and navigates to the new recipe's edit page", `frontend/src/pages/RecipeFormPage.tsx`

### REC-30 Form: saving, feedback and navigation
**Given** the form **When** the owner presses save **Then** the button shows "Saving…" and is disabled until done. On failure a visible error banner shows the server's message (or "Something went wrong"), keyboard focus moves to it, and the entered data is kept. On success of an edit the owner lands on the recipe's detail page; on success of a create the owner lands on that new recipe's edit form (replacing the create form in history, so Back never returns to a form that would create a duplicate), where photos can now be added.
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/pages/RecipeFormPage.test.tsx` "submits a trimmed, filtered payload and navigates to the new recipe's edit page"

### REC-31 Form: collection for a new recipe
**Given** the create form **Then** a Collection choice is offered (default "Home (top level)"), preselected from the folder the owner came from (the `collection` address parameter, or the folder an import was started in), with only a positive whole number trusted (anything else means Home), and the back link returns to that folder. The choice is not offered when editing (moving is done from the detail page, see COL).
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "defaults to Home", "starts in the folder given by ?collection= (a folder's New recipe button)", "starts in the folder an import was started from (router state)", "ignores a malformed ?collection= value", "sends the chosen folder with the new recipe"

### REC-32 Form: no stale draft carried between routes
**Given** the owner has typed into the create form **When** they navigate to an edit form (or any other form instance) **Then** the fields start fresh; nothing typed earlier is carried over.
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "remounts (does not carry over state) when routing from the create form to an edit form"

### REC-33 Form: photos
**Given** the edit form **Then** a Photos section lists current photos as thumbnails each with a remove control, and lets the owner add a photo by choosing a file or dropping one onto the drop area; the accepted types (JPEG, PNG, WEBP) are stated; only the first file is taken when several are chosen; while uploading the area shows "Uploading…" and is disabled; a failed upload shows a "Failed to upload image" message. **Given** the create form **Then** the section only says "Save the recipe first to add photos."
Cites: `frontend/src/pages/RecipeFormPage.tsx`, `frontend/src/api/recipes.ts`

### REC-34 Form: removing a photo asks first
**Given** a photo on the edit form **When** the owner chooses remove **Then** a confirmation "Remove this photo? This can't be undone." appears and nothing is deleted yet; cancelling closes it and keeps the photo; confirming deletes the photo and it disappears from the form. A failed delete shows "Failed to delete image".
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "asks for confirmation before deleting a photo, and only deletes once confirmed"

### REC-35 Tag entry
**Given** the tag field on the form **When** the owner types a tag and presses Enter or comma, or leaves the field **Then** the tag (trimmed) is added as a removable chip and the field clears; an empty entry or a tag already on the recipe (exact match) is ignored; Backspace in an empty field removes the last tag; each chip has its own remove control. A hint says "Press Enter or comma to add a tag."
Cites: `frontend/src/components/TagInput.test.tsx` "commits a tag on Enter and clears the draft", "commits a tag on comma", "does not add a duplicate tag", "removes the last tag on backspace when the draft is empty", "removes a specific tag when its remove button is clicked"

### REC-36 Form: seeded from an import
**Given** the owner arrives at the create form from a finished import **Then** every field (title, description, servings, times, ingredients, steps, tags, source URL) is pre-filled for review and edit, nothing is saved until the owner presses save, and saving uses the normal create path with the source URL attached. If the import could not be translated, a notice "Couldn't translate this recipe — it's in its original language." is shown. After a successful create the discovered photo URL, if any, is attached to the new recipe (see REC-18); if that fails the recipe is still saved and a "Couldn't import the photo — add one manually" message is shown.
Cites: `frontend/src/pages/RecipeFormPage.test.tsx` "pre-fills from imported recipe data passed via router state", "saves an imported recipe through the normal create path, carrying sourceUrl", "attaches the imported photo once the recipe is saved", "toasts but still saves when the imported photo fails to attach", `frontend/src/pages/NewRecipePage.test.tsx` "says when an import couldn't be translated", "shows no translation notice for a normal import", ADR 2026-08-13

### REC-37 New-recipe page opened from a finished import
**Given** the owner opens the new-recipe page for a finished import (for example by tapping a push notification, with no in-app state) **When** the page loads **Then** the import is fetched by id and the form is seeded from it (with a loading placeholder meanwhile), and the import is marked reviewed. With the data already available from the app, nothing is fetched again. If the import failed the page shows its error message and a "Start a blank recipe" link; if the import no longer exists it says "That import isn't available any more."; any other load failure says "Couldn't load that import." Without an import the page is simply the blank form and fetches nothing. (Import jobs are specified in IMP.)
Cites: `frontend/src/pages/NewRecipePage.tsx`, `frontend/src/pages/NewRecipePage.test.tsx` "is just the blank create form without an importId", "loads the import by id when cold-started from a notification (no router state)", "uses router state when it's already there, without refetching", "explains when the import failed", "explains when the import no longer exists"

### REC-38 Recipe card
**Given** a recipe in a list **Then** its card shows the cover photo (or a placeholder when there is none), the title, a line of "Serves N", "Prep N min", "Cook N min", each only when set and non-zero, and its tags; an optional caption (for example the folder path in search results) appears above the title. Selecting the card opens the recipe; selecting a tag on the card filters the library by that tag instead and does not open the recipe. A card can be made draggable, carrying the recipe id, for dropping onto a collection (see COL); by default it is not draggable.
Cites: `frontend/src/components/RecipeCard.test.tsx` "clicking a tag chip filters the library by that tag, not the recipe detail page", "shows a caption above the title when given one", "clicking the card itself navigates to the recipe detail page", "is not draggable by default", "carries its id in a dedicated MIME type when draggable and dragged", `frontend/src/components/RecipeCard.tsx`

### REC-39 Confirmation dialog
**Given** a destructive action (delete recipe, remove photo) **When** the confirmation opens **Then** it shows a title and message, focus starts on Cancel (never the destructive button), the page behind cannot scroll, and the dialog closes without action on Cancel, on Escape and on a click outside it; only the confirm button ("Delete" or the given label) performs the action. When closed it renders nothing.
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
- **REC-15:** the multi-image data model predates the editorial redesign; the UI never grew a gallery, so only the cover is really used. The design (§11) requires every image to survive migration regardless.
- **REC-30:** creating lands on the edit form because photos need a saved recipe id; this is a quirk the new design may remove (see open questions).

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
1. Image gallery: keep several photos per recipe, or one cover photo? Recommend: migrate all images, ship with one cover photo (replaceable) and revisit a gallery later.
2. Tag case: should "Soup" and "soup" be the same tag? Recommend lower-casing on save and merging on migration. (Merged in index.md with SRCH open question 3.)
3. iPhone photos (HEIC) are rejected today. Recommend accepting them and converting to JPEG on upload.
4. After saving a new recipe the owner lands on its edit form (to add photos), not the recipe. Recommend: let the create form take a photo directly and land on the recipe page.
5. A prep or cook time of 0 can be saved but is never displayed (the detail page and card hide a zero). Recommend refusing 0 in the form, or showing it.
6. There are no length or count limits on titles, text, ingredients, steps, tags or photos per recipe. Recommend sane caps (for example 200 characters for a title, 100 ingredients and steps, 30 tags, 20 photos). (Merged in index.md with COL open question 4.)
7. Upload failures all show the same "Failed to upload image" message even though the server says why (wrong type, too large). Recommend showing the server's reason.
8. Recipes cannot be duplicated. Out of scope for the first release unless wanted.

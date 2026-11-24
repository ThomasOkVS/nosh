# Recipe import

## Purpose
The owner pastes a link to a recipe page, an Instagram Reel or a TikTok. nosh reads the page or video in the background, turns it into a draft recipe (translated, converted to the owner's units and tagged), and tells the owner when it is ready, even if the app was closed. The owner always reviews the draft in the new-recipe form before anything is saved.

## Sources
- `backend/src/routes/import.ts`
- `backend/src/routes/import.test.ts`
- `backend/src/validation/import.ts`
- `backend/src/repositories/importJobs.ts`
- `backend/src/services/importJobs.ts`
- `backend/src/services/recipeExtraction.ts`
- `backend/src/services/recipeExtraction.test.ts`
- `backend/src/services/jsonLd.ts`
- `backend/src/services/jsonLd.test.ts`
- `backend/src/services/htmlText.ts`
- `backend/src/services/htmlText.test.ts`
- `backend/src/services/socialVideo.ts`
- `backend/src/services/socialVideo.test.ts`
- `backend/src/services/socialVideo.runner.test.ts`
- `backend/src/services/recipeTags.ts`
- `backend/src/services/recipeTags.test.ts`
- `backend/src/llm/geminiClient.ts`
- `backend/src/llm/geminiClient.test.ts`
- `backend/migrations/1700000000014_create-import-jobs-and-push-subscriptions.js`
- `frontend/src/api/import.ts`
- `frontend/src/api/import.test.ts`
- `frontend/src/import/*`

## ADRs
- 2026-08-05: Recipe import via cloud LLM (post-MVP)
- 2026-08-11: Recipe import from URLs — Gemini (free tier), JSON-LD fast path, cheerio
- 2026-08-11: Import tags come from a fixed vocabulary, not the site's keywords
- 2026-08-11: Ingredient lines are split into quantity/unit/name on import
- 2026-08-11: Gemini model pinned to gemini-3.6-flash (and why the model id needs revisiting)
- 2026-08-11: Import tags are capped and de-duplicated by implication
- 2026-08-11: /import streams NDJSON progress instead of returning one JSON object
- 2026-08-12: Instagram Reels/TikTok import — yt-dlp + Gemini Flash-Lite
- 2026-08-13: Recipe photo auto-import — post-save fetch, not staged uploads
- 2026-09-24: Imports become server-side jobs, with push notifications when they finish

## Features
| Feature | Verdict | Why |
|---|---|---|
| Import from a recipe-page URL | keep | Core of the area. |
| Structured-data fast path (no AI call when the page publishes a complete recipe) | keep | Instant, free, more reliable than the AI. Works with no API key. |
| AI fallback reading the page text | keep | Many pages have no structured data. |
| Instagram Reel and TikTok import (video plus caption) | keep | The only route those platforms have. The video downloader must ship in the single container (design §3). |
| Import from pasted text, a photo or a screenshot | drop | Does not exist today. Design §2 keeps new features out of the first release. Stays in the backlog. |
| Other video sites (YouTube and so on) | drop | Not supported today; such links go down the web-page path. |
| Server-side jobs with live progress | keep | Lets the owner close the app mid-import (design §5, §6). |
| Cancel a running import | keep | Stops the AI spend. |
| Resume or review an import on app launch | keep | A result that finished while the app was closed must not be lost. |
| Push notification when an import finishes or fails | keep | Design §5. |
| Import into the folder the owner started from | keep | A notification tap cold-starts the app with no other record of where it was started. |
| Auto-translate imports to the recipe language | keep | Design §5. |
| Convert units and oven temperatures to the owner's preferences on import | keep | Design §5. The converted values are what gets stored. |
| Tags only from a fixed vocabulary, capped at five | keep | Design §5. |
| Photo attached automatically after the recipe is saved | keep | Design §5 ("photo fetched after save"). |
| Cap of 30 import starts per hour per user | keep | Decided by the owner (index Q6): the per-user cap stays (IMP-06, SEC-21) and a per-IP cap of 30 starts per hour is added, as design §9 asks (SEC-59). |
| Only the newest pending import is restored on launch | keep | Decided by the owner (index Q22): kept as today (IMP-43). |
| Raw AI provider wording in some failure messages ("Gemini returned 400") | drop | Decided by the owner (index Q21): every such failure shows one plain message (IMP-24). |

## Acceptance criteria

### IMP-01 Starting an import returns a running job at once
**Given** a signed-in owner **When** they start an import with a valid `http` or `https` URL **Then** the API answers 202 straight away with a job in status `running`, with no recipe yet, an empty list of progress stages, the URL, the target folder (or none) and a creation time, and the extraction carries on without the client staying connected. Starting an import of a URL that already has a pending job is allowed and creates a second, independent job.
Decision: owner 2026-11-24, index Q33 (v1 also allowed it; now stated)
Cites: `backend/src/routes/import.test.ts` "answers 202 with a running job, which finishes with its stages and the recipe", `frontend/src/api/import.test.ts` "starts an import by POSTing the url and target folder, returning the created job", ADR 2026-09-24

### IMP-02 Bad input is refused with 400 and creates no job
**Given** a signed-in owner **When** they start an import with a missing or non-URL value (for example `not a url`), a scheme other than `http`/`https` (for example `ftp://`), or an unparseable URL **Then** the API answers 400 with a readable `error` message and no job exists afterwards. Stray whitespace around a pasted URL is trimmed before validation.
Cites: `backend/src/routes/import.test.ts` "rejects an invalid body with a 400 and creates no job", `backend/src/services/recipeExtraction.test.ts` "rejects %s before making any request", `frontend/src/api/import.test.ts` "surfaces a rejected start as an ApiError with the server's message"

### IMP-03 Local and private addresses are refused up front
**Given** a URL whose host is `localhost` (with or without a trailing dot), a loopback, private, link-local or metadata address, an IPv6 loopback, or a host that is a private address in any shorthand notation **When** the owner starts an import **Then** the API answers 400 with `This URL cannot be imported`, creates no job and makes no outbound request. The same check applies to a host that only resolves to a private address at fetch time (the job then fails with the same message). The full guard, including redirects and DNS, is specified in SEC (outbound fetch safety).
Cites: `backend/src/routes/import.test.ts` "rejects a blocked URL with a real 400 before creating a job, without fetching it", `backend/src/services/recipeExtraction.test.ts` "blocks %s", ADR 2026-09-25 (SSRF guard)

### IMP-04 Every import endpoint needs a signed-in user
**Given** a request with no session **When** it calls any import endpoint **Then** the API answers 401.
Cites: `backend/src/routes/import.test.ts` "rejects requests with no session"

### IMP-05 The target folder must belong to the owner
**Given** a start request with a `collectionId` **When** that collection belongs to someone else or does not exist **Then** the API answers 404 `Collection not found` and creates no job. **Given** no `collectionId` (or `null`) **Then** the job targets Home. **Given** the folder is deleted while the job exists **Then** the job's folder reads as Home.
Cites: `backend/src/routes/import.test.ts` "refuses to file an import in another user's folder", "keeps the folder the import was started from on the job", `backend/migrations/1700000000014_create-import-jobs-and-push-subscriptions.js`

### IMP-06 Starting imports is capped per user
**Given** an owner who has used up 30 import starts in the current one-hour window **When** they start another **Then** the API answers 429 with a `Retry-After` header (the window rules are SEC-16; an invalid start still counts, SEC-21). Import starts are also capped per client IP (SEC-59). Polling a job, listing jobs, cancelling and marking reviewed never count towards the cap.
Decision: owner 2026-11-24, index Q6 (v1 had the per-user cap only)
Cites: `backend/src/routes/import.ts` (cap of 30 per hour per user), `backend/src/security.test.ts` "rejects imports past 30 an hour for one user" (owned by SEC), ADR 2026-09-24

### IMP-07 Settings are snapshotted when the import starts
**Given** an owner with a saved import model, recipe language and unit preferences **When** they start an import **Then** the job uses the model, language and units they had at that moment, and changing settings while it runs does not affect it. A saved model that is no longer offered by the server is ignored and the automatic default is used (one default for web pages and one for video). With no saved language the recipe stays in its source language. Unit preferences always exist (defaults: metric, °C, keep spoons), so amounts and temperatures are always converted to them on import.
Cites: `backend/src/routes/import.test.ts` "uses the model saved on the Settings page, and automatic otherwise", "imports in the language and units saved on the Settings page", `backend/src/services/recipeExtraction.test.ts` "falls back to Gemini when there's no usable JSON-LD", "leaves amounts as written with no unit preferences"

### IMP-08 A page with complete structured data needs no AI
**Given** a page that publishes a schema.org Recipe (as structured data in the page) with a title, at least one ingredient and at least one step **When** it is imported **Then** the recipe comes from that data only, the progress stages are `fetching` then `structured-data`, no AI call is made, and the import works even when no AI key is configured on the server. A title-only recipe, or one lacking ingredients or steps, does not count as complete.
Cites: `backend/src/routes/import.test.ts` "stops at the structured-data stage when the page has JSON-LD", "imports a JSON-LD page with no Gemini configured at all", `backend/src/services/recipeExtraction.test.ts` "uses the JSON-LD result and never calls Gemini when it's complete", "extracts JSON-LD with no Gemini configured", `backend/src/services/jsonLd.test.ts` "accepts a recipe with a title, ingredients, and steps", "rejects null", "rejects a title-only recipe", ADR 2026-08-11 (JSON-LD fast path)

### IMP-09 How structured data is read
**Given** a page's structured data **When** it is read **Then**: the Recipe may be a single object, an item in a top-level list, or nested inside a graph; a block that is not valid JSON, or holds no Recipe, is skipped and a later block is tried; instructions may be plain strings, step objects, or sections of steps (flattened in order); `recipeYield` yields servings as the first whole number found (`Serves 0` or no number gives no servings); prep and cook times come from ISO 8601 durations as whole minutes (days, hours and minutes count, seconds are ignored, a zero or invalid duration gives no time); the first usable image is taken whether it is a string, an image object or a list. A page with no structured data gives no result.
Cites: `backend/src/services/jsonLd.test.ts` "parseIsoDurationToMinutes" cases, "rejects %s", "rejects non-string input", "maps a well-formed Recipe node", "finds a Recipe nested under @graph", "finds a Recipe inside an array of top-level nodes", "handles nested HowToSection instructions", "skips a malformed JSON-LD block instead of throwing", "falls through a non-Recipe block to a later Recipe block", "returns null when no JSON-LD is present", "picks up a plain string image", "picks up the first entry of an array of images", "reads the url off an ImageObject", "omits imageUrl entirely when the page publishes no image"

### IMP-10 Tags from structured data come from a fixed vocabulary
**Given** a recipe from structured data **When** tags are derived **Then** the site's own keywords are never used. Tags come only from this vocabulary: vegetarian, vegan, pescatarian, gluten free, dairy free, nut free, halal, kosher, high protein, low calorie, low carb, low fat, low sodium, quick, one pot, breakfast, lunch, dinner, dessert, snack, side. They are derived from: the declared diets (`GlutenFreeDiet`, `LowCalorieDiet`, `LowFatDiet`, `LowLactoseDiet` as dairy free, `LowSaltDiet` as low sodium, `VeganDiet`, `VegetarianDiet`, `HalalDiet`, `KosherDiet`; diets with no equivalent are dropped; values may be plain or `{@id}` objects); per-serving nutrition (calories above 0 up to 500 is low calorie, protein 25 or more is high protein, carbohydrate above 0 up to 25 is low carb, fat above 0 up to 10 is low fat, values read from text such as `389 calories`); the recipe category (`Main`, `Main Course`, `Main Dish` as dinner, `Side Dish` as side, `Appetizer` and `Starter` as snack, exact vocabulary words as themselves, anything else ignored); and total time (above 0 up to 30 minutes is quick; total time is prep plus cook when no total is given). A page that publishes nothing usable gets no tags. Duplicates collapse.
Cites: `backend/src/services/recipeTags.test.ts` "maps schema.org suitableForDiet values", "accepts suitableForDiet given as objects with @id", "drops diets with no clean equivalent", "derives nutrition tags from per-serving values", "omits nutrition tags when values are above the thresholds", "tags quick recipes from total time, falling back to prep + cook", "maps recipeCategory onto meal types only for known values", "returns nothing when the page publishes nothing usable", "deduplicates across sources", `backend/src/services/jsonLd.test.ts` "ignores the site's SEO keywords in favour of derived attribute tags", ADR 2026-08-11 (fixed vocabulary)

### IMP-11 AI fallback reads the page text
**Given** a page without complete structured data **And** AI import is configured **When** it is imported **Then** the stages are `fetching`, `structured-data`, `ai`, and the page's visible text is sent to the AI with the page URL. The text sent is at most 15,000 characters (longer text is cut). The result goes through the same clean-up, validation, translation and unit steps as any other import.
Cites: `backend/src/routes/import.test.ts` "answers 202 with a running job, which finishes with its stages and the recipe", `backend/src/services/recipeExtraction.test.ts` "falls back to Gemini when there's no usable JSON-LD", `backend/src/llm/geminiClient.test.ts` "sends the model, API key, and a JSON responseSchema"

### IMP-12 What counts as page text
**Given** an HTML page **When** its text is prepared for the AI **Then** scripts, styles, navigation, header, footer, graphics, `noscript` content and frames are removed (even when a script contains text that looks like a closing tag), runs of whitespace collapse to single spaces, the text is trimmed, and an empty body gives an empty string.
Cites: `backend/src/services/htmlText.test.ts` "removes script, style, nav, header, and footer content", "collapses whitespace", "returns an empty string for an empty body"

### IMP-13 The AI fallback needs configuration
**Given** a page that needs the AI fallback **And** no AI is configured on the server **When** it is imported **Then** the job fails with status code 503 and the message `That page has no structured recipe data, and AI-assisted import is not configured`.
Cites: `backend/src/routes/import.test.ts` "fails the job with a 503 when the fallback is needed but unconfigured", `backend/src/services/recipeExtraction.test.ts` "throws NotConfiguredError when the fallback is needed but no Gemini is configured"

### IMP-14 Fetching a page: limits and failures
**Given** a web-page import **When** the page is fetched **Then**: the whole fetch including reading the body must finish within 15 seconds (otherwise `Timed out fetching the page`); at most 5 redirects are followed (otherwise `That page redirected too many times`); a redirect with no target gives `The page returned <status>`; a non-success status gives `The page returned <status>`; a response that is not HTML gives `The URL did not return an HTML page`; a page declaring more than 2,000,000 bytes gives `That page is too large to import`, and a page of undeclared length is read only up to 2,000,000 bytes; any other network failure gives `Couldn't reach that page` without revealing the underlying error (so the owner cannot probe which hosts and ports answer). Every one of these fails the job with status code 502, except the address-guard case of IMP-03.
Cites: `backend/src/services/recipeExtraction.test.ts` "throws FetchError when the page returns a non-2xx status", "throws FetchError when the response isn't HTML", "throws FetchError when the fetch itself rejects"

### IMP-15 Redirects are re-checked on every hop
**Given** a page that redirects **When** a redirect target is a blocked address **Then** the import fails with `This URL cannot be imported` (status code 400) and the target is not fetched. **Given** a redirect to an allowed host **Then** it is followed and the recipe is read from the final page.
Cites: `backend/src/services/recipeExtraction.test.ts` "rejects a redirect into a blocked host", "follows a redirect to an allowed host"

### IMP-16 Page photo discovery
**Given** an imported web page **When** it is read **Then** the draft carries the page's photo address, taken from the recipe's structured data, else from the page's `og:image` tag, else from its `twitter:image` tag (`og:image` wins when both exist). A relative address is resolved against the page's own address. This also applies on the AI fallback path. A page with no image gives none.
Cites: `backend/src/services/recipeExtraction.test.ts` "returns the JSON-LD image, resolved against the page URL", "falls back to an og:image meta tag when JSON-LD has no image", "still finds an og:image on the Gemini-fallback path", "returns null when the page has no image at all", `backend/src/services/jsonLd.test.ts` "reads og:image", "falls back to twitter:image when og:image is absent", "prefers og:image over twitter:image when both are present", "returns null when neither is present", ADR 2026-08-13

### IMP-17 Instagram and TikTok links are imported from the video
**Given** a link whose host is `instagram.com`, `www.instagram.com`, `tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com` or `m.tiktok.com` **When** it is imported **Then** no web page is fetched. The post's video and caption are downloaded (stages `downloading-video`, `analyzing-video`) and the AI watches the video and reads the caption to produce the recipe, preferring the caption for exact quantities and writing missing steps from what is shown. The post's thumbnail becomes the draft's photo address. A lookalike host (`instagram.com.evil.example`, `notinstagram.com`) or another video site is not treated as a social link and goes down the web-page path.
Cites: `backend/src/routes/import.test.ts` "downloads the video and records its stages before the result", "works the same for a TikTok URL", `backend/src/services/socialVideo.test.ts` "recognizes %s as %s", "does not treat %s as a social video URL", `backend/src/services/recipeExtraction.test.ts` "skips the HTML fetch entirely and goes straight to video download + Gemini", "recognizes TikTok URLs the same way", "returns yt-dlp's thumbnail for a social video import", ADR 2026-08-12

### IMP-18 Video limits and failures
**Given** a social video import **When** the post is processed **Then**: a post longer than 3 minutes is refused before any video is downloaded (`That video is too long to import`, status code 422); the video is requested at 480p or lower, in a single pre-merged file; a download larger than 18 MiB is refused (`That video is too large to import`, 422); an empty download gives `Couldn't download that video` (502); each downloader call is limited to 45 seconds (`Timed out fetching that post`, 502); a private, deleted, geo-blocked or throttled post gives `Couldn't fetch that post — it may be private, deleted, or currently blocked` (502) and the platform's raw error text is logged, never shown; if the video yields no recipe the job fails with 422 `No recipe could be found on that page` (see IMP-23). Only the platform-specific downloaders run, never a generic page crawler.
Cites: `backend/src/routes/import.test.ts` "fails the job with a 502 when the post can't be fetched (private/deleted/blocked)", "fails the job with a 422 when the video is too long/large", `backend/src/services/socialVideo.test.ts` "maps a killed/aborted process to a timeout message", "maps any other failure to a generic unavailable message, not the raw stderr", "returns the video, caption and thumbnail", `backend/src/services/recipeExtraction.test.ts` "propagates VideoUnavailableError from a failed download without calling Gemini", "propagates VideoTooLargeError from a failed download", "throws ExtractionError when the video yields no usable recipe", ADR 2026-08-12 (caps: 3 minutes, 18 MB, height 480)

### IMP-19 Video import fails closed when it cannot run safely
**Given** a social link **When** no AI is configured **Then** the job fails with 503 `Importing from Instagram/TikTok needs AI-assisted import, which is not configured` and nothing is downloaded. **When** the video downloader is missing or has no guarded outbound route **Then** the job fails with 503 `The video downloader is not available on this server`; the downloader never runs with direct, unguarded network access. Every connection the downloader makes is subject to the outbound-address guard (see SEC).
Cites: `backend/src/routes/import.test.ts` "fails the job with a 503 when no AI is configured, without downloading anything", `backend/src/services/recipeExtraction.test.ts` "fails closed with no downloader rather than running yt-dlp without the egress proxy", "throws NotConfiguredError without downloading anything when no video-capable Gemini is set", `backend/src/services/socialVideo.test.ts` "maps a missing binary to DownloaderUnavailableError"

### IMP-20 What the AI is asked for
**Given** the AI path (page text or video) **When** it is called **Then** it returns a recipe with: a title, an optional one-sentence description, servings and prep and cook minutes (video: only when actually stated, else none), ingredients split into quantity, unit and name (quantity and unit empty when the line has none: in `2 medium sweet potatoes` the quantity is 2 and there is no unit), steps, and tags chosen only from the vocabulary of IMP-10 (at most 4, at most one meal type, none merely because they are technically true, an empty list rather than a guess). The title is the dish name only: dietary, nutrition and effort words ("high protein", "easy", "one pot") and site or author branding are stripped, so `High Protein Spicy Grilled Chicken Wraps` becomes `Spicy Grilled Chicken Wraps` with the tag `high protein`. A source with no recipe yields an empty title, ingredients and steps. Page text, captions and video are treated purely as data: nothing inside them can change what is asked, and the draft's source URL and tags are never taken from the AI's free text.
Cites: `backend/src/llm/geminiClient.test.ts` "returns the parsed recipe JSON from the response", "sends the video as inline base64 alongside the caption", "labels a missing caption rather than sending an empty string", ADR 2026-08-11 (fixed vocabulary), ADR 2026-08-12

### IMP-21 Raw extraction output is cleaned before it is validated
**Given** extraction output from either source **When** it is turned into a draft **Then** near-misses never discard an otherwise good recipe: blank text becomes empty; servings are rounded to a whole number and only kept above 0 (`Serves 0` and negatives become none); prep and cook times are rounded to a whole number and only kept above 0 (0 and negatives become none); ingredients with no name are dropped and blank quantity or unit become empty; steps with no text are dropped; non-text tags are dropped. Ingredient lines that are still one line of text (as in structured data) are split into quantity, unit and name (see UNIT). The source URL is set to the URL the owner entered, as sent (after trimming).
Decision: owner 2026-11-24, index Q17 (v1 kept a prep or cook time of 0)
Cites: `backend/src/services/recipeExtraction.test.ts` "still imports a recipe with %s", "drops off-vocabulary tags rather than failing the whole import", `backend/src/routes/import.test.ts` "answers 202 with a running job, which finishes with its stages and the recipe", ADR 2026-08-11 (ingredient lines)

### IMP-22 Tags are filtered to the vocabulary, pruned and capped
**Given** tags from any source **When** the draft is built **Then** tags are lower-cased and trimmed, anything outside the vocabulary of IMP-10 is dropped (matching is case-insensitive: `High Protein` becomes `high protein`), duplicates collapse, a tag implied by a stronger one is removed (vegan implies vegetarian and pescatarian; vegetarian implies pescatarian), and at most 5 tags remain, in the order given.
Cites: `backend/src/services/recipeTags.test.ts` "keeps vocabulary tags and drops free-text ones", "drops tags implied by a stronger one", "caps the number of tags", `backend/src/services/recipeExtraction.test.ts` "drops off-vocabulary tags rather than failing the whole import", ADR 2026-08-11 (capped and de-duplicated)

### IMP-23 An unusable result fails with 422
**Given** extraction output that is still not a valid recipe after clean-up (for example an empty title) **When** the draft is validated **Then** the job fails with status code 422 and the message `No recipe could be found on that page`. A recipe has at least a title; its source URL must be `http` or `https`. Being over a recipe cap (a title over 200 characters, more than 100 ingredients or more than 100 steps, REC-03) does not make a draft unusable: the job finishes, nothing is cut, and the review form shows the draft and refuses to save until the owner brings it within the caps (REC-28).
Decision: owner 2026-11-24, index Q12 (v1 had no caps)
Cites: `backend/src/routes/import.test.ts` "fails the job with a 422 when no recipe can be extracted", `backend/src/services/recipeExtraction.test.ts` "throws ExtractionError when Gemini's output doesn't validate as a recipe"

### IMP-24 The AI being down is told apart from the page having no recipe
**Given** the AI answers 429 or a 5xx **When** an import needs it **Then** the job fails with status code 503 and the message `The recipe AI is busy or over its quota right now — try again shortly`. **Given** the AI times out (30 seconds per request), returns a non-JSON or empty answer, or rejects the request in any other way **Then** the job fails with status code 422 and the one plain message `The recipe AI couldn't read that link — try again later`, whatever the cause; the provider's name, status code and raw response body are logged only. A cancelled job's failure is never shown.
Decision: owner 2026-11-24, index Q21 (v1 showed provider wording such as "Gemini returned 400" or "Gemini returned malformed JSON")
Cites: `backend/src/llm/geminiClient.test.ts` "maps quota and outage responses to a retryable error", "throws GeminiExtractionError on a non-2xx response", "throws GeminiExtractionError when the response has no candidates", "throws GeminiExtractionError when the model text isn't valid JSON", "throws GeminiExtractionError when the request itself rejects", `backend/src/services/recipeExtraction.test.ts` "throws ExtractionError when Gemini fails"

### IMP-25 Order of translate, convert and tag, and what is stored
**Given** any import **When** the draft is produced **Then** the steps run in this order: (1) extract, with tags set during extraction (derived from structured data, or chosen by the AI) and cleaned as in IMP-22; (2) translate, only for a recipe read from structured data, only when a recipe language is set and the recipe is not already in it (the AI paths write in the recipe language inside their own call); (3) convert units, last (unit preferences always exist, so this always runs). Conversion runs after translation because it understands both English and Dutch unit words, and it is the only step that changes amounts. The converted, translated, tagged recipe is what the job stores as its draft and what the owner sees in the form. Nothing is stored as a recipe until the owner saves the form, and the original untranslated and unconverted text is not kept.
Cites: `backend/src/services/recipeExtraction.test.ts` "converts after translating, recognising Dutch unit words", "translates a schema.org recipe that isn't in the target language", ADR 2026-09-25 (translate first, convert units last)

### IMP-26 Translation of structured-data recipes
**Given** a recipe from structured data **And** a recipe language **When** the recipe is judged not to be in that language (an unclear verdict counts as "needs translating") **Then** one extra AI call translates it (stage `translating`) using the owner's chosen model. **When** the recipe is already in the target language, or no recipe language is set, **Then** no translation call is made.
Cites: `backend/src/services/recipeExtraction.test.ts` "translates a schema.org recipe that isn't in the target language", "makes no translation call when the recipe is already in the target language", "makes no translation call with no language set", `backend/src/routes/import.test.ts` "imports in the language and units saved on the Settings page"

### IMP-27 The AI paths translate inside the extraction call
**Given** a recipe language **When** the page text or the video is read by the AI **Then** it is asked in the same call to write title, description, ingredient names, units and steps in that language and no separate translation call is made. The AI is told to keep every quantity and temperature exactly as given, to translate only the spoon units (tablespoon and teaspoon with `el` and `tl`) and to leave every other measurement unit (cup, oz, lb, fl oz, pint, quart, g, kg, ml, l) untouched, because the usual Dutch words kopje, ons and pond are different quantities. Tags stay as the fixed English identifiers. Counting words (clove, can, slice) may be translated.
Cites: `backend/src/services/recipeExtraction.test.ts` "asks the AI text path to write in the target language, with no extra call", `backend/src/llm/geminiClient.test.ts` "asks for the target language only when one is set", "applies to the video prompt too"

### IMP-28 A translation cannot change the recipe's meaning
**Given** a translation returned by the AI **When** it is applied **Then**: quantities, servings, prep and cook times, tags and the source URL are always restored from the original; a unit is kept as translated only when it means the same unit (tablespoon as `el`), otherwise the original unit is restored (cup as `kopjes` and oz as `ons` are undone, so 8 oz still converts to 226.8 g); the restore applies only when the translated ingredient list has the same length as the original, otherwise the translation is used as returned; the translated ingredients and steps are cleaned like any other extraction output. The translation request sends the recipe as data, not as instructions.
Cites: `backend/src/services/recipeExtraction.test.ts` "undoes a translation that changed what a unit means", "translates a schema.org recipe that isn't in the target language", `backend/src/llm/geminiClient.test.ts` "sends the recipe as fenced JSON with the response schema"

### IMP-29 A failed translation never fails the import
**Given** a recipe from structured data that needs translating **When** the AI is unavailable, errors, returns something that is not a valid recipe, or no AI is configured at all **Then** the import still succeeds with the recipe in its original language and the job is flagged `translationSkipped`. **When** the owner cancels while the translation is running **Then** the cancellation wins (nothing is saved).
Cites: `backend/src/services/recipeExtraction.test.ts` "keeps the original and flags it when translation fails", "keeps the original when the translation doesn't validate", "flags a skipped translation when no translator is configured", "still rethrows when the user cancelled mid-translation", `backend/src/routes/import.test.ts` "flags a job whose translation couldn't happen"

### IMP-30 Units and oven temperatures are converted on import
**Given** unit preferences (unit system, temperature unit, keep spoons) **When** the draft is produced **Then** ingredient amounts and oven temperatures in the steps are converted into those units and stored converted (1 cup becomes 236.59 ml, 8 oz becomes 226.8 g, 350°F becomes 177°C in the step text, 2 eggs stay `2` with no unit, 3 tl becomes 1 el when the recipe language is Dutch, UNIT-19). Unit preferences always exist (defaults metric, °C, keep spoons), so conversion always applies; the service-level case of no preferences at all is not reachable in the app. The conversion rules themselves are specified in UNIT.
Cites: `backend/src/services/recipeExtraction.test.ts` "converts amounts and oven temperatures into the user's units", "leaves amounts as written with no unit preferences", `backend/src/routes/import.test.ts` "imports in the language and units saved on the Settings page", ADR 2026-09-25

### IMP-31 Job state and progress stages
**Given** an import job **When** it runs **Then** its status moves from `running` to exactly one of `done`, `error` or `cancelled` and never moves again (a late write after cancelling does not revive it). While running it records the progress stages it has passed, in order, from `fetching`, `structured-data`, `downloading-video`, `analyzing-video`, `ai`, `translating` (typical sequences: `fetching, structured-data`; `fetching, structured-data, ai`; `fetching, structured-data, translating`; `downloading-video, analyzing-video`). When `done` it holds the draft recipe, the photo address (or none) and the `translationSkipped` flag. When `error` it holds the status code and message of the failure (see the failure table in Rationale); an unexpected failure shows `Something went wrong` with status code 500 and the detail is logged. It also holds the target folder, whether it was reviewed, and when it was created.
Cites: `backend/src/routes/import.test.ts` "answers 202 with a running job, which finishes with its stages and the recipe", "fails the job with a 503 when the fallback is needed but unconfigured", `backend/src/repositories/importJobs.ts` (stage list and status guard; no test)

### IMP-32 Reading a job
**Given** an owner **When** they read a job by id **Then** they get the job, and a read always reflects the job's current state. **When** the id is not a positive whole number, does not exist, or belongs to someone else **Then** the answer is 404 `Import not found`.
Cites: `backend/src/routes/import.test.ts` "hides another user's jobs", `frontend/src/api/import.test.ts` "hits the per-job endpoints"

### IMP-33 Pending jobs
**Given** an owner **When** they list their pending imports **Then** they get their jobs that are running, or finished (done or error) and not yet reviewed, newest first; cancelled jobs, reviewed jobs and other users' jobs are never listed.
Cites: `backend/src/routes/import.test.ts` "lists running and unreviewed jobs as pending until marked reviewed", "hides another user's jobs", `frontend/src/api/import.test.ts` "hits the per-job endpoints"

### IMP-34 Cancelling an import
**Given** a running import **When** the owner cancels it **Then** the API answers 204, the job becomes `cancelled`, its outbound work (page fetch, video download, AI call) is aborted so it stops spending quota, no result is stored, no notification is sent, and it no longer appears as pending. Cancelling a job that already finished, does not exist or belongs to someone else also answers 204 and changes nothing.
Cites: `backend/src/routes/import.test.ts` "cancels a running job, aborting its work and dropping it from pending"

### IMP-35 Marking an import as reviewed
**Given** a finished import **When** the owner opens its review form, dismisses it, or sees its error **Then** the app marks it reviewed (API 204, repeatable with no effect the second time) and it is no longer pending. Marking another user's or a non-existent job answers 404.
Cites: `backend/src/routes/import.test.ts` "lists running and unreviewed jobs as pending until marked reviewed", "hides another user's jobs"

### IMP-36 Jobs never stay running forever
**Given** the server restarts while an import is running **When** it comes back **Then** that import is not left running: it resumes when the job queue can pick it up again at no extra cost; otherwise it is marked `error` with status code 500 and the message `The import was interrupted by a server restart — please try again`. Finished and cancelled jobs older than 7 days are deleted.
Decision: owner 2026-11-24, index Q33 (v1 always marked it failed)
Cites: `backend/src/routes/import.test.ts` "marks jobs left running by a previous process as failed on recovery", ADR 2026-09-24

### IMP-37 Push notification when an import finishes
**Given** the owner has subscribed one or more devices to notifications **When** an import finishes **Then** every subscribed device is notified. On success the notification is titled `Recipe ready`, says `<recipe title> — tap to review and save it.`, and opens the review of that import. On failure it is titled `Import failed`, says the failure message (or `Couldn't import that recipe.`), and opens the library home, where the failed job is restored. A cancelled job sends nothing. With push not configured on the server, the import still completes with no notification. Subscription handling (allowed endpoints, removing gone subscriptions) is specified in PWA.
Cites: `backend/src/routes/import.test.ts` "notifies every subscribed device when an import finishes, linking to the review form", "notifies about failures too", "never sends to a stored endpoint that isn't a known push service, and deletes it", "forgets a subscription the push service reports as gone", ADR 2026-09-24

### IMP-38 Starting an import from the app
**Given** the owner is on the library (Home or inside a folder) **When** they choose "Import" **Then** a dialog titled "Import a recipe" opens with one required URL field (placeholder like `https://example.com/best-tomato-soup`) and the hint that they can paste a recipe page, Instagram Reel or TikTok link and will review the ingredients and steps before saving. Submitting ("Import recipe") trims the URL and starts the import. The import is filed in the folder it was started from, or Home. Reopening the dialog while an import is in progress shows that import's progress, not a blank field.
Cites: `frontend/src/import/ImportDialog.test.tsx` "shows the URL input when opened with nothing running", "reopening a backgrounded import shows its current progress, not a blank input", "hands the folder the import was started from on to the create form"

### IMP-39 Progress the owner sees
**Given** a running import **When** the dialog is open **Then** it lists each stage reached, in order, with the latest marked as active and earlier ones as done, using these labels: `Fetching the page`, `Reading the page's recipe data`, `Downloading the video`, `Watching the video and reading the caption`, `Asking the AI to read it`, `Translating the recipe`. Before the first stage it says `Starting…`. Once a video stage appears it adds `This can take up to a minute for a video.` It shows the seconds elapsed. Stage changes are announced to assistive technology. While the app is open, progress updates within a couple of seconds. When the app is hidden and shown again it catches up immediately. A dropped connection never stops the import or the progress display.
Cites: `frontend/src/import/ImportDialog.test.tsx` "shows each stage as polling picks it up, the latest marked active", "labels the translation stage", "calls out the longer wait once a video stage appears"

### IMP-40 Leave the dialog without losing the import
**Given** a running import **When** the owner closes the dialog (close button, Escape or tapping outside) **Then** the import keeps running in the background. A separate "Cancel import" action cancels it for real on the server and returns the dialog to its blank state. The dialog offers "Keep this running in the background" next to it.
Cites: `frontend/src/import/ImportDialog.test.tsx` "closes (backgrounding, not cancelling) when the backdrop is clicked while running", "closes via the native cancel event the same way as the close button", "lets the user cancel — the server-side job is cancelled, not just hidden"

### IMP-41 What happens when an import finishes
**Given** the owner is watching the dialog **When** the import finishes successfully **Then** the app goes straight to the new-recipe form pre-filled with the draft (title, description, servings, times, ingredients, steps, tags, source URL), pre-selecting the folder the import was started from. **Given** the dialog was closed **Then** instead a toast says `Your recipe from <site> is ready to review.` with a "Review" action that opens the same form, and does not interrupt whatever the owner is doing.
Cites: `frontend/src/import/ImportDialog.test.tsx` "navigates to the create form with the extracted recipe when left open", "keeps running after being dismissed, then announces completion with a toast", "keeps the starting folder for a backgrounded import's Review action too"

### IMP-42 When an import fails
**Given** a failed import **When** the dialog is open **Then** the failure message shows inline with a "Try again" action that returns to the blank URL field. **When** the dialog was closed **Then** the message appears as a toast instead. Either way the failure counts as seen and is not shown again on the next launch. A failure to even start the import (for example the 400 message of IMP-02, or no connection) shows inline in the dialog with a generic fallback of `Failed to import that recipe`.
Cites: `frontend/src/import/ImportDialog.test.tsx` "shows the error inline and offers to try again when left open", "shows an error toast instead of an inline error once dismissed, and marks it seen", "shows a failure to even start the import inline"

### IMP-43 Picking an import back up when the app opens
**Given** the owner signs in or opens the app with an existing session **When** an import is still running or finished unreviewed **Then** the app restores the newest one: a running import resumes showing progress and polling; a finished one is announced with the "ready to review" toast and its Review action (using the folder stored on the job); a failed one is announced with its error toast. Nothing is restored when signed out, and signing out drops the shown import. An import the owner starts meanwhile is never replaced. A job cancelled from another device just disappears.
Cites: `frontend/src/import/ImportDialog.test.tsx` "offers to review an import that finished while the app was closed", "resumes polling an import that's still running", "doesn't restore anything when signed out"

### IMP-44 Offering notifications while waiting
**Given** a running import **And** the device can receive notifications **When** the progress view shows **Then** if notifications are off it offers "Notify me when it's done"; the request for permission is made only from that tap (a requirement on iPhone); once on it says `You'll get a notification when it's done — feel free to close the app.`; if the device has blocked them it explains `Notifications are blocked for Nosh. Allow them in your device settings to be notified when imports finish.` Where notifications cannot work at all, the offer is hidden.
Cites: `frontend/src/import/ImportDialog.test.tsx` "isn't offered where pushes can't work (jsdom has no PushManager)", "is offered while running when supported, and asks for permission on tap", "explains how to recover when notifications are blocked"

### IMP-45 The review form
**Given** a finished import **When** the owner opens its review (from the dialog, a toast or a notification tap) **Then** the new-recipe form opens pre-filled from the draft. Opening the review link on a device that did not run the import loads the draft from the server: while loading a placeholder shows; a failed job shows its error message; a missing or foreign job shows `That import isn't available any more.`; any other load failure shows `Couldn't load that import.` If the draft was not translated as requested the form says `Couldn't translate this recipe — it's in its original language.` The draft's photo (if any) is shown as the form's photo preview (REC-36). When the owner saves the form, unless they replaced that photo with their own or removed it (REC-33, REC-36), the draft's photo address is fetched and attached to the new recipe as a separate best-effort step after the save, using the same address and size checks as any photo fetched from a URL (see REC, SEC); if it fails the recipe stays saved and a toast says `Couldn't import the photo — add one manually`. Nothing is saved unless the owner saves.
Decision: owner 2026-11-24, index Q16 (v1 always attached the draft's photo and offered no photo choice on the form)
Cites: `frontend/src/pages/NewRecipePage.tsx`, `frontend/src/pages/RecipeFormPage.tsx`, ADR 2026-08-13

### IMP-46 AI usage is counted and never blocks an import
**Given** an AI request that Google answered (including one it rejected for quota or other reasons, with zero tokens) **When** the import runs **Then** it is recorded against the model used, with prompt tokens and output tokens (the model's hidden "thinking" tokens count as output). A request that never reached the provider (network failure, timeout) is not counted. If recording the usage fails, the import still succeeds. The estimate shown to the owner is specified in SET.
Cites: `backend/src/llm/geminiClient.test.ts` "reports token usage, counting thinking tokens as output", "counts a rejected request with zero tokens", "doesn't count a request that never reached Google", "still returns the recipe when recording usage fails", "ignores reasoning-model thought parts and uses the answer text", "uses a per-call model override instead of the default"

## Rationale
- IMP-01, IMP-31 to IMP-36: imports are server-side jobs because the owner uses nosh as an installed iPhone app, and iOS suspends a backgrounded app and kills its connections. A request tied to an open connection threw the work away. Progress delivery (checking the server on a timer, server-sent events, or anything else) is the builder's choice (design §6, §13); what matters is that the owner sees progress and gets a notification when it finishes even after leaving the app. ADR 2026-09-24 explains why the earlier streamed approach was replaced (ADR 2026-08-11).
- IMP-03, IMP-15, IMP-19: the page fetch, redirects, the photo fetch and the video downloader all fetch user-supplied URLs, so they sit behind the outbound-address guard (design §9, ADR 2026-09-25). IMP-03 gives the owner a real 400 for the obvious cases instead of a job that fails a moment later. The guard itself belongs to SEC.
- IMP-08, IMP-11: the structured-data path is near-instant, free and needs no key. The AI is only a fallback. The app must still start with no AI key (ADR 2026-08-11).
- IMP-10, IMP-22: site `keywords` are written for SEO (author names, dish restatements) and make useless filters. A small vocabulary modelled on meal-kit tags keeps tags comparable. The AI is asked to be selective, but the schema cannot enforce that, so the server prunes (ADR 2026-08-11, two entries). Derived tags are deliberately conservative: a tag that is sometimes wrong is worse than a missing one the owner can add.
- IMP-14: the page fetch identifies itself as a browser-like client, because many recipe sites reject requests with no identity. The page-size and time caps stop a hostile or huge page from tying the server up. The raw network error is hidden so that import cannot be used to scan which hosts and ports answer.
- IMP-18: the video limits (3 minutes, 18 MiB, 480p) keep the request under the AI's inline-data ceiling after base64 growth and are checked before downloading where possible (ADR 2026-08-12). The platform's raw error wording varies by version, so it is logged, not pattern-matched. The downloader is `yt-dlp`, which must ship in the one container (design §3).
- IMP-20, IMP-27: the title rule exists because models copy SEO-style headlines verbatim. Content from a page or caption is fenced as data because it is third-party text. The impact of a hostile page is already low (the output shape is constrained, tags are re-filtered, the source URL is ours, the owner reviews everything), but the boundary is free.
- IMP-21: both sources emit near-misses (an empty string where null is wanted, `Serves 0`). Validating first would discard good recipes over one stray field, so the clean-up runs before validation.
- IMP-25 (order): translate, then convert units, then store. Conversion works on Dutch and English unit words alike and is the only step that changes amounts, so it goes last and works on either language. The AI is never asked to convert; it only translates words. Tags are not translated (they are fixed English identifiers; the UI labels them). Units and temperatures are stored converted so every view and the search index see what the owner sees (ADR 2026-09-25). UNIT and SET describe the same pipeline from their side: SET holds the preferences, UNIT the conversion rules.
- IMP-26, IMP-29: the heuristic that decides "already in the target language" counts common words; a wrong "needs translating" costs one AI call and is preferred over leaving a recipe in the wrong language. Translation fails open because a recipe in the wrong language beats no recipe.
- IMP-28: models "translate" cup to kopje and oz to ons, which are different quantities (in Belgium an ons is 100 g), and sometimes alter numbers. So amounts are restored from the original.
- IMP-31 (failure codes): the status codes kept on a failed job are 400 invalid or blocked URL, 502 page, post or video could not be reached, 422 no recipe found, video too long or too large, or AI rejected the request, 503 AI not configured, AI busy or over quota, or downloader unavailable, and 500 unexpected. The app words errors by kind from these.
- IMP-35: the job is marked reviewed when the owner opens the review (not only on save), so the same result is not offered again on every launch. Opening is repeatable until the owner leaves it.
- IMP-36: today jobs run inside the server process, so a restart kills them and boot marks them failed. A queue-backed design may resume them instead. The criterion allows either, so long as nothing spins forever. The builder's plan names which branch the chosen job queue gives (resume or fail with the message) and tests that one; the other branch is then not built.
- IMP-45: the photo is attached after saving because images belong to a recipe that does not exist until the owner saves (ADR 2026-08-13). A failed photo never undoes a save. A photo the owner chose on the form wins over the draft's (owner, Q16), and the draft's photo is previewed so that choice is a knowing one.
- IMP-23 (caps): a draft over a cap is kept whole and left to the owner rather than truncated, because cutting ingredients or steps would quietly drop data; recipes that long are rare.
- Not covered here: Gemini is the provider (design §3, one server-side key, per-user model choice from an allowlist). Which model is "automatic" for text versus video, the allowlist, and the usage estimate are SET's. The model list used today pairs a stronger model for pages with a cheaper model with a much larger free daily quota for video.

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q6 rate-limit key: the per-user cap stays and a per-IP cap of 30 starts per hour is added. IMP-06 (and SEC-59).
- Q9 notifications: the "Notify me" prompt stays in the import screen; the on/off toggle moves to Settings. No criterion changed here (IMP-44; PWA-28, SET-30).
- Q12 caps: a draft over a recipe cap is not a failed import; it opens in the review form, which refuses to save until it is within the caps. IMP-23.
- Q16 photo on the create form: a photo the owner chose on the form wins over the draft's photo, which is shown as the preview. IMP-45.
- Q17 zero times: the clean-up treats a prep or cook time of 0 as none, the same as servings. IMP-21.
- Q21 AI provider wording: one plain message for every AI rejection. IMP-24.
- Q22 only the newest finished import is announced on launch: kept. No criterion changed (IMP-43).
- Q33 restarts and duplicates: a running import resumes if the job queue makes it free, otherwise it fails with the "interrupted" message; the same URL may be imported twice. IMP-01, IMP-36.
- Group E note: import from pasted text, a photo or a screenshot stays in the backlog (design §2). No change.

## Tests not carried
- `backend/src/llm/geminiClient.test.ts` "sends the model, API key, and a JSON responseSchema": implementation detail (header names, URL shape, schema format); the observable parts are in IMP-11 and IMP-20.
- `backend/src/llm/geminiClient.test.ts` "createGeminiVideoExtractor maps quota and outage responses to a retryable error": same as the text case, covered by IMP-24.
- `backend/src/services/socialVideo.test.ts` "routes every yt-dlp invocation through the egress proxy": outbound-guard mechanics, carried by SEC-48 (cited there).
- `backend/src/services/socialVideo.test.ts` "drops every proxy variable, in either case, and keeps the rest": outbound-guard mechanics, carried by SEC-48 (cited there).
- `backend/src/services/socialVideo.runner.test.ts` "runs /usr/bin/yt-dlp with --proxy and an environment with no proxy variables": outbound-guard mechanics of the current downloader, carried by SEC-48 (cited there).

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.

# Settings

## Purpose
One settings screen where the owner chooses which AI model imports use, sees an
estimate of how much of today's free AI quota is left, and sets how recipes are
translated and displayed. The meaning of the language and unit options belongs
to the units area (UNIT); this area covers what the screen lets the owner set
and see, and how those choices are stored.

## Sources
- `backend/src/routes/settings.ts`
- `backend/src/routes/settings.test.ts`
- `backend/src/config/llmModels.ts`
- `backend/src/config/llmModels.test.ts`
- `backend/src/repositories/llmUsage.ts`
- `backend/src/repositories/users.ts`
- `backend/migrations/1700000000013_magic-import-settings.js`
- `frontend/src/api/settings.ts`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/SettingsPage.test.tsx`
- `frontend/src/components/RecipePreferencesSection.tsx`

## ADRs
- 2026-09-24: Magic import settings — per-user model choice, self-counted usage estimate
- 2026-09-25: Recipe scaling, unit conversion and auto-translated imports

## Features
| Feature | Verdict | Why |
|---|---|---|
| Settings screen (reached from the top-right settings icon) | keep | Single home for every per-user preference. |
| Account section (username, Log out, app version) on this screen | keep | Decided by the owner (index Q9): these move here from the header user menu (AUTH-21, SET-30). |
| Model picker: Automatic or one allowed model, saved per user | keep | Owner's explicit ask (ADR 2026-09-24): a saved choice, not a per-import prompt. |
| Usage estimate: "~N of M requests left today" plus tokens used today, per model | keep | Google exposes no remaining-quota figure, so nosh counts its own calls. |
| Usage estimate is shared across all users and bucketed by the Pacific calendar day | keep | Google's limits are per project and reset at midnight Pacific. |
| API key handling: one server-side key; the screen only says whether AI import is available | keep | No key is ever entered, shown or stored through the UI. See SET-14. |
| "AI import isn't set up" notice when the server has no key | keep | Avoids offering a choice that cannot take effect. |
| Allowed-model list with optional daily limits comes from server configuration | keep | Model ids go into outbound request addresses, so they cannot be free text. |
| Recipe preferences: recipe language, units, oven temperature, keep spoons as spoons | keep | Controls live here; their meaning is in UNIT. |
| Optimistic save with revert and toast on failure, per control | keep | Each control saves on its own, with no Save button. |
| Push notification toggle on this screen | keep | Decided by the owner (index Q9): the toggle moves here from the user menu, which design §7 removes (SET-30). Its behaviour is owned by PWA (PWA-27 to PWA-30). |
| Separate text-model and video-model pickers | drop | Decided by the owner (index Q23): one picker with Automatic, as today (ADR 2026-09-24). |

## Acceptance criteria

### SET-01 Settings need a signed-in owner
**Given** a request with no valid session **When** it reads or changes the model settings or the recipe preferences **Then** it is rejected with 401 and nothing is read or stored.
Cites: `backend/src/routes/settings.test.ts` "requires a session" (both groups)

### SET-02 Model settings default to Automatic
**Given** a user who has never chosen a model **When** they load the model settings **Then** the selected model is null (Automatic), the response names the default model for web pages and the default for videos, and lists every allowed model with its daily request limit (or null when none is configured) and zero requests, zero prompt tokens and zero output tokens today.
Cites: `backend/src/routes/settings.test.ts` "defaults to automatic and lists every allowed model with zero usage"

### SET-03 Choosing a model saves it
**Given** a signed-in user **When** they choose an allowed model **Then** the full updated model settings come back with that model selected, and a later load still shows it.
Cites: `backend/src/routes/settings.test.ts` "saves an allowed model and returns the updated settings"

### SET-04 Returning to Automatic
**Given** a user who chose a model **When** they choose Automatic (null) **Then** the stored choice is cleared and the selected model reads null.
Cites: `backend/src/routes/settings.test.ts` "goes back to automatic with null"

### SET-05 Models off the allowed list are refused
**Given** a signed-in user **When** they submit a model id that is not on the allowed list (for example `../../evil`), or a body whose model is neither a string nor null (for example 42) **Then** the response is 400 (with the message "That model isn't available" for an unlisted id) and the stored choice is unchanged.
Cites: `backend/src/routes/settings.test.ts` "rejects a model that isn't on the allowlist", "rejects a malformed body"

### SET-06 The model choice is per user
**Given** two users **When** one chooses a model **Then** the other still sees Automatic.
Cites: `backend/src/routes/settings.test.ts` "keeps each user's choice separate"

### SET-07 A saved model that is no longer allowed counts as Automatic
**Given** a user whose saved model has since been removed from the allowed list **When** the settings are loaded or an import runs **Then** it behaves as Automatic rather than failing or staying selected.
Cites: `backend/src/config/llmModels.test.ts` "returns a saved model that's still allowed", "falls back to automatic for no preference or one no longer allowed", ADR 2026-09-24

### SET-08 Usage is summed per model and shared by every user
**Given** AI requests recorded today against one or more models, by any user's imports **When** any user loads the model settings **Then** each model shows its total requests, prompt tokens and output tokens today across all users; models with no calls today show zeros.
Cites: `backend/src/routes/settings.test.ts` "sums today's usage per model, shared across all users", ADR 2026-09-24

### SET-09 The usage day is the Pacific calendar day
**Given** usage recorded at any moment **When** midnight passes in the America/Los_Angeles time zone **Then** the counters start again from zero, regardless of the host's own time zone.
Cites: ADR 2026-09-24 (no automated test; `backend/src/repositories/llmUsage.ts`)

### SET-10 What counts as a request
**Given** an import that calls the AI service **When** the service answers (including with an error status) **Then** one request is counted for that model, with its prompt tokens and its output tokens (thinking tokens included in the output figure), and zero tokens if the answer carried no usage data. Calls that never reached the service (network failure, own timeout) are not counted. If counting itself fails, the import is not failed.
Cites: ADR 2026-09-24 (no automated test in this area; `backend/src/repositories/llmUsage.ts`)

### SET-11 Requests-left estimate
**Given** a model with a configured daily limit **When** the settings screen shows it **Then** it reads "~N of M requests left today", where N is the limit minus today's requests and never below 0, with a bar showing the fraction left. The screen marks the model as nearly used up (at most 20% left) or fully used up (0 left).
Cites: `frontend/src/pages/SettingsPage.test.tsx` "shows automatic selected and each model's estimated requests left" ("~17 of 20", "~0 of 500")

### SET-12 Model with no configured limit
**Given** a model whose daily limit is unknown **When** the screen shows it **Then** it shows only usage, "1 request today" or "N requests today" (singular for exactly one), and no "left" figure or bar.
Cites: `frontend/src/pages/SettingsPage.test.tsx` "shows automatic selected and each model's estimated requests left" ("1 request today")

### SET-13 Token usage line and honesty footnote
**Given** a model on the settings screen **When** it is shown **Then** it also shows prompt plus output tokens today in compact form (for example "10K tokens used today"), and the section carries a note that these are estimates counted from nosh's own imports, that other users of the same AI key are not seen, and that daily limits reset at midnight Pacific time.
Cites: `frontend/src/pages/SettingsPage.test.tsx` "shows automatic selected and each model's estimated requests left" ("10K tokens used today"), ADR 2026-09-24

### SET-14 API key is server-side only
**Given** the settings screen and its endpoints **When** the owner uses them **Then** there is no field to enter, view or change an AI key, and no response contains one. The only key-related output is a flag saying whether AI import is available (true when the server holds a key).
Cites: `backend/src/routes/settings.test.ts` "reports aiConfigured when an extractor is present", "defaults to automatic and lists every allowed model with zero usage" (flag false)

### SET-15 Screen when AI import is not set up
**Given** the server has no AI key **When** the owner opens settings **Then** the model section shows a notice that AI-assisted import is not set up on this server and that pages publishing their own recipe data still import fine, and it offers no model choices. The recipe preferences section is unaffected.
Cites: `frontend/src/pages/SettingsPage.test.tsx` "explains when the server has no AI configured"

### SET-16 Model picker choices and wording
**Given** AI import is set up **When** the owner opens the model section **Then** they see a line saying the model is only used when a page has no recipe data of its own or for Instagram and TikTok videos, an "Automatic" choice (selected by default) naming the default model for web pages and the default for videos, and one choice per allowed model showing its id and usage.
Cites: `frontend/src/pages/SettingsPage.test.tsx` "shows automatic selected and each model's estimated requests left"

### SET-17 Saving a model choice from the screen
**Given** the model picker **When** the owner picks a choice **Then** the selection moves immediately, the controls are disabled while the save is in flight, and on success the screen shows the figures returned by the server. **If** the save fails, the selection snaps back to the previous choice and a toast says "Couldn't save your model choice".
Cites: `frontend/src/pages/SettingsPage.test.tsx` "saves a chosen model", "reverts the choice and toasts when saving fails"

### SET-18 Allowed-model list: format and limits
**Given** the server's configured list of allowed models, written as comma-separated `id` or `id=dailyLimit` entries **When** it is read at startup **Then** ids and limits are trimmed, empty entries and repeated ids (the first wins) are ignored, an entry without a limit has none, and the two default models are always included (with no limit if the list omitted them) so Automatic never points at an unlisted model.
Cites: `backend/src/config/llmModels.test.ts` "parses ids with and without a daily limit", "always includes the per-path default models", "ignores empty entries and duplicates"

### SET-19 Allowed-model list: malformed entries stop startup
**Given** a configured entry whose id contains characters other than lowercase letters, digits, dots and hyphens (or does not start with a letter or digit), or whose limit is not a positive whole number **When** the server starts **Then** it fails with a clear error naming the entry rather than silently dropping it. This also guarantees a model id can never alter the outbound request address.
Cites: `backend/src/config/llmModels.test.ts` "rejects ids that could change the request path", "rejects a non-positive or non-integer limit"

### SET-20 Default models and limits
**Given** no model list is configured **When** the server starts **Then** two models are offered: the standard model for web pages with a 20 requests/day limit and the lighter model for video with a 500 requests/day limit.
Cites: ADR 2026-09-24 (default constant in `backend/src/config/llmModels.ts`; the 20 vs 500 figures come from ADR 2026-08-12)

### SET-21 Recipe preferences default values
**Given** a new user **When** they load their recipe preferences **Then** they get language null (keep the original), unit system metric, temperature unit C, and keep spoons true.
Cites: `backend/src/routes/settings.test.ts` "defaults to original language, metric, °C and keeping spoons"

### SET-22 Preferences update only the fields sent
**Given** a user with preferences **When** they submit any subset of language (nl, en or null), unit system (metric or us), temperature unit (C or F) and keep spoons (true or false) **Then** only those fields change and the full updated preferences are returned. An empty body changes nothing and returns the current preferences.
Cites: `backend/src/routes/settings.test.ts` "updates only the fields sent"

### SET-23 Invalid preference values are refused
**Given** a signed-in user **When** they submit a language outside nl/en/null, a unit system other than metric/us, a temperature unit other than C/F, a non-boolean keep spoons, or any unknown field **Then** the response is 400 and nothing is stored.
Cites: `backend/src/routes/settings.test.ts` "rejects %j" (five cases)

### SET-24 Preferences are per user
**Given** two users **When** one changes a preference **Then** the other's preferences are unchanged.
Cites: `backend/src/routes/settings.test.ts` "keeps each user's preferences separate"

### SET-25 Preferences controls on the screen
**Given** the settings screen **When** the owner opens it **Then** the Language and units section shows the saved values for: recipe language (Keep original, Nederlands, English), units (Metric, US), oven temperature (°C, °F) and a "Keep spoons as spoons" checkbox, each with a short hint, plus notes that imported recipes are translated into the chosen language (which can use one extra AI request) and that recipes are shown, and imports saved, in these units.
Cites: `frontend/src/pages/SettingsPage.test.tsx` "shows the saved preferences"

### SET-26 Saving a preference from the screen
**Given** the preferences section **When** the owner changes one control **Then** only that field is sent, the control moves immediately and is disabled while saving, and the server's returned preferences replace the local ones. **If** the save fails, the control snaps back and a toast says "Couldn't save your preference".
Cites: `frontend/src/pages/SettingsPage.test.tsx` "saves just the changed field", "snaps back and says so when saving fails"

### SET-27 Sections load independently
**Given** the settings screen is opening **When** the model settings or the preferences are still loading **Then** that section shows a loading placeholder, and **if** one fails to load, that section shows an error alert while the other still renders.
Cites: `frontend/src/pages/SettingsPage.tsx` (no automated test)

### SET-28 ~~Push "notify me" is not a setting here~~
Struck in the consistency pass: it recorded where the toggle is not, and the user menu that holds it today goes away (design §7). The toggle's behaviour is PWA-27 to PWA-30; the owner placed it on this screen (index Q9, SET-30).
Cites: none (struck)

### SET-29 Imports use the settings in force when they start
**Given** a user's saved model choice, recipe language, unit system, temperature unit and keep-spoons setting **When** they start an import **Then** the import uses those values as read at the moment it starts (a saved model no longer on the allowed list counts as Automatic, SET-07); changing a setting afterwards does not affect an import already running. See IMP-07 and UNIT-35.
Cites: `backend/src/routes/import.ts` (no test in this area)

### SET-30 Account and Notifications sections
**Given** a signed-in owner **When** they open the Settings screen **Then**, besides the model and preference sections, it has an Account section with their username and a "Log out" action, and the app version at the bottom of the screen (AUTH-21); and, where push can work on this device (PWA-26), a Notifications section with the import-notification toggle in its current state (PWA-27 to PWA-30). Where push cannot work, the Notifications section is not shown.
Decision: owner 2026-11-24, index Q9 (v1 had these entries in a menu under the username in the header, not on the Settings screen)
Cites: `frontend/src/components/UserMenu.tsx`, `frontend/src/pages/SettingsPage.tsx`, design §7

## Rationale
- **SET-07, SET-19:** the allowed list is runtime configuration, not schema, so a stored id can outlive its place on the list. Model ids go into the outbound request address, so they are checked when saved, when parsed, and when an import reads them back (ADR 2026-09-24).
- **SET-08, SET-09:** Google applies limits per project, not per user, and resets daily quotas at midnight Pacific time. A per-user or UTC-day count would be wrong (ADR 2026-09-24). Counts live in the database so a redeploy does not reset them.
- **SET-10:** counting error answers is the conservative choice for an estimate; a counting failure must never break the import it describes (ADR 2026-09-24).
- **SET-11 to SET-13:** Google has no remaining-quota endpoint, so "left" is an estimate from configured limits minus self-counted calls. The "~" and the footnote are deliberate hedges (ADR 2026-09-24).
- **SET-14, SET-15:** one server-side key keeps secrets out of the browser and the database; the screen only avoids offering a choice that cannot take effect.
- **SET-17, SET-26:** the owner asked for a saved setting, not a prompt on every import, and each control saves alone so there is no Save button to forget.
- **SET-20:** 20 vs 500 requests/day was the deciding factor for using the lighter model on video.

### Owner decisions (2026-11-24)
The owner accepted every default in index.md on 2026-11-24.
- Q9 user menu entries: the Settings screen gets an Account section (username, "Log out", version at the bottom) and a Notifications toggle. SET-30 (new); SET-28 stays struck.
- Q23 one model picker or two: one picker with Automatic, as today. No criterion changed.
- Q28 AI usage estimate: kept on this screen, shared across users. No criterion changed (SET-08 to SET-13).

## Tests not carried
- None. Every case in `backend/src/routes/settings.test.ts`, `backend/src/config/llmModels.test.ts` and `frontend/src/pages/SettingsPage.test.tsx` is carried. `frontend/src/components/RecipePreferencesSection.tsx` has no test file of its own; it is covered through the page test (SET-25, SET-26).

## Open questions for the owner
All answered by the owner on 2026-11-24 (accepted defaults); see Rationale, Owner decisions.

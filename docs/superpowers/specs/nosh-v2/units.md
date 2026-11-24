# Units, quantities, scaling and recipe language

## Purpose
Ingredient amounts are free text ("1 1/2", "2-3", "2 x 400"). This area turns them into numbers so the owner can scale a recipe to more or fewer servings, or to the amount of one ingredient they have, and see every recipe in their own units (metric or US, °C or °F). It also splits imported ingredient lines into quantity, unit and name, and decides whether an imported recipe needs translating into the owner's recipe language.

## Sources
- `packages/units/src/convert.ts`
- `packages/units/src/format.ts`
- `packages/units/src/index.ts`
- `packages/units/src/preferences.ts`
- `packages/units/src/quantity.ts`
- `packages/units/src/temperature.ts`
- `packages/units/src/units.ts`
- `packages/units/src/units.test.ts`
- `backend/src/services/recipeUnits.ts`
- `backend/src/services/recipeLanguage.ts`
- `backend/src/services/recipeLanguage.test.ts`
- `backend/src/services/ingredientLine.ts`
- `backend/src/services/ingredientLine.test.ts`
- `backend/migrations/1700000000015_recipe-preferences.js`
- `frontend/src/components/ScaleToPopover.tsx`
- `frontend/src/components/ServingsStepper.tsx`
- `frontend/src/components/IngredientList.tsx`
- `frontend/src/hooks/useRecipePreferences.ts`
- `frontend/src/pages/RecipeDetailPage.test.tsx`
- `backend/src/routes/settings.ts`
- `backend/src/repositories/users.ts`

## ADRs
- 2026-08-11: Ingredient lines are split into quantity/unit/name on import
- 2026-09-25: Recipe scaling, unit conversion and auto-translated imports

## Features
| Feature | Verdict | Why |
|---|---|---|
| Servings stepper (and batch multiplier when no servings count) | keep | Core cooking need; view-only, never saved. |
| "I have ___" scale-from-one-ingredient | keep | Owner bakes and uses it ("150 g, I have 200 g"); exact factor. |
| Exact amounts, max two decimals, never snapped to fractions | keep | Explicit owner decision: baking needs 2.67 eggs, not 3. |
| Metric/US conversion of ingredient amounts at display time | keep | Applies to every recipe, including typed-in ones. |
| Auto-tidy unit ladders (48 tsp to 1 cup, 750 g x 2 to 1.5 kg) | keep | Avoids unreadable results like 1.33 tbsp. |
| Keep spoons as spoons in metric | keep | European recipe practice. |
| Temperature conversion (°C/°F) in step text | keep | Display time and import time. |
| Dutch and English unit words | keep | Recipe content is Dutch or English. |
| Import ingredient-line parsing | keep | Without it every imported line lands in the name field. |
| Stopword language detection (skip pointless translation call) | keep | Saves model quota; uncertain means translate. |
| Per-user recipe preferences (language, unit system, temperature, keep spoons) | keep | Stored on the user; edited in settings (see SET). |
| Convert-and-store on import (lossy) | owner? | Accepted as lossy in 2026-09-25, but it is the one place data is silently changed; see Open question 1. |
| Volume to weight conversion | drop | Needs ingredient densities; stays in the backlog (design §2). |
| Locale decimals in the recipe form | drop | Backlog item; only reading "2,5" is carried. |

## Acceptance criteria

### UNIT-01 Single numbers are understood in every common written form
**Given** a stored quantity text **When** it is evaluated **Then** "2", "2.5", "2,5" (comma decimal), "1/2", "½", "1 1/2", "1 ½", "1½" and "⅓" evaluate to 2, 2.5, 2.5, 0.5, 0.5, 1.5, 1.5, 1.5 and one third; all Unicode vulgar fractions (¼ ½ ¾ ⅐ ⅑ ⅒ ⅓ ⅔ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞) are supported.
Cites: `packages/units/src/units.test.ts` "parseNumber"

### UNIT-02 Malformed numbers are rejected, not guessed
**Given** the text "", "a few", "1/0", "1 2", "2.5.1" or "½½" **When** it is evaluated as a number **Then** it is not a number (it is never turned into a value such as 1 or 12).
Cites: `packages/units/src/units.test.ts` "parseNumber" (rejects)

### UNIT-03 Quantities may be a single amount, a range or a multipack
**Given** a quantity text **When** it is evaluated **Then** "1 1/2" is a single amount of 1.5; "2-3", "2 to 3", "2 tot 3" (also en and em dash) are a range of 2 to 3; "2 x 400" and "2×400" are a multipack of 2 packs of 400.
Cites: `packages/units/src/units.test.ts` "parseQuantity"

### UNIT-04 Quantities that cannot be understood are shown as written and never scaled
**Given** an ingredient with no quantity, or a quantity such as "a pinch", "some" or "a few" **When** the recipe is scaled or converted **Then** the ingredient is shown exactly as stored, whatever the scale factor.
Cites: `packages/units/src/units.test.ts` "parseQuantity" (null), "convertIngredient: scaling" "leaves unparseable or empty quantities alone"

### UNIT-05 Displayed numbers have at most two decimals and are never fractions
**Given** a computed amount **When** it is shown **Then** it has at most two decimals with trailing zeros dropped (133.3333 shows 133.33, 1.5 shows 1.5, 2 shows 2, 2.666666 shows 2.67) and is never converted to a fraction; an amount so small it would round to 0 keeps two significant digits (0.004 shows 0.004). Rounding happens once, at display, never between steps.
Cites: `packages/units/src/units.test.ts` "formatQuantity", ADR 2026-09-25

### UNIT-06 English and Dutch unit spellings are recognised, including plurals
**Given** a unit word **When** it is looked up **Then** it is recognised case-insensitively, with a trailing full stop ignored and a regular plural stripped: "cups" is a cup, "Tablespoons", "el" and "eetlepels" are tablespoons, "tl" is a teaspoon, "fl oz" is a fluid ounce, "gram" is grams, "lbs" is pounds. The full list is: mg, milligram(me); g, gr, gram, gramme, grammen; kg, kilo, kilogram(me); oz, ounce; lb, lbs, pound; ml, milliliter, millilitre; cl, centiliter, centilitre; dl, deciliter, decilitre; l, liter, litre; tsp, teaspoon, tl, theelepel; tbsp, tbs, tablespoon, el, eetlepel; fl oz, floz, fl. oz; cup; pint; quart; gallon.
Cites: `packages/units/src/units.test.ts` "lookupUnit" "recognises English and Dutch spellings and plurals", ADR 2026-09-25

### UNIT-07 Count units are recognised as units but are not measurable
**Given** a unit word such as "cloves", "cans", "teentje", "blik", "snufje" or the Dutch "kopje" **When** it is looked up **Then** it counts as a unit word for ingredient-line splitting but has no measurable equivalent, so it is never converted. The Dutch "kopje" is deliberately a count unit and not a US cup. The count-unit list: can, tin, jar, packet, pack, package, box, bag, bottle, clove, stick, stalk, sprig, bunch, head, rasher, slice, piece, sheet, ball, knob, strip, fillet, rib, ear, pinch, dash, drop, handful, splash, scoop, square; blik, blikje, blikken, teen, teentje, tenen, snufje, snuf, takje, bosje, stuk, stuks, plak, plakje, plakken, zakje, pak, potje, scheutje, kopje, handvol, mespunt, snee, sneetje.
Cites: `packages/units/src/units.test.ts` "lookupUnit" "treats count units and a Dutch kopje as not measurable", ADR 2026-09-25

### UNIT-08 US measures use their exact definitions
**Given** the units cup, pint, quart, gallon, oz, lb, fl oz, tsp and tbsp **When** they are converted **Then** they are the US customary measures (1 cup = 236.5882365 ml, 1 tsp = 4.92892159375 ml, 1 lb = 453.59237 g, 1 oz = 28.349523125 g); "oz" is weight and "fl oz" is volume; "cup", "pint", "quart" and "gallon" are always the US ones. Factors are exact, not rounded.
Cites: ADR 2026-09-25

### UNIT-09 Counts scale exactly
**Given** "2 eggs" **When** the recipe is scaled by 4/3 **Then** it shows "2.67 eggs", not 3.
Cites: `packages/units/src/units.test.ts` "convertIngredient: scaling" "scales counts exactly"

### UNIT-10 Ranges scale at both ends; multipacks scale the count only
**Given** "2-3 cloves" and "2 x 400 g" **When** scaled by 2 and 1.5 **Then** the range shows "4-6" and the multipack shows "3 x 400 g" (three 400 g tins, not two 600 g ones).
Cites: `packages/units/src/units.test.ts` "convertIngredient: scaling" "scales both ends of a range and only the count of a multipack"

### UNIT-11 A unit the author wrote keeps the author's spelling
**Given** "150 gram" or "2 el" **When** the unit does not need to change (scaled by 4/3, or converted to the same system) **Then** the text keeps the author's own word ("200 gram", "2 el"), not an abbreviation.
Cites: `packages/units/src/units.test.ts` "convertIngredient: scaling" "keeps the author's unit spelling when the unit doesn't change"

### UNIT-12 Auto-tidy moves up a unit only on a whole quarter
**Given** an amount already in the owner's unit system **When** the result in a larger unit of the same ladder is a whole quarter (a multiple of 0.25) **Then** it moves up: 750 g scaled by 2 shows "1.5 kg", 48 tsp in US shows "1 cup", 3 tsp in metric shows "1 tbsp". Otherwise it stays: 4 tsp stays "4 tsp" (not 1.33 tbsp), 1200 g stays "1200 g".
Cites: `packages/units/src/units.test.ts` "convertIngredient: auto-tidy" "moves up a unit when the result is a whole quarter", "stays put rather than show an awkward larger-unit decimal", ADR 2026-09-25

### UNIT-13 Auto-tidy moves down only below a quarter
**Given** "1/2 cup" in US **When** shown unscaled **Then** it shows "0.5 cup" (not 8 tbsp); **When** scaled by 0.25 (an eighth of a cup) **Then** it drops to "2 tbsp". An amount below a quarter of its unit drops to the largest smaller unit whose value is at least 1.
Cites: `packages/units/src/units.test.ts` "convertIngredient: auto-tidy" "keeps a fractional amount in the author's unit, but drops below a quarter"

### UNIT-14 Converting into a unit system picks the largest unit with a value of at least 1
**Given** an amount in the other system **When** converted **Then** the unit ladders are: metric mass mg, g, kg; metric volume ml, l; US mass oz, lb; US volume tsp, tbsp, cup. The largest unit whose value is at least 1 is used: 5 cups in metric shows "1.18 l", 1 cup shows "236.59 ml". A US volume is never expressed in "fl oz" unless the author wrote "fl oz". Volume and weight are never converted into each other.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "converts US to metric with exact factors", ADR 2026-09-25

### UNIT-15 US to metric uses exact factors
**Given** US amounts **When** shown in metric **Then** 1 cup is "236.59 ml", 2 lb is "907.18 g", 5 cups is "1.18 l", 8 oz is "226.8 g".
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "converts US to metric with exact factors"

### UNIT-16 Metric to US uses exact factors
**Given** metric amounts **When** shown in US **Then** 500 g is "1.1 lb", 100 g is "3.53 oz", 250 ml is "1.06 cups", 5 ml is "1.01 tsp". A cup, pint, quart or gallon label takes an "s" unless the number is exactly 1.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "converts metric to US"

### UNIT-17 Spoons stay spoons in metric when "keep spoons" is on
**Given** keep spoons on and metric selected **When** "2 tbsp" is shown **Then** it stays "2 tbsp". **Given** keep spoons off **Then** it shows "29.57 ml". **Given** keep spoons on and an amount of 16 tbsp or more (a cup's worth) **Then** it shows ml anyway ("20 tbsp" shows "295.74 ml"). In US, spoons are always spoons.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "keeps spoons as spoons in metric unless told otherwise", ADR 2026-09-25

### UNIT-18 Centilitres and decilitres normalise to ml and l in metric
**Given** "2 dl" and "150 cl" **When** shown in metric **Then** they show "200 ml" and "1.5 l".
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "normalises cl/dl to ml/l in metric"

### UNIT-19 A unit that conversion introduces is labelled in the recipe language
**Given** "3 tl" and metric **When** it tidies up to a tablespoon **Then** the label is "el" with recipe language Dutch and "tbsp" with English (or no language set). Teaspoon is "tl"/"tsp" and tablespoon "el"/"tbsp" by language; every other label is the same in both languages.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "labels a newly introduced unit in the recipe language", ADR 2026-09-25

### UNIT-20 Ranges and multipacks convert as well as scale
**Given** "2 x 14 oz" and "1-2 cups" **When** shown in metric **Then** they show "2 x 396.89 g" and "236.59-473.18 ml": the pack size of a multipack and both ends of a range are converted. The unit is chosen from the pack size, or from the low end of a range.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "converts the pack size of a multipack and both ends of a range"

### UNIT-21 Count ingredients are scaled but never converted
**Given** "2 cans" (or any count unit, or no unit) **When** shown in either unit system **Then** the unit is untouched; only the number is scaled.
Cites: `packages/units/src/units.test.ts` "convertIngredient: unit systems" "never converts count units"

### UNIT-22 Explicit temperatures in text are converted to whole degrees
**Given** a step with an explicit temperature **When** converted to the owner's temperature unit **Then** these are recognised and rewritten as a number followed by °C or °F: "350°F" (177°C), "180 °C" (356°F), "350 degrees Fahrenheit", "200 graden Celsius", a bare uppercase "200C/180C fan" (as UK sites write it), and a range "350-375°F" (177-191°C). Results round to whole degrees; ingredient amounts keep two decimals.
Cites: `packages/units/src/units.test.ts` "convertTemperaturesInText" "converts explicit temperatures to whole degrees", ADR 2026-09-25

### UNIT-23 Temperatures without an explicit scale are never touched
**Given** "Bake 20 minutes at 180, then 180°C for 5." and "Cut into 4 pieces at 45 degrees" **When** converted **Then** the text is unchanged: a lone number is never a temperature, only two- or three-digit numbers qualify, and a temperature already in the target unit is left as written.
Cites: `packages/units/src/units.test.ts` "convertTemperaturesInText" "leaves bare numbers and already-matching temperatures alone"

### UNIT-24 Scale-from-an-ingredient needs a single positive amount
**Given** an ingredient **When** the recipe page shows it **Then** its amount is tappable ("scale recipe from <name>") only if the quantity is a single positive number: not a range, not a multipack, not empty or "to taste", not zero.
Cites: `packages/units/src/units.test.ts` "anchorFactor" "canAnchor only on a single positive amount", `frontend/src/pages/RecipeDetailPage.test.tsx` "offers no scale-from button for amounts that can't anchor"

### UNIT-25 "I have ___" computes an exact scale factor
**Given** a recipe with 150 g cottage cheese (4 servings) **When** the owner enters 200 g **Then** the whole recipe scales by 4/3: 200 g cottage cheese, 2.67 eggs, 5.33 servings. The factor is measured against the stored amount, not the rounded displayed one.
Cites: `packages/units/src/units.test.ts` "anchorFactor" "scales from what you have", `frontend/src/pages/RecipeDetailPage.test.tsx` "scales from one ingredient, exactly (150 g → 200 g)"

### UNIT-26 "I have ___" accepts another unit of the same kind only
**Given** an ingredient measured in grams **When** the owner picks "kg" and enters 0.3 **Then** it works (500 g with 1 kg gives factor 2; 1 cup with 473.176473 ml gives 2). The unit picker offers only units of the same kind (mass or volume), labelled in the recipe language, and defaults to the unit currently shown. A count ingredient ("2 eggs", "cloves") has no picker and shows its unit word as plain text; 3 given for 2 gives factor 1.5. Mass and volume are never mixed (1 cup with 100 g gives no factor).
Cites: `packages/units/src/units.test.ts` "anchorFactor" "accepts another unit of the same dimension", "works on counts and rejects mismatched dimensions or unusable amounts", `frontend/src/pages/RecipeDetailPage.test.tsx` "accepts another unit of the same kind"

### UNIT-27 "I have ___" shows a clear error for an unusable amount
**Given** the "I have" field **When** the owner submits "lots", empty, 0 or a negative **Then** it shows "Enter an amount above 0.", stays open, and the scale is unchanged. The field accepts the same number forms as quantities (UNIT-01) and is prefilled with the amount currently shown. Escape or a click outside closes it without scaling.
Cites: `packages/units/src/units.test.ts` "anchorFactor" (zero amount), `frontend/src/pages/RecipeDetailPage.test.tsx` "rejects an unusable amount and keeps the popover open"

### UNIT-28 The servings stepper moves by whole servings
**Given** a recipe with a servings count **When** the owner presses "More servings" or "Fewer servings" **Then** the label ("6 servings", "1 serving") moves to the next whole number up or down (5.33 goes to 6 or 5; 4 goes to 5 or 3), all amounts rescale, the page's "Serves N" line follows, and "Fewer servings" is disabled at 1 serving.
Cites: `frontend/src/pages/RecipeDetailPage.test.tsx` "rescales every amount with the servings stepper"

### UNIT-29 A recipe without a servings count uses a batch multiplier
**Given** a recipe with no servings count **When** the owner presses "Bigger batch" or "Smaller batch" **Then** the label shows "×1.5", "×2" and so on, stepping by 0.5, with "Smaller batch" disabled when it would reach zero; "2 eggs" at ×1.5 shows "3 eggs".
Cites: `frontend/src/pages/RecipeDetailPage.test.tsx` "uses a batch multiplier when the recipe has no servings count"

### UNIT-30 Scaling is view-only and resettable
**Given** a scaled recipe **When** the owner presses "Reset" (shown only while scaled) **Then** it returns to the recipe's own amounts and servings. Scaling is never saved: leaving or reloading the page, or editing the recipe, shows the stored amounts. Using the stepper clears the highlight of the ingredient the scale was set from; "I have" highlights that ingredient.
Cites: `frontend/src/pages/RecipeDetailPage.test.tsx` "rescales every amount with the servings stepper" (reset to 4 servings), ADR 2026-09-25

### UNIT-31 Recipe pages show amounts and temperatures in the owner's preferences
**Given** a recipe stored as 150 g cottage cheese, 2 eggs, 1 cup milk and the step "Heat the oven to 350°F." **When** the owner views it with metric and °C **Then** it shows "150 g cottage cheese", "2 eggs", "236.59 ml milk" and "177°C"; with US and °F it shows "5.29 oz", "1 cup" and "350°F". "salt to taste" is unchanged. This applies to every recipe, including ones typed in by hand, and to the steps of every recipe; nothing is written back to the stored recipe.
Cites: `frontend/src/pages/RecipeDetailPage.test.tsx` "shows amounts in the user's units and converts oven temperatures", "shows US units when that's the preference", ADR 2026-09-25

### UNIT-32 Display preferences never block a recipe page
**Given** the preferences request is slow or fails **When** a recipe opens **Then** it shows immediately using the defaults (metric, °C, keep spoons, no language) and switches when the preferences arrive.
Cites: `frontend/src/hooks/useRecipePreferences.ts`

### UNIT-33 Recipe preferences default and are read per user
**Given** a user who never changed them **When** their recipe preferences are fetched **Then** they are: language none (keep the original), metric, °C, keep spoons on. An unauthenticated request gets 401. Each user's preferences are separate.
Cites: `backend/src/routes/settings.test.ts` "requires a session", "defaults to original language, metric, °C and keeping spoons", "keeps each user's preferences separate", `backend/migrations/1700000000015_recipe-preferences.js`

### UNIT-34 Recipe preferences update field by field and reject anything else
**Given** a signed-in user **When** they save any subset of language (nl, en or none), unit system (metric, us), temperature unit (C, F) and keep spoons (true or false) **Then** only the sent fields change and the full result is returned; sending a null language clears the language. Any other value or field ("fr", "imperial", "K", "yes", an unknown field) gets 400 and changes nothing.
Cites: `backend/src/routes/settings.test.ts` "updates only the fields sent", "rejects", ADR 2026-09-25

### UNIT-35 Imports are translated, converted and stored in the owner's preferences
**Given** an import **When** it finishes **Then** the saved recipe (and the review form) already holds amounts and oven temperatures converted into the owner's unit system and temperature unit with two-decimal amounts, and the original amounts are not kept. The order is extract, validate, translate, convert; conversion always runs last, is deterministic code (never the language model), and is the only step that changes amounts. With no unit preferences supplied, amounts are left as written. The language and units used are the ones the owner had selected when the import started.
Cites: `backend/src/services/recipeUnits.ts`, `backend/src/services/recipeExtraction.test.ts` "converts amounts and oven temperatures into the user's units", "leaves amounts as written with no unit preferences", `backend/src/routes/settings.ts`, ADR 2026-09-25

### UNIT-36 Conversion after translation understands Dutch unit words
**Given** a translated recipe with "3 tl" and "2 cups" **When** converted to metric with language Dutch **Then** "3 tl" becomes "1 el" and "2 cups" becomes "473.18 ml".
Cites: `backend/src/services/recipeExtraction.test.ts` "converts after translating, recognising Dutch unit words", ADR 2026-09-25

### UNIT-37 Translation may only change spoon units; anything else is restored
**Given** a structured-data import whose translation changed numbers or measures (cup to "kopje", oz to "ons", a made-up servings count) **When** translation returns **Then** every quantity, the servings, the times and any unit whose meaning changed are restored from the original, so the converted result is "473.18 ml", "226.8 g" and servings stay empty. Only tablespoon and teaspoon words may be translated (tbsp to "el", tsp to "tl"). Tags stay English and the source URL is restored.
Cites: `backend/src/services/recipeExtraction.test.ts` "undoes a translation that changed what a unit means", ADR 2026-09-25

### UNIT-38 Translation failure never fails the import
**Given** translation is wanted but the model is unavailable, over quota, unconfigured or returns invalid output **When** the import runs **Then** it succeeds with the original language, `import_jobs.translation_skipped` is set, and the review form says the recipe is still in its original language. Cancelling the import still cancels it.
Cites: `backend/src/services/recipeExtraction.test.ts` "keeps the original and flags it when translation fails", "flags a skipped translation when no translator is configured", `backend/migrations/1700000000015_recipe-preferences.js`, ADR 2026-09-25

### UNIT-39 A recipe's language is detected by counting very common words
**Given** a recipe's title, description, ingredient names and steps **When** its language is detected **Then** the result is Dutch or English only when at least 8 common function words of the winning language appear (for example "de", "het", "een", "voeg", "the", "and", "stir") and the winner has at least twice the runner-up's hits; otherwise the result is undecided (too short, or mixed).
Cites: `backend/src/services/recipeLanguage.test.ts` "recognises clearly Dutch and clearly English recipes", "is unsure about text that's too short or mixed"

### UNIT-40 Translation is skipped only when the recipe is clearly in the target language
**Given** a structured-data import and a target recipe language **When** the recipe is clearly in that language **Then** no translation call is made; clearly the other language, or undecided, **Then** translation is requested. With no target language (keep original) no translation is attempted. Recipes read by the language model are translated inside the same prompt at no extra call.
Cites: `backend/src/services/recipeLanguage.test.ts` "skips recipes already in the target language", "translates when unsure", `backend/src/services/recipeExtraction.test.ts` "makes no translation call when the recipe is already in the target language", "makes no translation call with no language set", ADR 2026-09-25

### UNIT-41 Ingredient lines are split into quantity, unit and name
**Given** an imported ingredient line **When** it is parsed **Then** it splits as: "1 tsp chili powder" to 1 / tsp / chili powder; "1 pound extra lean ground beef"; "2 cloves garlic (finely minced)" to 2 / cloves / garlic (finely minced); "500g beef mince" and "400ml crème fraîche" with the glued unit separated; "2-3 tsp olive oil" to quantity "2-3"; "1 1/2 cups flour"; "1/2 cup milk"; "½ tsp salt"; "2 x 400g cans chopped tomatoes" to "2 x 400" / g / cans chopped tomatoes; "2 tbsp. butter" (full stop dropped); "3 fl oz cream" (the two-word unit "fl oz"). Quantity forms recognised: multipack with x or ×, mixed numbers, a number followed by a Unicode fraction, ranges with a hyphen, en or em dash or "to", plain fractions, Unicode fractions, integers and decimals with a dot or comma. Units are the English and Dutch words of UNIT-06 and UNIT-07 with regular plurals, and the author's spelling and case are kept.
Cites: `backend/src/services/ingredientLine.test.ts` "splits %s", ADR 2026-08-11

### UNIT-42 Size words are not units
**Given** "2 medium sized sweet potatoes" or "1 small onion (small diced)" **When** parsed **Then** the unit is empty and the name keeps the size word ("medium sized sweet potatoes"): only listed measures and containers count as units.
Cites: `backend/src/services/ingredientLine.test.ts` "leaves size adjectives in the name rather than treating them as units", ADR 2026-08-11

### UNIT-43 Lines the parser is unsure about are kept whole
**Given** "salt and pepper to taste" (no leading quantity), "2 cups" or "12" (nothing left for a name) **When** parsed **Then** quantity and unit are empty and the whole line is the name. A wrong split is harder to notice than an unsplit line.
Cites: `backend/src/services/ingredientLine.test.ts` "leaves a line with no leading quantity untouched", "keeps the whole line when nothing would be left as a name", ADR 2026-08-11

### UNIT-44 Stray whitespace is collapsed when parsing
**Given** "  2   cloves   garlic  " **When** parsed **Then** it gives 2 / cloves / garlic.
Cites: `backend/src/services/ingredientLine.test.ts` "collapses stray whitespace"

### UNIT-45 Only unsplit imported ingredients are parsed
**Given** imported ingredients **When** they are normalised **Then** an ingredient with neither quantity nor unit has its name parsed ("1 kg tomatoes" gives 1 / kg / tomatoes); an ingredient that already has a quantity or a unit is left exactly as it is. This applies to both the structured-data and the language-model import paths. Ingredients typed by hand in the recipe form are never parsed.
Cites: `backend/src/services/ingredientLine.test.ts` "splits unparsed lines", "leaves already-split ingredients alone", ADR 2026-08-11

## Rationale
- **When things happen (UNIT-31, UNIT-35).** Two places convert, and they must stay distinct. (a) *On import*: the amounts and oven temperatures are translated (language only, units untouched except spoons), then converted into the owner's preferences, and the converted values are what the recipe stores. The original source amounts are not kept; this is lossy and was accepted in ADR 2026-09-25 (a recipe imported in metric and later viewed in US is converted twice, with two-decimal rounding baked in after the first pass). (b) *On every view*: the recipe page converts the stored amounts and the step text into the current preferences, derived from the stored recipe plus scale factor plus preferences, never saved. A recipe typed by hand is stored as typed and only converted on display. Recipe language does not translate stored recipes on display; on display it only chooses the label of a unit that conversion introduces (UNIT-19). IMP must describe the import side exactly as UNIT-35 to UNIT-38; SET must describe the four preference controls as UNIT-33 and UNIT-34.
- **Exact amounts (UNIT-05, UNIT-09).** The owner bakes; friendly rounding was explicitly rejected on 2026-09-25. Rounding occurs once, at display.
- **Auto-tidy (UNIT-12 to UNIT-14).** Without the "whole quarter up, below a quarter down" rules, exact decimals give "4 tsp to 1.33 tbsp" or "1/2 cup to 8 tbsp", both harder to read than what the author wrote.
- **Kopje is a count unit (UNIT-07).** A Dutch kopje is not a US cup; in Belgium an "ons" is 100 g. So translation is only allowed to touch spoon words (UNIT-37), and the structured-data path restores numbers as a backstop for a model that ignores the prompt.
- **Dutch words are first-class (UNIT-06).** Translation turns "tbsp" into "el" before conversion runs (UNIT-36), so the unit table must know Dutch.
- **Units list shared with the line parser (UNIT-41).** The parser and the converter agree on what a unit is, so Dutch lines split too. Size adjectives are excluded on purpose (ADR 2026-08-11).
- **Fail open (UNIT-38).** A recipe in the wrong language beats no recipe; the stopword check exists because tagging or translating every import with the model was rejected on quota grounds (ADR 2026-08-11 and 2026-09-25).
- **Preference values (UNIT-34).** The option lists are fixed in code and the data store rejects any other value for language, unit system and temperature unit, so the rewrite should keep an enum or equivalent check. Keep spoons is a plain boolean, default true.
- **Port directly (design §8).** `packages/units/src/units.test.ts` (number and quantity parsing, formatting, unit lookup, scaling, auto-tidy, unit systems, anchor factor, temperature), `backend/src/services/ingredientLine.test.ts` and `backend/src/services/recipeLanguage.test.ts` are pure logic and move to the new codebase nearly verbatim. The criteria above are the readable description; the test cases are the precise oracle. The new shared units module should export the same functions.
- **Quirk to know about.** The quantity evaluator accepts "tot" as a range word, but the line parser splits a range only with a hyphen, en or em dash, or "to", so "2 tot 3 el" is not split as a range today. See Open question 2.

## Tests not carried
- `packages/units/src/units.test.ts` "parseNumber" `it.each` rows are grouped into UNIT-01 and UNIT-02 rather than one criterion each; nothing is dropped.
- `backend/src/services/ingredientLine.test.ts` "splits %s" rows are grouped into UNIT-41; nothing is dropped.
- `frontend/src/pages/RecipeDetailPage.test.tsx`: the unit and scaling cases are carried (UNIT-24 to UNIT-31); this file has no other cases.

## Open questions for the owner
1. Keep the lossy convert-and-store on import? Recommendation: keep for parity. A more faithful alternative is to also keep the source line text so nothing is irreversibly lost; it adds a column and UI, so do it after cutover if wanted.
2. Make the line parser accept "tot" as a range word like the quantity evaluator already does ("2 tot 3 el")? Recommendation: yes, a one-word fix for Dutch recipes.
3. Should the recipe-language setting also translate stored recipes on display, not only imports? Recommendation: no, it would need a model call per view.
4. Should the scale factor be remembered per recipe? Recommendation: no, view-only with reset on reload was the agreed scope.

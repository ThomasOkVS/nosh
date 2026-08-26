# Design system

Nosh's visual language: colors, type, shape, motion, and component rules.
Listed in [index.md](index.md)'s Contents alongside the other normative docs
— consult it before any UI work, same as architecture.md or decisions.md. If
a UI change needs a pattern that isn't covered here, extend this doc first,
then build.

**Status:** approved by the project owner 2026-08-06; tokens implemented the
same day, then critically reviewed against the real running app and revised —
the token layer (color/type/radius/glass/dark mode) held up, but the recipe
list, detail, and form pages were still structurally an admin CRUD scaffold
underneath a coat of paint. The **Cards**, **Ingredient & step display**,
**Detail page layout**, **Forms**, and **Tags/chips** sections below were
rewritten as a result — see [decisions.md](decisions.md) for both entries.

**2026-08-26: aesthetic direction replaced — "Cookbook Editorial" supersedes
"Citrus Pop".** The project owner was unhappy with Citrus Pop's look
independent of the structural fixes above (both were true at once: the
layout stopped reading as CRUD, but the color/type/shape identity itself
wasn't wanted any more). Three directions were proposed (Cookbook Editorial,
Kitchen Ticket, Modern Bistro — see
[decisions.md](decisions.md#2026-08-26-design-direction-replaced-cookbook-editorial-supersedes-citrus-pop)
for all three and why Cookbook Editorial won). Every section below now
describes Cookbook Editorial; where a value or pattern changed, the old
Citrus Pop version is noted for context rather than kept as a live option.

**Migration status.** The token layer (color/type/radius/glass, all in
`frontend/src/index.css` + `styles.ts`) was swapped **globally** on
2026-08-26, so every page has always picked up the new palette/fonts/shape
automatically. Bespoke *structural* rework followed in two passes the same
day: first the **recipe list and recipe detail pages** (plus the shared
`RecipeCard`/`RecipeCardSkeleton` and `TagChip`'s new `editorial` variant —
which is also why `CollectionDetailPage`'s recipe grid got the treatment for
free, via reusing `RecipeCard`), then a same-day follow-up covering the
**header, auth screens, recipe form, and the rest of the collections
pages** (masthead page titles, `AuthLayout`'s gradient removed, the last two
pill-shaped nav controls squared off). See
[decisions.md](decisions.md#2026-08-26-cookbook-editorial-rolled-out-to-the-rest-of-the-app)
for the second pass's specifics. As of that entry, every page in the app
reflects both the token layer and this doc's structural patterns — this
note is kept for future readers who need to know *when* each part landed,
not to flag anything as currently incomplete. The one deliberately-deferred
item is the `citrus-*`/`teal-*` token *names* (still describing colors they
no longer are), tracked in [backlog.md](backlog.md) as a separate,
low-value refactor, not a visual gap.

## Brand direction

**2026-08-26: Cookbook Editorial.** Premium print-cookbook/food-magazine
energy — paper and ink, a serif display voice, restrained color used
deliberately rather than everywhere, hairline structure instead of soft/
glassy surfaces. Reference points:

- **Print cookbooks & food magazines** (the actual subject matter) —
  generous margins, a confident serif for titles, printed-label-style
  monospace for metadata (servings/time), numbered/indexed lists instead of
  browser bullets.
- **Apple** (carried over from Citrus Pop) — restraint, generous whitespace,
  nothing cluttered or cheap.
- **Kinfolk/Cherry Bombe-adjacent editorial design** — warm neutral paper
  tones, one confident accent color (not a rainbow of them), type doing the
  work color used to do.

The tension to hold: warm and inviting, not sterile or corporate, while
staying calm and hairline-precise rather than saturated/glassy/springy. If a
screen feels flat or lifeless, reach for the serif italic and the mono
label — not a gradient or a rounded pill.

**Superseded:** Citrus Pop's Apple/Arc/family.co references (glassy
translucent surfaces, saturated gradient, very-rounded pill shapes, springy
motion) — see [decisions.md](decisions.md#2026-08-06-design-system-defined-citrus-pop-glassyrounded-motion-forward)
for the original rationale and
[decisions.md](decisions.md#2026-08-26-design-direction-replaced-cookbook-editorial-supersedes-citrus-pop)
for why it was replaced.

## Color — "Cookbook Editorial"

Paper and ink neutrals carry most of the UI; a single deep "sauce red" is
the primary accent, a muted sage is secondary. Color is used sparingly and
deliberately — most of a screen should read as paper/ink/hairline, with the
accent reserved for actions, links, and a few signature moments (step
numerals, focus rings).

### Primary — "citrus" token family, now sauce red

Kept the `citrus-*` token *names* (renaming every call site app-wide was a
much larger, riskier change for no visual benefit — see decisions.md) but
the hue is now a deep brick/sauce red, not orange.

| Token | Hex | Use |
|---|---|---|
| `citrus-50` | `#FBEAE6` | tinted backgrounds (no-photo placeholder, step-numeral tint) |
| `citrus-100` | `#F3D2C9` | subtle badges/chips |
| `citrus-300` | `#D98071` | decorative, disabled-state accents |
| `citrus-500` | `#B23A2E` | **primary flat button fill**, primary text/icon accents |
| `citrus-600` | `#9A2F24` | primary button hover/active, editorial tag-chip hover |
| `citrus-700` | `#7A2419` | primary button pressed, high-contrast text-on-light use |

**No decorative gradient in this direction.** Citrus Pop's orange→pink hero
gradient is retired — Cookbook Editorial has no hero/gradient moment; paper,
ink, and a hairline rule carry that weight instead. (The login screen's
background gradient hasn't been touched yet — see Migration status above.)

### Secondary — "teal" token family, now sage

| Token | Hex | Use |
|---|---|---|
| `teal-50` | `#EEF1E7` | tinted backgrounds (default tag-chip fill) |
| `teal-300` | `#A3AE82` | decorative accents |
| `teal-500` | `#5F6B3E` | secondary buttons/links, active nav icon fill |
| `teal-700` | `#404A29` | secondary text-on-light, default tag-chip text |

### Semantic

| Token | Hex | Use |
|---|---|---|
| `success-500` | `#1E9E5A` | confirmations (e.g. "recipe saved") |
| `warning-500` | `#C98A12` | non-blocking warnings |
| `danger-500` | `#A61B4A` | destructive actions, delete confirmation, form errors |

**Deliberately a cooler raspberry/wine, not a brighter version of
citrus-500.** Under Citrus Pop, danger just had to differ from *orange* —
easy. Now that the primary accent is itself a red, "delete reads as a
darker brand color" is a real risk again; danger-500 is pulled toward pink/
magenta (hue ~340°) specifically to stay visually distinct from citrus-500's
brick-red (hue ~8°). Don't let these drift closer together for "cohesion."

### Neutrals — light mode (paper/ink, not warm-neutral-gray)

| Token | Hex | Use |
|---|---|---|
| `surface` | `#FFFFFF` | cards, elevated surfaces |
| `surface-page` | `#F6F1E7` | page background ("paper") |
| `surface-sunken` | `#EFE7D8` | subtle fills, disabled backgrounds, sunken rows |
| `border` | `#D3C4A8` | borders, hairline dividers |
| `ink-faint` | `#9C8F7A` | placeholder text, disabled text, mono metadata |
| `ink-muted` | `#6B5F4E` | secondary text |
| `ink` | `#231D16` | primary text |

### Neutrals — dark mode

Warm near-black ("coffee ink"), not the previous cool charcoal — same
reasoning as before (pure black reads OLED-harsh and gives elevated surfaces
nothing to separate from), just shifted warmer to match the paper/ink theme.

| Token | Hex | Use |
|---|---|---|
| `surface-page` (dark) | `#1C1814` | page background |
| `surface` (dark) | `#26211B` | opaque surface |
| `surface-sunken` (dark) | `#2E2820` | sunken rows/fills |
| `border` (dark) | `rgba(255,255,255,0.14)` | borders on dark surfaces (unchanged) |
| `ink` (dark) | `#F3EEE4` | primary text |
| `ink-muted` (dark) | `#B8AD9B` | secondary text |
| `ink-faint` (dark) | `#7D7462` | placeholder/faint text |

Citrus/teal/semantic accent tokens stay the same hue in dark mode; verify
contrast per component rather than assuming, same as before.

### Accessibility floor

Every text/background pairing must hit **WCAG AA (4.5:1 for body text, 3:1
for large/display text)** — including text sitting on glass panels. This
floor didn't change with the color palette; recheck real contrast numbers
whenever a token's hex value changes, don't assume a new color inherits the
old one's pass/fail.

## Typography

**2026-08-26: Fraunces replaces Plus Jakarta Sans.** A serif display face
with a genuine italic (used for pull-quote-style recipe descriptions and the
step-1 drop cap), not a rounded geometric sans — the clearest single signal
of the shift away from Citrus Pop's "friendly app" voice toward a
"printed cookbook" one.

**Display:** Fraunces (600/700/800/900 upright, 500/600 italic) — page
titles, recipe titles, section headers, the "Nosh" wordmark, empty-state
headlines, and (new) italic pull-quote description text and step numerals.

**Body/UI:** Inter (400/500/600) — unchanged. Still body copy, form labels/
inputs, buttons, nav, all running text.

**Utility/metadata:** IBM Plex Mono (400/500), new. Printed-label-style text
— servings/prep/cook, tag captions in the editorial `TagChip` variant. Set
uppercase with wide tracking; this is what replaced the old teal/citrus pill
chips' color-coding as "this is metadata, not prose."

All three loaded via Google Fonts CDN (`font-display: swap`) — same
CDN-dependency trade-off as before, still accepted for the same reason.

### Scale

| Token | Size/Line-height | Weight | Use |
|---|---|---|---|
| `display-xl` | 40/48px | 800 | Hero/marketing headline (login screen) |
| `display-lg` | 32/40px | 700 | Page titles (recipe title, "Your recipes") |
| `display-md` | 24/32px | 700 | Section headers, card titles |
| `body-lg` | 18/28px | 400 | Lead paragraphs, recipe descriptions |
| `body-md` | 16/24px | 400 | Default body/UI text |
| `body-sm` | 14/20px | 400/500 | Metadata, captions, chip labels |
| `caption` | 12/16px | 500 | Timestamps, helper text |

Never use the display font below `display-md` for **UI chrome** (section
headers, buttons) — it loses legibility there. **Exception, added
2026-08-26:** an italic serif "lede" — the recipe description under the
title, styled at `body-lg` (18px) — is a deliberate editorial device, not
UI chrome using the display font too small by mistake; Fraunces' italic
stays legible at that size in a way the old geometric sans wouldn't have.
Don't extend this exception past that one lede use without checking real
legibility first.

## Shape language

**2026-08-26: sharp/hairline replaces very-rounded.** The single biggest
non-color signal of the direction change — Cookbook Editorial reads as
printed card stock with hairline rules, not soft rounded plastic.

| Token | Radius | Use |
|---|---|---|
| `radius-sm` | 4px | inputs, small icon buttons |
| `radius-md` | 6px | buttons, small cards, dropdowns |
| `radius-lg` | 8px | recipe cards, panels, modals |
| `radius-xl` | 12px | full-screen sheets, hero panels |
| `radius-full` | 999px | avatars, pill badges, tag chips (default variant only — the editorial `TagChip` variant isn't a pill, see Tags/chips) |

Primary CTA buttons are `radius-md` now, not `radius-full` — Citrus Pop's
pill-shaped buttons were a pointed identity marker of the old direction and
don't fit hairline/sharp shape language. `radius-full` survives only where a
genuinely circular shape is the point (avatars, icon buttons, the default
tag-chip pill still used outside the recipe list/detail pages).

## Elevation & surfaces — glass

Glassy/translucent panels are a deliberate, load-bearing part of the identity
(the Arc/family.co influence), used for: the app header, modals/sheets, the
recipe detail "info panel" floating over a hero photo, and toast
notifications. **Not** for every card — a page where everything is glass has
nothing for glass to sit on top of. Default cards (recipe list cards, form
sections) use flat surfaces; reserve glass for panels that intentionally
float over other content (usually a photo or a colored/gradient background).

**2026-08-26: glass/blur dropped app-wide.** Cookbook Editorial has no
translucent surfaces — `.glass`/`.glass-menu` keep their **names** and call
sites (header, `ConfirmDialog`, `ImportDialog`, `UserMenu`, toasts,
`RecipeCollectionsEditor`'s popover) unchanged, but now render as an opaque
card-stock surface with a hairline border, no `backdrop-filter`. This is a
token/utility-level change only — none of those component files needed
editing. See [decisions.md](decisions.md#2026-08-26-design-direction-replaced-cookbook-editorial-supersedes-citrus-pop).

### `.glass`

```
background: var(--color-surface);
border: 1px solid var(--color-border);
box-shadow: 0 1px 2px rgba(35, 25, 15, 0.04), 0 8px 24px rgba(35, 25, 15, 0.08);
```

Dark mode redefines only the shadow (surface/border already flip via the
semantic tokens).

### `.glass-menu`

Same treatment, a touch more shadow since an anchored menu has no dimmed
backdrop of its own to separate it from the page behind:

```
background: var(--color-surface);
border: 1px solid var(--color-border);
box-shadow: 0 2px 4px rgba(35, 25, 15, 0.06), 0 12px 28px rgba(35, 25, 15, 0.14);
```

**Superseded — no `@supports`/blur fallback needed any more.** There's no
blur to fall back from, so the old backdrop-filter feature-detection block
is gone from `index.css`.

### Photo-overlay panels — retired

**Added 2026-08-06, retired 2026-08-26.** The recipe detail hero used to
float a `.glass-photo` info panel (title/meta/tags/actions) over the bottom
of the photo, with a fixed dark tint independent of theme. Cookbook
Editorial's detail page layout (see Detail page layout below) puts that
content **below** the photo instead, in normal flow — so `.glass-photo` and
its fixed-dark-tint-regardless-of-theme rationale no longer apply anywhere,
and the utility was deleted from `index.css` rather than left unused. The
"Edit/Delete live in the same flex row as the title" fix below is **kept**,
even though its original motivation (independently-absolutely-positioned
buttons colliding with a tall panel *floating over an image*) no longer
applies once nothing floats over the image — it's still good practice for
robustness against a long title, just via normal flow instead of absolute
positioning now.

If a future photo-heavy surface ever wants an overlay-on-photo treatment
again, it needs a new utility designed for Cookbook Editorial's flat/hairline
language (a scrim + opaque label, not a re-add of `.glass-photo`'s blur) —
don't resurrect the deleted class as-is.

### Confirmation dialogs

**Added 2026-08-06.** Replaced the native `window.confirm()` for destructive
actions (flagged directly as an unstyled OS dialog breaking the whole visual
language the instant it appeared) with `ConfirmDialog`: a centered `.glass`
panel (`radius-lg`), `motion-panel` timing (fade + slight scale/translate,
no spring overshoot — this is a routine confirmation, not a delight moment),
icon (`WarningIcon`, `danger-50`/`danger-500` circle) + heading + message +
a ghost Cancel / filled-destructive Delete pair. This is the buttons spec's
"actual confirming action inside a confirmation step" — the one place the
filled `danger-500` button belongs (see Buttons above). Unaffected by the
2026-08-26 glass change beyond the panel itself going opaque — no code
changes were needed here.

**The backdrop must actively neutralize whatever is behind it**, not just
dim it a little — `bg-black/60` **plus `backdrop-blur-sm`**, not `bg-black/50`
alone. A first pass used just a 50%-opacity backdrop with no blur; over the
recipe detail page's photo-heavy background the sharp image behind stayed
visually competitive with the dialog, and the panel lost definition — it
read as "melted into" the photo rather than floating above it. Blurring +
darkening the backdrop enough is what makes the dialog panel work reliably,
*regardless of what page it's opened on* — fix it at the backdrop, not by
hand-tuning the panel per page. (This backdrop blur is on the native
`<dialog>::backdrop`, a separate mechanism from `.glass`'s own now-removed
blur — it still applies.)

Accessibility: `role="alertdialog"`, `aria-modal`, Escape to cancel, click
on backdrop to cancel, focus starts on Cancel (not the destructive action —
never default-focus a destructive confirm).

### Toasts

**Added 2026-08-08.** Replaced `window.alert()` for error messages (image
upload/delete failure, recipe delete failure — see
[backlog.md](backlog.md)) with an app-wide `ToastProvider`/`useToast()`. Unlike
`ConfirmDialog`, a toast is informational, not blocking: no backdrop, no
focus trap, auto-dismisses after 6s with a manual close button for the case
where the message is still relevant. Rendered as a `.glass` panel (per the
Elevation section's toast use case), fixed bottom-center, inset from
`env(safe-area-inset-bottom)`. Entrance uses `motion-panel` timing (fade +
slight rise), not `motion-spring` — an error isn't a delight moment (see
Motion above). `role="alert"` per toast, no wrapping `aria-live` region
(each alert already announces on its own). Currently error-only (`danger-500`
icon); if a future success-confirmation toast is added, extend the same
provider rather than building a second mechanism.

### Non-glass elevation

Regular cards use a soft shadow, not glass:

```
box-shadow: 0 1px 2px rgba(35, 32, 28, 0.04), 0 4px 12px rgba(35, 32, 28, 0.06);
```

with a hover state that lifts slightly (`translateY(-2px)` + a marginally
stronger shadow), eased with the spring curve below.

## Iconography

**Phosphor Icons** — chosen specifically because it ships matched
outline/filled weights for the same glyph set, which is exactly the "mixed"
system this app wants:

- Default state: **regular** (outline) weight.
- Active/selected/emphasis state (active nav item, a toggled filter, a
  "favorited" heart): **fill** weight, typically in `citrus-500` or
  `teal-500`.

Standard sizes: 20px inline with body text, 24px for nav/toolbar icons. Icons
inherit `currentColor` — never hardcode an icon color separately from the
text/button color it's paired with.

## Motion

Rich, springy, physical — motion is a first-class part of the brand, not an
afterthought layered on at the end.

### Tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-micro` | 120ms | `ease-out` | button press, checkbox/toggle flip |
| `motion-standard` | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | hover states, dropdown open |
| `motion-panel` | 320ms | `cubic-bezier(0.16, 1, 0.3, 1)` | modal/sheet open, page transitions |
| `motion-spring` | 400ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | success confirmations, "added" pop, empty-state entrance |

`motion-spring`'s overshoot is the "alive" feeling — use it for moments that
deserve delight (recipe saved, image uploaded), not for routine chrome
(don't spring every hover).

### Reduced motion — explicit trade-off

**Decision:** animations run at full richness regardless of the OS-level
`prefers-reduced-motion` setting. This is a deliberate call from the project
owner, made knowingly against the usual accessibility default (which is to
strip non-essential motion for users who've asked their OS to reduce it,
since motion can trigger vestibular discomfort for some people).

**Guardrail to keep this safe:** motion must stay strictly decorative.
Nothing that conveys required information, or that blocks/delays a user
from completing an action, may depend on an animation finishing — a
disoriented or motion-sensitive user must still be able to use every screen,
they just won't get the polish. If a future component's *function* starts
depending on an animation (e.g. content only appearing after a spring
settles), that's a bug against this rule, not a style nitpick.

## Components

### Buttons

- **Primary:** flat `citrus-500` fill, white text, `radius-md` (**not
  `radius-full`** as of 2026-08-26 — pill CTAs were a Citrus Pop identity
  marker that doesn't fit hairline/sharp shape language), hover `citrus-600`,
  pressed `citrus-700` + `scale(0.98)` via `motion-micro`. No gradient — this
  direction doesn't have one (see Color).
- **Secondary:** `teal-500` text/border on transparent or `neutral-0`
  fill, `radius-md`.
- **Destructive:** icon-only or ghost by default (text `danger-500`, no
  fill), *not* a bold filled pill placed as a co-equal peer next to a
  primary/edit action — a filled-red button sitting beside an outlined
  "Edit" button at the same visual weight is the classic "admin record
  toolbar" pairing (flagged directly in the 2026-08-06 review, on the recipe
  detail page's Edit/Delete pair). Reserve the filled `danger-500` treatment
  for the actual confirming action inside a confirmation step, not the
  button that opens it. Always paired with a confirmation step for actual
  deletes.
- **Ghost/tertiary:** text-only, `neutral-600`, used for low-emphasis actions
  (e.g. "Cancel" next to a primary "Save", or "Delete" before confirmation).

### Inputs

`radius-sm`, `neutral-200` border (light) / `dark-border` (dark),
`neutral-0`/`dark-surface` fill, generous padding (`py-2.5 px-4`) for
comfortable touch targets. Focus state: 2px `citrus-500` ring with a small
offset — must stay clearly visible against both flat and glass surroundings;
don't let the rounded/soft aesthetic soften the focus ring itself.

**Ring offset is transparent, not an opaque surface color.** `ring-offset-*`
paints a solid color in the small gap between an input's border and its
focus ring; an opaque value (the original `ring-offset-surface`) assumes the
input always sits on `--color-surface`, which breaks on a `.glass` panel
(the login card) — the offset paints a flat patch over the translucent
glass instead of blending with it. `ring-offset-transparent` lets whatever's
actually behind the input show through, correct on flat and glass surfaces
alike without a per-context override.

**Border must actually be visible.** A design review caught the original
border tokens (`#E8E2DC` light / `rgba(255,255,255,0.08)` dark) reading as
essentially invisible against their own fill color — inputs looked like
floating cutouts, not designed fields, especially sitting on the glass auth
card. The neutral-200/dark-border values above are the corrected, more
visible versions; don't quietly soften them back down for "subtlety."

**Every text/number input carries an example placeholder** (e.g. Title →
"Grandma’s Sunday Ragù", not empty) — an empty form reads as a raw scaffold;
a form full of plausible examples reads as guided. Placeholder and other
user-facing copy uses curly apostrophes/quotes (’‘”“) and an ellipsis
character (…) rather than the ASCII `'`/`"`/`...` — written as the literal
Unicode character in JSX text content, or the `&rsquo;`-style entity where a
literal character would be awkward to read in the source (e.g. next to other
punctuation), as `ImportDialog` already does for "We&rsquo;ll".

### Cards (recipe cards) — photo-forward grid, not a list row

**Superseded 2026-08-06.** The original spec (small square thumbnail on the
left, text on the right, one per row) was implemented faithfully and then
flagged in review as the single biggest reason the app still read as a CRUD
tool: a fixed-size thumbnail next to metadata, repeated identically down the
page, *is* a record-list row, no matter what colors or radii it uses. The
fix is structural, not cosmetic:

- **Layout:** a responsive grid, not a vertical list — 1 column on mobile,
  2 columns from `sm:`, 3 from `lg:`.
- **Each card leads with the photo**, full card-width, `aspect-[4/3]`,
  `radius-lg` on the card with the image's top corners matching (the image
  sits flush at the top of the card, not inset with padding around it).
  Title, then the meta line, then tags, all below the photo, with normal
  card padding.
  Still a **contained image** (not full-bleed off the card edge) for the
  same reason as before — photo quality/aspect ratio will vary a lot in a
  personal self-hosted collection, and a contained frame stays tidy
  regardless.
- Flat surface (not glass — see Elevation), `radius-lg`, hover lift as
  before.
- Recipes with no photo get the citrus-tinted icon placeholder (see
  Photography) filling the same `aspect-[4/3]` slot, so the grid rhythm
  never breaks depending on which recipes have photos.
- **Added 2026-08-26, Cookbook Editorial:** title set in italic Fraunces,
  a hairline rule (`border-border`) directly under it, then a mono
  uppercase/tracked meta line (`Serves 4  ·  Prep 15  ·  Cook 90`, not the
  old prose "4 servings · 15 min prep") — the printed-recipe-card layer that
  replaced color/pill-coded metadata. Tags use the `editorial` `TagChip`
  variant below the meta line (see Tags/chips).

### Tags/chips

**Two variants as of 2026-08-26** (`TagChip`'s `variant` prop):

- **`default`** (unchanged pill) — `radius-full`, `teal-50`/`citrus-50`-family
  tinted background with matching darker text, used everywhere outside the
  recipe list/detail pages (`RecipeCollectionsEditor`, forms, etc. — see
  Migration status at the top of this doc).
- **`editorial`** (new) — the recipe list/detail pages' own treatment: no
  pill/background at all, a small-caps `font-mono` label with a hairline
  underline (`border-b border-border`), `citrus-500` on hover. Grounded in
  printed-label/index-card material rather than a UI-chip convention — see
  Brand direction.
- **`overlay` — removed.** Existed only for the detail hero's now-retired
  photo-overlay panel (see Elevation — Photo-overlay panels); deleted along
  with it rather than kept as an unused variant. A future photo-overlay
  surface should design its own treatment for Cookbook Editorial rather than
  resurrect this one (see that section for why).

**Always render capitalized** (`capitalize` for `default`;
`editorial` uses `uppercase` instead, to the same end), regardless of how the
tag was typed/stored — raw lowercase chip text (`belgian`, `dessert`) reads
as an unprocessed database value, not authored content. This is a display
rule only; store/match tags as typed.

### Ingredient & step display

**Superseded 2026-08-26** (recipe detail page only — see Migration status).
The 2026-08-06 checklist/carded-step treatment below was itself a fix for
raw `<ul>`/`<ol>` bullets reading as an unstyled DB dump; Cookbook Editorial
replaces *that* pattern with an "index" list, grounded in a printed
recipe card rather than a generic checklist UI:

- **Ingredients:** a plain list with hairline row dividers
  (`divide-y`/`border-y border-border`), each row prefixed with a
  `font-mono` two-digit index (`01`, `02`, …) instead of a bullet dot or
  checkbox — no card background per row.
- **Steps:** a large italic Fraunces numeral (`text-3xl`, `citrus-500/50`,
  `aria-hidden` since the `<ol>` already conveys order) replaces the old
  circular number badge, sitting to the left of the instruction text with
  no card background. **The first step's first letter is a drop cap**
  (`first-letter:` variant, `text-4xl` italic Fraunces, floated) — the one
  deliberate "signature" flourish this direction was picked for; don't add
  a second one elsewhere on the page without a good reason, the point is
  restraint everywhere except one place (see Brand direction).

**Original 2026-08-06 version (superseded, for context):** each ingredient a
`bg-surface-sunken` row with a `teal-500` bullet dot; each step its own
`bg-surface-sunken` card with a circular `citrus-50`/`citrus-600` number
badge. That version is still the right model if this pattern is ever needed
somewhere *outside* the Cookbook Editorial pages.

### Detail page layout — photo leads, not metadata

**Added 2026-08-06, revised same day, restructured 2026-08-26.** The
original detail page ran title → description → stats → tags → *then* a
small photo — which reads as "record with an attached image field." The
photo is the whole point of a recipe; it goes first.

**2026-08-26 (current):** the overlay-on-photo approach below was retired
(see Elevation — Photo-overlay panels) in favor of a simpler structure that
applies identically whether or not a photo exists:

1. Back link (unchanged, above the photo).
2. **Hero photo** if one exists (`aspect-[16/9]`, `radius-lg`, hairline
   border) — or the citrus-tinted icon placeholder in the same slot if not.
3. Below it, in normal flow, a masthead block: title (italic Fraunces) and
   Edit/Delete icon buttons in **one flex row** (`justify-between`, title
   left, buttons right — kept from the overlay era for the same
   long-title robustness, see Elevation), then the description as an italic
   "lede" (see Typography's `body-lg` exception), the mono meta line, and
   `editorial`-variant tags — all under a hairline rule closing the block.
4. Ingredients, then Steps, per the index-list/serif-numeral treatment
   above.

**Superseded (2026-08-06 overlay version, for context):** with a photo,
title/meta/tags/actions floated in a `.glass-photo` panel over the bottom of
the hero image in fixed white text; without one, they sat below a flat
placeholder block in normal theme-following text. Two different layouts for
the same content depending on photo presence added real complexity for a
benefit (the photo/text overlap) this direction doesn't need — one layout
for both cases is simpler and still photo-forward.

### Navigation / header

Glass panel (see Elevation — now opaque, not blurred), sticky. Wordmark
"Nosh" set in `display-md`/Fraunces 800, `citrus-500` (now sauce red, was
orange) — text-only, no icon mark. Active route indicator uses a filled
Phosphor icon in `citrus-500`/`teal-500` per the mixed-icon rule above.

### Anchored menus / popovers {#anchored-menus--popovers}

**Added 2026-08-19.** `UserMenu` (`frontend/src/components/UserMenu.tsx`)
replaced the header's bare username/theme-toggle/logout row with a single
click target (username + `CaretDownIcon`) that opens a small anchored
dropdown: theme toggle and log out as menu items, the running build's short
git commit hash in a muted footer below a divider (see
[decisions.md](decisions.md) for why a commit hash rather than a semver
number). `animate-dialog-in` timing (no spring overshoot — a utility menu,
not a delight moment), closes on outside click or Escape,
`role="menu"`/`role="menuitem"`, 44px-min-height items per the mobile-first
touch-target floor.

**Needed its own glass variant, `.glass-menu`, not the standard `.glass`.**
Standard `.glass`'s translucency (55–65% background) is tuned for panels that
either sit over the app's own fairly uniform surface (the sticky header) or
have their own dimmed/blurred backdrop behind them (`ConfirmDialog`/
`ImportDialog`'s `<dialog>::backdrop`). An anchored dropdown has neither — it
opens directly over whatever's on the page below the header, which can be a
photo-heavy recipe grid — so standard `.glass` read as too see-through to
stay legible there (flagged directly: "the popup background is too
transparent"). `.glass-menu` (`frontend/src/index.css`) keeps the same blur/
border/shadow treatment but raises the background to 92–94% opacity in both
themes. Reuse it for any future small anchored menu/popover that floats over
ordinary page content rather than its own backdrop; keep using plain `.glass`
for the header itself and for backdrop-modal dialogs.

### Empty states

Custom illustration (e.g. "no recipes yet", "no search results") — simple,
friendly, warm-colored, sitting above a `display-md` headline and `body-md`
supporting copy, with a primary button CTA where relevant ("Add your first
recipe").

**Added 2026-08-08:** `EmptyRecipesIllustration` and `EmptySearchIllustration`
(`frontend/src/components/EmptyStateIllustration.tsx`), replacing the
icon-only interim fallback. Both are built from the app's own recipe-card
shape (photo block + title/meta bars, tilted, per Cards above) rather than
unrelated stock/clip-art — "no recipes yet" shows a ghost card with a
`citrus-500` "+" badge (add your first one); "no search results" shows two
ghost cards under a `teal-500` magnifying glass with an "x" (searched,
nothing matched). Colors are Tailwind `fill-*`/`stroke-*` utility classes
(not raw hex), so both track light/dark automatically like everything else
— confirmed against real computed styles in both themes, not just visually
assumed.

### Photography

Always **contained rounded images**, never full-bleed — see Cards above for
the reasoning. Standard aspect ratio 4:3 for list thumbnails, 16:9 for the
recipe detail hero. Missing-photo placeholder: a `citrus-50`/`dark-surface`
tinted block with a centered Phosphor "image" icon, not a broken-image icon
or blank white box.

### Forms — grouped sections, not a flat wall of fields

**Added 2026-08-06.** A form that's just N labeled boxes stacked top to
bottom, with no grouping beyond a bare `<h2>`, reads as a generated CRUD
scaffold no matter how each individual input is styled — confirmed directly
on the recipe form in review. Each logical group (Basics, Ingredients,
Steps, Tags, Photos) is its own section wrapped in a `bg-surface-sunken`
`radius-lg` padded container, with its heading paired with a small Phosphor
icon (e.g. `ListChecks` for Ingredients, `Notepad` for Steps, `Camera` for
Photos) — breaking the page into visibly distinct chunks instead of one
continuous scroll of identical-looking fields. Combined with the
placeholder-example rule under Inputs above, the goal is that a blank new
recipe form feels like a guided sequence, not a raw table-insert form.

**Added 2026-08-26, from a Web Interface Guidelines review.** Two rules that
apply across every form in the app, not just the recipe form above:

- **Every `<input>`/`<textarea>` carries a `name` (and a real `autocomplete`
  token where one applies — `username`/`current-password`/`new-password`/
  `email` for auth, `url` for the import dialog).** For a field that's
  genuinely app-specific data with no meaningful autofill (a recipe's
  ingredient rows, a tag draft, a collection name), `name` is still present
  for correctness, paired with `autoComplete="off"` rather than a guessed-at
  token that would produce wrong suggestions. A dynamically-repeated row
  (ingredients, steps) gets a `name`/`id` scoped to that row's own stable id
  (`ingredient-quantity-${row.id}`), not the array index, so it stays correct
  across reordering.
- **Every field has a real `<label>`, even where the visual design has no
  room for one.** A placeholder (Qty/Unit/Ingredient on each ingredient row,
  a bare rename input replacing a page's `<h1>`) is not a substitute — it
  disappears on input and isn't announced as a label by assistive tech. Where
  the visual design genuinely doesn't have space for a persistent label (the
  ingredient/step rows, the inline collection-rename field), use a `sr-only`
  `<label>` tied via `htmlFor`/`id` instead of skipping the label — same
  pattern already used for `TagInput`'s label on the recipe form.
- **Errors — focus follows the error.** A submit error's inline banner
  (`errorBannerClass`, `role="alert"`) is also `tabIndex={-1}` and receives
  focus the moment it's set (`AuthLayout` does this once for both auth forms;
  `RecipeFormPage`'s save-error banner does it locally) — a screen reader or
  keyboard user stays on the field they were on otherwise, with no signal a
  submit even happened. This is decorative-adjacent but not covered by the
  Motion section's reduced-motion exemption: it's assistive-tech focus
  movement, not an animation, and always happens regardless of motion
  preference.

### File upload — a dropzone, not a bare `<input type="file">`

**Added 2026-08-06.** A raw `<input type="file">` renders as whatever the
OS/browser defaults to (a plain "Choose File" button + filename, or nothing
styleable at all) — it doesn't look clickable in this app's visual language
because it isn't rendered by this app's visual language. Fix, using the
standard accessible pattern (a `<label>` wrapping a `sr-only` — not
`display:none` — `<input>`, so it's still keyboard-focusable and the native
picker still opens on Enter/Space):

- The **label itself is the visible control**: `radius-lg`, `border-dashed`
  `border-border`, centered icon (`UploadSimpleIcon`, `citrus-500`) + "Click
  to add a photo, or drag one here" + a small filetypes hint, generous
  padding (`py-8`) so it reads as a drop target, not a button.
- **Hover:** border shifts to `citrus-500`, subtle `citrus-50` tint.
- **Drag-over:** same treatment as hover, held for the duration of the drag
  (needs `onDragOver`/`onDragLeave` state, not just CSS `:hover`).
- **Uploading:** label shows "Uploading…" and dims (`opacity-60`,
  `cursor-not-allowed`); the underlying input is `disabled` too.
- Supports both click-to-browse and drag-and-drop dropping a file directly
  onto the zone — both call the same upload function, so behavior can't
  drift between the two entry points.

### Loading states — never a bare "Loading…"

**Rule, added 2026-08-06: no screen in this app may ever show a bare
"Loading…" string, anywhere, full stop.** Not just the recipe list search
case below — every async view (recipe detail, the edit form fetching the
existing recipe, the auth bootstrap check) gets a loading treatment that
matches *its own* content shape, not a placeholder sentence. If a new screen
adds an async fetch, it needs its own skeleton/spinner treatment before it
ships, not a stopgap `<p>Loading…</p>` "for now."

This was first flagged on the recipe list (a plain "Loading…" flashing in
and out on every debounced search keystroke), then found to be the same
underlying gap on the recipe detail page, the edit form's initial fetch, and
`RequireAuth`'s session-check screen (which was also still on the
pre-restyle `slate` palette — doubly stale). Three distinct treatments,
picked per situation, not one universal spinner:

- **Initial load of a page with a known shape** (recipe list, recipe
  detail, the edit form): a **skeleton** matching that real content's
  layout — `RecipeCardSkeleton` mirrors `RecipeCard` (image block, title
  bar, meta bar, tag pills) in the same grid; `RecipeDetailSkeleton` mirrors
  the detail page (real back link + hero-photo-shaped block + title/meta
  bars); `RecipeFormSkeleton` mirrors the form's Basics/Ingredients section
  shape. All built from one shared `Skeleton` primitive
  (`animate-pulse` over `bg-surface-sunken`) so every skeleton stays
  visually consistent without duplicating the pulse styling per page. Never
  a spinner or text for this case — a skeleton sets up the layout the real
  content will snap into, which a spinner can't.
- **Refetch with existing data already on screen** (typing a new search
  query while results are already showing): **keep the current results
  visible** and show a small inline spinner (`CircleNotchIcon` +
  `animate-spin`) next to the search input instead of replacing the list.
  Blanking a populated list on every keystroke is jarring and throws away
  information the user can still act on. This relies on the data-fetching
  hook keeping its previous `data` around while a new request is in flight
  (see `useAsync`) — don't reset `data` to `null` at the start of a refetch.
- **No content shape exists yet** (the auth bootstrap check, before any
  route has even been decided — could resolve to the login screen or the
  whole app shell): there's nothing sensible to skeleton. A small centered
  branded spinner (`CircleNotchIcon`, `citrus-500`, `role="status"`) on the
  theme-aware page background is the right weight for what's normally a
  near-instant check — heavier than that would be over-designing a state
  that's rarely visible for more than a flash.

## Responsive strategy — mobile-first

**Primary target: iPhone 15 Pro** (393×852 logical px, Safari/PWA). Tablet
and desktop are real, supported targets too, but every component is designed
mobile-first — base (unmodified) Tailwind classes are the phone layout;
`sm:`/`md:`/`lg:` breakpoints layer on *enhancements* for more screen space,
never the reverse. Concretely: build and check the phone layout before
reaching for a breakpoint prefix, not after.

What this changes in practice:

- **Touch targets:** every interactive element (buttons, icon buttons, nav
  items) has a minimum 44×44px hit area on mobile — Apple's own HIG minimum —
  even where the visible glyph is smaller. Use padding to hit this, don't
  shrink the icon to fill a smaller box. **Documented exception:** dense
  inline controls in a wrapping row (a tag chip's remove `×`) keep their
  compact visible size — ballooning every chip to 44px would break the chip
  pattern itself — but still extend the *tappable* area beyond the visible
  glyph via invisible hit-slop padding (e.g. an absolutely-positioned
  pseudo-element), getting as close to 44px as the layout allows without
  growing visually.
- **Safe areas:** the app is installed as a PWA and used full-screen on an
  iPhone with a notch and home indicator. The sticky glass header and any
  bottom-anchored bar must pad for `env(safe-area-inset-top)` /
  `env(safe-area-inset-bottom)`, not just a fixed pixel value.
- **Single-column by default:** forms, recipe lists, and detail pages stack
  in one column on mobile (full-width fields and buttons). Multi-column
  layouts (the recipe form's 2-column grid, wider max-widths, side-by-side
  detail panels) are `sm:`/`md:`-and-up enhancements, not the baseline.
- **Container width still caps out** at `max-w-5xl` on large screens (see
  Layout & spacing below) so desktop doesn't stretch into overly long line
  lengths — mobile-first doesn't mean unbounded-width on desktop.

## Layout & spacing

"Balanced" density — comfortable, not maximally airy, not cramped. Base unit
4px; use the scale 4/8/12/16/24/32/48/64px, no arbitrary in-between values.
Page container: `max-w-5xl` (up from the current `max-w-4xl`) with
`px-4 py-6` on mobile, growing to `px-6 py-8` from `sm:` up — giving
contained images a bit more room on larger screens without ballooning into
"spacious/premium-at-the-cost-of-density" territory.

## Implementation notes (for whoever builds this)

- Tailwind v4 is CSS-first — define these tokens in an `@theme` block in
  `frontend/src/index.css` (colors, radii, font families, the `max-w-5xl`
  container width) rather than a `tailwind.config.js`, consistent with the
  existing v4 setup ([decisions.md](decisions.md#project-setup-tooling-choices)).
- Light/dark mode: use Tailwind's `dark:` variant in class-based mode (a
  `dark` class toggled on `<html>`, persisted to `localStorage`, defaulting
  to the OS `prefers-color-scheme`) rather than the media-query-only
  strategy, so a future manual theme toggle is just a class flip.
- Prefer semantic CSS variables (`--color-surface`, `--color-text-primary`,
  `--color-border`) that get redefined per mode, over sprinkling
  `dark:bg-...` on every element — keeps components mode-agnostic.
- A shared `.glass` utility belongs in `index.css` once, rather than
  repeated inline per component. (No `@supports`/blur fallback needed as of
  2026-08-26 — see Elevation.)
- Phosphor Icons and Inter are dependencies from the original 2026-08-06
  pass; Fraunces and IBM Plex Mono (2026-08-26, replacing Plus Jakarta Sans)
  are the same kind of small, doc-justified addition, consistent with the
  "don't introduce unnecessary dependencies" rule in
  [../CLAUDE.md](../CLAUDE.md).

## Open items

- Exact dark-mode accent-token lightness adjustments (e.g. `citrus-400` vs
  `citrus-500` on `dark-bg`) should be verified against real contrast
  numbers during implementation, not assumed from this doc alone. Still
  open after the 2026-08-26 color swap — the new hex values were sanity-
  checked by calculation and a live look at both themes, not measured with
  a contrast-checking tool.
- The raster PWA icon set (`icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`) still shows the old
  Citrus Pop orange — only the SVG source icon and the manifest's
  `theme_color`/`background_color` were recolored to Cookbook Editorial
  during the 2026-08-26 follow-up, since regenerating the PNGs needs an
  image-export step rather than a text edit. Tracked in
  [backlog.md](backlog.md).

Resolved 2026-08-26 (see Migration status at the top of this doc and
[decisions.md](decisions.md#2026-08-26-cookbook-editorial-rolled-out-to-the-rest-of-the-app)):
the header, auth screens, recipe form, and collections pages' own structural
Cookbook Editorial pass — previously the single open item here.

Resolved 2026-08-08 (see Toasts, Empty states, and the Inputs ring-offset
note above): the `window.alert()` error banners, the icon-only empty-state
fallback, and the glass-panel focus-ring offset mismatch. A real PWA icon
set (raster PNGs + `apple-touch-icon`) was also added, closing the gap noted
in [backlog.md](backlog.md)'s Completed log for the MVP frontend group.

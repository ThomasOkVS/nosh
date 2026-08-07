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

## Brand direction

Bold and playful, but premium — not a toy. Three reference points, each
contributing something specific:

- **Apple** — restraint, generous whitespace, precise/refined motion. Nothing
  here should feel cluttered or cheap.
- **Arc (browser)** — saturated color used with confidence, soft rounded
  shapes, glassy/translucent surfaces, lots of small delightful details.
- **family.co** — bold, friendly display typography, vibrant gradients, warm
  and confident tone rather than corporate-neutral.

The tension to hold: playful color and motion, disciplined layout and
typography. If a screen feels chaotic, pull back on color/motion, not on the
rounded/glassy identity itself.

## Color — "Citrus Pop"

An orange→pink citrus gradient as the primary brand color, a deep teal as
secondary/contrast, warm (not cold) neutrals.

### Primary — Citrus (orange)

| Token | Hex | Use |
|---|---|---|
| `citrus-50` | `#FFF4EC` | tinted backgrounds, hover fills |
| `citrus-100` | `#FFE4D2` | subtle badges/chips |
| `citrus-300` | `#FFB37A` | decorative, disabled-state accents |
| `citrus-500` | `#FF7A1A` | **primary flat button fill**, primary text/icon accents |
| `citrus-600` | `#F2600A` | primary button hover/active |
| `citrus-700` | `#CB4A02` | primary button pressed, high-contrast text-on-light use |

**Citrus gradient** (decorative only, not for buttons — see Buttons):
`linear-gradient(135deg, #FF7A1A 0%, #FF3D81 100%)`. Reserve for hero
sections, empty-state backgrounds, the login/signup screen background, and
loading/skeleton shimmer — moments that should feel like a brand moment, not
routine UI.

### Secondary — Teal

| Token | Hex | Use |
|---|---|---|
| `teal-50` | `#EAFBFA` | tinted backgrounds |
| `teal-300` | `#5FD4CB` | decorative accents |
| `teal-500` | `#12A6A0` | secondary buttons/links, active nav icon fill, tag accents |
| `teal-700` | `#0B6E6A` | secondary text-on-light, secondary pressed state |

### Semantic

| Token | Hex | Use |
|---|---|---|
| `success-500` | `#1E9E5A` | confirmations (e.g. "recipe saved") |
| `warning-500` | `#E0A100` | non-blocking warnings |
| `danger-500` | `#E11D48` | destructive actions, delete confirmation, form errors |

Chosen to sit visually apart from citrus-orange (rose/red, not orange-red) so
"delete" never reads as just a darker brand color.

### Neutrals — light mode (warm-tinted, not `slate`)

| Token | Hex | Use |
|---|---|---|
| `neutral-0` | `#FFFFFF` | cards, elevated surfaces |
| `neutral-25` | `#FDFCFB` | page background |
| `neutral-100` | `#F5F1ED` | subtle fills, disabled backgrounds |
| `neutral-200` | `#DED5CA` | borders, dividers |
| `neutral-400` | `#A69C92` | placeholder text, disabled text |
| `neutral-600` | `#6B6259` | secondary text |
| `neutral-900` | `#23201C` | primary text |

### Neutrals — dark mode

Dark charcoal, not pure black — near-black reads as OLED-harsh and gives
glass surfaces nothing to visually separate from; a charcoal base lets
translucent panels read as genuinely *lighter* layers on top.

| Token | Hex | Use |
|---|---|---|
| `dark-bg` | `#14151A` | page background |
| `dark-surface` | `#1D1F26` | opaque fallback surface (see Elevation) |
| `dark-border` | `rgba(255,255,255,0.14)` | borders on dark surfaces |
| `dark-text-primary` | `#F4F2EF` | primary text |
| `dark-text-secondary` | `#A8A5A0` | secondary text |

Citrus/teal/semantic accent tokens stay the same hue in dark mode but should
be used slightly desaturated-up-in-lightness where they sit directly on
`dark-bg` (e.g. `citrus-400` instead of `citrus-500` for body-text links) to
hold contrast — verify with a contrast checker per component, don't assume.

### Accessibility floor

Every text/background pairing must hit **WCAG AA (4.5:1 for body text, 3:1
for large/display text)** — including text sitting on glass panels or the
citrus gradient. Glass and gradient are visual treatments, not exemptions:
if a blurred/gradient background can't guarantee contrast, add a semi-opaque
scrim behind the text rather than relaxing the contrast requirement.

## Typography

**Display:** Plus Jakarta Sans (600/700/800) — page titles, recipe titles,
section headers, the "Nosh" wordmark, empty-state headlines. Rounded
geometric letterforms, matches the soft/friendly shape language without
tipping into a cartoonish rounded-display font.

**Body/UI:** Inter (400/500/600) — body copy, form labels/inputs, buttons,
nav, all running text. Chosen specifically because it pairs cleanly with
Plus Jakarta Sans and has excellent legibility at small sizes.

Both loaded via Google Fonts CDN (`font-display: swap`). This is a minor
tension with Nosh's otherwise self-hosted/no-third-party-dependency ethos —
noted and accepted for now; revisit (self-host the font files) if the CDN
dependency ever actually causes a problem (offline PWA use, privacy concern).

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

Never use the display font below `display-md` — it loses legibility and
starts to look like a mistake rather than a choice.

## Shape language

Very rounded, soft — the strongest single signal of the "friendly, not
corporate" identity.

| Token | Radius | Use |
|---|---|---|
| `radius-sm` | 10px | inputs, chips/tags, small icon buttons |
| `radius-md` | 16px | buttons, small cards, dropdowns |
| `radius-lg` | 24px | recipe cards, panels, modals |
| `radius-xl` | 32px | full-screen sheets, hero panels |
| `radius-full` | 999px | primary CTA buttons, avatars, pill badges |

## Elevation & surfaces — glass

Glassy/translucent panels are a deliberate, load-bearing part of the identity
(the Arc/family.co influence), used for: the app header, modals/sheets, the
recipe detail "info panel" floating over a hero photo, and toast
notifications. **Not** for every card — a page where everything is glass has
nothing for glass to sit on top of. Default cards (recipe list cards, form
sections) use flat surfaces; reserve glass for panels that intentionally
float over other content (usually a photo or a colored/gradient background).

### Light mode glass

```
background: rgba(255, 255, 255, 0.65);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.5);
box-shadow: 0 8px 32px rgba(35, 32, 28, 0.08);
```

### Dark mode glass

```
background: rgba(30, 32, 38, 0.55);
backdrop-filter: blur(20px);
border: 1px solid var(--dark-border);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
```

### Fallback

`backdrop-filter` isn't supported everywhere (older WebKit/Firefox). Wrap the
blur in `@supports (backdrop-filter: blur(1px))`; the fallback is a plain
opaque surface (`neutral-0` / `dark-surface`) with the same border and
shadow — still looks intentional, just not translucent. Never let the
fallback be "no visible panel at all."

### Photo-overlay panels

**Added 2026-08-06.** `.glass` assumes it's sitting over the app's own flat
surface — a reasonable assumption for the header or a modal over ordinary
content, but wrong for a panel floating over a user's recipe photo, whose
brightness/color has nothing to do with the app's light/dark setting. Using
theme-following `.glass` there produced a panel that read as washed-out over
bright photos and murky over dark ones.

Fix: a separate `.glass-photo` utility — **fixed dark tint regardless of
theme** (`rgba(20, 21, 26, 0.55)` + blur, always paired with white text, never
`--color-ink`) — used for the recipe detail hero's info panel: **a bounded
floating card** (inset from the image's edges — `inset-x-3/bottom-3`-ish, not
flush to them — `radius-lg`), not a full-height fade-to-transparent gradient.
A first pass used only a `black/80→transparent` gradient behind plain white
text; in review that gave inconsistent, position-dependent contrast (fine
near the bottom edge, weak higher up) instead of a guarantee. A bounded panel
with uniform opacity everywhere inside it is the actual fix — reserve
gradients for *transitions into* a glass panel, never as the sole contrast
mechanism.

**Edit/Delete live inside that same panel, not as independently-floating
buttons.** A second pass put them in their own absolutely-positioned
top-right group, separate from the bottom info panel — which worked for a
short recipe but visibly collided with the panel the moment title +
description + meta + several tags made it tall enough to reach the top of
the image. The fix is structural, not a size/position tweak: the buttons are
laid out in the *same flex row as the title*, inside the panel
(`justify-between`, title left, buttons right) — two elements in one flex
container can't overlap regardless of how tall the panel's content gets,
where two independently-absolutely-positioned elements always can. Inside
the panel they drop `.glass-photo` itself (a dark-blur-on-dark-blur panel
reads muddy) for a plain `bg-white/15` circle, which reads as a clear button
against the panel's own darker tone instead.

Applies whenever a panel floats over unpredictable user content (currently
just the recipe hero) — if the app ever gains another photo-heavy surface,
reuse `.glass-photo` for the panel, and keep any actions inside its flex
layout rather than positioning them independently over the image.

### Confirmation dialogs

**Added 2026-08-06.** Replaced the native `window.confirm()` for destructive
actions (flagged directly as an unstyled OS dialog breaking the whole visual
language the instant it appeared) with `ConfirmDialog`: a centered `.glass`
panel (`radius-lg`), `motion-panel` timing (fade + slight scale/translate,
no spring overshoot — this is a routine confirmation, not a delight moment),
icon (`WarningIcon`, `danger-50`/`danger-500` circle) + heading + message +
a ghost Cancel / filled-destructive Delete pair. This is the buttons spec's
"actual confirming action inside a confirmation step" — the one place the
filled `danger-500` button belongs (see Buttons above).

**The backdrop must actively neutralize whatever is behind it**, not just
dim it a little — `bg-black/60` **plus `backdrop-blur-sm`**, not `bg-black/50`
alone. A first pass used just a 50%-opacity backdrop with no blur; over the
recipe detail page's photo-heavy background the sharp image behind stayed
visually competitive with the dialog, and the `.glass` panel (which itself
assumes a neutralized backdrop, not a busy photo) lost definition — it read
as "melted into" the photo rather than floating above it. Blurring +
darkening the backdrop enough is what makes the dialog panel's own glass
treatment work reliably, *regardless of what page it's opened on* — fix it
at the backdrop, not by hand-tuning the panel per page.

Accessibility: `role="alertdialog"`, `aria-modal`, Escape to cancel, click
on backdrop to cancel, focus starts on Cancel (not the destructive action —
never default-focus a destructive confirm).

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

- **Primary:** flat `citrus-500` fill, white text, `radius-full`, hover
  `citrus-600` + subtle `scale(1.02)` via `motion-standard`, pressed
  `citrus-700` + `scale(0.98)` via `motion-micro`. Gradient is reserved for
  hero moments (see Color), not buttons — keeps buttons calm and legible
  even on busy backgrounds.
- **Secondary:** `teal-500` text/border on transparent or `neutral-0`
  fill, `radius-full`.
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

**Border must actually be visible.** A design review caught the original
border tokens (`#E8E2DC` light / `rgba(255,255,255,0.08)` dark) reading as
essentially invisible against their own fill color — inputs looked like
floating cutouts, not designed fields, especially sitting on the glass auth
card. The neutral-200/dark-border values above are the corrected, more
visible versions; don't quietly soften them back down for "subtlety."

**Every text/number input carries an example placeholder** (e.g. Title →
"Grandma's Sunday Ragù", not empty) — an empty form reads as a raw scaffold;
a form full of plausible examples reads as guided.

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

### Tags/chips

`radius-full`, `citrus-50`/`teal-50` tinted background with matching darker
text (`citrus-700`/`teal-700`) in light mode; inverted-lightness equivalents
in dark mode. **Always render capitalized** (`capitalize` — first letter of
each word), regardless of how the tag was typed/stored — raw lowercase chip
text (`belgian`, `dessert`) reads as an unprocessed database value, not
authored content. This is a display rule only; store/match tags as typed.

### Ingredient & step display — not raw `<ul>`/`<ol>`

**Added 2026-08-06**, same review as Cards above: browser-default bullets
and numbers on the recipe detail page read as an unstyled dump of two DB
tables.

- **Ingredients:** a checklist, not a bulleted list. Each ingredient is a row
  with a small `radius-full` bullet dot (`teal-500`) instead of a browser
  `•`, in a `bg-surface-sunken` rounded-md row for light visual separation
  between items.
- **Steps:** each step is its own card (`bg-surface-sunken`, `radius-md`,
  padding), not an `<ol>` line — with a large circular number badge
  (`citrus-50` fill / `citrus-600` text in light, inverted in dark) to its
  left instead of a plain `1.`/`2.` prefix. Cards stack with a visible gap
  (`space-y-3`), not tight list spacing, so each step reads as a discrete
  action.

### Detail page layout — photo leads, not metadata

**Added 2026-08-06, revised same day.** The original detail page ran title →
description → stats → tags → *then* a small photo — which reads as "record
with an attached image field." The photo is the whole point of a recipe; it
goes first. The first fix just moved title/meta/tags/actions to sit *below*
a full-width hero photo; a same-day follow-up went further and put that
content **on top of** the photo instead, since a photo followed immediately
by a solid block of text was still spending a full extra screen's worth of
height on information the photo had room for:

**When a photo exists:**
1. Back link (unchanged, above the photo).
2. **Hero photo**, `aspect-[16/9]`, `radius-lg`, `relative` container.
3. Floating bottom, inset from the edges: the `.glass-photo` info panel (see
   Elevation — Photo-overlay panels), title and Edit/Delete in one flex row
   (title left, icon buttons right — not independently positioned, see
   Elevation for why), then description, the meta line, and tags below,
   all in fixed white/`white/80` text.
4. Ingredients, then Steps, per the card/checklist treatment below.

**When there's no photo** (the citrus-tinted icon placeholder instead): the
overlay treatment doesn't apply — scrimming a flat brand-colored placeholder
would look like a muddy smear, not a hero moment. Falls back to the
pre-overlay layout: placeholder block, then title/description/meta/tags/
actions stacked below it in normal theme-following `--color-ink` text, same
structure as the very first revision above.

### Navigation / header

Glass panel (see Elevation), sticky. Wordmark "Nosh" set in
`display-md`/Plus Jakarta Sans 800, `citrus-500` — text-only, no icon mark.
Active route indicator uses a filled Phosphor icon in `citrus-500`/`teal-500`
per the mixed-icon rule above.

### Empty states

Custom illustration (e.g. "no recipes yet", "no search results") — simple,
friendly, warm-colored, sitting above a `display-md` headline and `body-md`
supporting copy, with a primary button CTA where relevant ("Add your first
recipe"). Illustrations are a separate asset task (not yet produced) — track
in [backlog.md](backlog.md); ship icon-only as an interim fallback rather
than blocking on illustration work.

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
- A shared `.glass` utility (and its `@supports` fallback) belongs in
  `index.css` once, rather than repeated inline per component.
- Phosphor Icons and Plus Jakarta Sans/Inter are new dependencies — small,
  directly justified by this doc, consistent with the "don't introduce
  unnecessary dependencies" rule in [../CLAUDE.md](../CLAUDE.md) (these
  aren't unnecessary, they're what the approved design requires).

## Open items

- Empty-state illustrations aren't designed yet — interim fallback is
  icon + copy only (see Empty states above).
- Exact dark-mode accent-token lightness adjustments (e.g. `citrus-400` vs
  `citrus-500` on `dark-bg`) should be verified against real contrast
  numbers during implementation, not assumed from this doc alone.
- **Error alerts still use native `window.alert()`** (image upload/delete
  failure, recipe delete failure) — found in the same 2026-08-06 audit that
  led to `ConfirmDialog` replacing `window.confirm()`, but not fixed yet:
  confirmations and errors are different enough (a confirmation blocks and
  needs an explicit choice; an error is often just information) that this
  needs its own toast/inline-banner design, not a reflexive reuse of
  `ConfirmDialog`. Same underlying gap as the "no delight moment on save"
  item that was previously tracked in backlog.md and removed at the project
  owner's request — revisit together if either comes back up.
- Minor, not yet addressed: the focus ring's `ring-offset-color` on inputs
  assumes an opaque `--color-surface` behind them; on a `.glass` panel (e.g.
  the login card) the offset can show a faint mismatched patch right at the
  ring's inner edge instead of blending with the glass tint. Cosmetic, not
  a contrast/accessibility failure (the ring itself is still clearly
  visible) — worth a proper look if it's ever visibly distracting in
  practice.

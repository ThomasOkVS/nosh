# nosh style log

Running record of style choices from the fork-and-pick rounds. Becomes the
design-system section of the rewrite spec once settled.

Base: shadcn/ui (Base UI primitives, base-nova style) + Motion. Kokonut UI dropped.
Test screen: recipe detail, phone width, demo recipe "Vlaamse Stoverij".

## Round 1 — overall direction (2026-11-24)

Options: A warm editorial · B clean minimal · C bold & playful · D dark immersive

Picked: **A — Warm editorial** (Fraunces serif headings + Inter body, cream
paper background, tomato-red accent, small radii, generous whitespace).
Liked / disliked: no extra comments.

## Round 2 — page layout within A (2026-11-24)

Held constant: A's type, colour, radii. Varied: how the page is structured.
Options: A1 long scroll (round-1 A) · A2 sticky tabs · A3 magazine cover ·
A4 cook-along (method first, ingredients in a bottom sheet)

Picked: **A2 + A3 combined**: the magazine cover opening (full-bleed photo,
headline card sliding over it) plus the sticky Ingredients | Method tabs.
Not chosen: plain long scroll (A1), step-by-step cook-along as the main page (A4).

## Round 3 — the sticky tab bar on the cover layout (2026-11-24)

Held constant: A look + cover opening + Ingredients/Method split. Varied: how the
tab bar looks and behaves once you scroll past the cover.
Options: C1 straight combo (underline tabs stick at top) · C2 collapsing header
(title shrinks into the sticky bar, pill tabs) · C3 bottom tab bar (thumb reach)

Picked: **C3 — bottom tab bar**: a floating pill switch (icon + label) at the
bottom of the screen, always visible, tomato-red active pill that springs between
options. The top of the page stays clean; the cover photo opens the page.

## Round 4 — typography (2026-11-24)

Held constant: everything from C3. Varied: the font pairing (display + body).
Options: T1 Fraunces + Inter (current) · T2 Instrument Serif + Geist ·
T3 Newsreader + Source Sans 3 · T4 DM Serif Display + DM Sans

Picked: **T4 — DM Serif Display (headings, single weight 400, never faux-bold)
+ DM Sans (body/UI)**. Bold chunky serif, friendly geometric sans.

## Round 5 — colour (2026-11-24)

Held constant: C3 layout + T4 fonts. Varied: accent colour and paper tone.
Options: P1 tomato on cream (current) · P2 paprika/burgundy on parchment ·
P3 olive on oat · P4 mustard + ink on chalk

Picked: **P4 — mustard + ink on chalk**: near-white paper `oklch(0.985 0.004 90)`,
white cards, ink `oklch(0.2 0.01 260)` for text, buttons and the active pill,
mustard `oklch(0.6 0.13 75)` for small highlights (kicker label, step numbers),
brighter mustard `oklch(0.86 0.15 88)` as accent/focus. Tomato red retired.

## Round 6 — spacing density (2026-11-24)

Held constant: C3 + T4 + P4. Varied: the spacing scale only (Tailwind `--spacing`).
Options: D1 airy (+15%) · D2 balanced (current) · D3 compact (−15%)

Picked: **D2 — balanced**: Tailwind default spacing unit (0.25rem).
Motion: no complaints about the motion used so far, so keep it: spring pills
(stiffness ~420, damping ~34), soft ease-out reveals `[0.22, 1, 0.36, 1]`,
cover parallax, number roll when servings change.

## Round 7 — reality check on other screens (2026-11-24)

Same settled style applied to the library and the meal planner.

Verdict: **holds up, locked in** (2026-11-24). Also accepted as shown:
- App navigation: floating bottom pill in the same style as the
  recipe tabs, plus a round mustard "+" for new recipe / import (with the planner dropped, the nav is just Library + "+"; final shape is a design-doc decision). Replaces the old
  header search + user menu. Settings is an icon top-right.
- Recipe page hides the app nav; its Ingredients | Method pill takes the slot.
- Library: kicker count, big display title, rounded search, springy tag chips,
  2×2 collection tiles, 2-column recipe cards (4:5 photo or letter placeholder).
- ~~Planner~~ (feature later dropped from scope, 2026-11-24 — ignore): one row per day, mustard "today"
  marker, empty day opens a bottom-sheet picker with an import shortcut.

## Locked style — summary

| Aspect | Choice |
|---|---|
| Base | shadcn/ui (Base UI, base-nova) + Motion; no Kokonut |
| Recipe layout | Magazine cover (parallax photo, headline card) + floating bottom Ingredients/Method pill |
| Fonts | DM Serif Display (headings, 400 only) + DM Sans (body/UI) |
| Colour | Chalk paper, ink text/buttons, mustard highlights (P4) |
| Density | Balanced (Tailwind default spacing) |
| Motion | Springy pills, soft ease-out reveals, parallax, number roll |
| Open | Dark mode palette (derive from P4 later) |

Prototype source: `.superpowers/style-spike/` (git-ignored, local only; throwaway reference, not product code). Run with `pnpm --dir .superpowers/style-spike dev` → http://localhost:5199 (`?round=1..7`).

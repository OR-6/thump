# Thump website: design system

The direction is **the hit**. The site is built from the icon: deep plum, off-white type, one hot red-orange, and broken rings spreading from a core, the moment a hand hits a drum. Everything is flat: no gradients, no glow, no blur, no 3D renders except real game captures.

The page is art-directed around the game, not a template: the hero is the kit at the moment of a Perfect with the hit's rings spreading from the struck drum; one list of the six instruments drives a capture and a playable drawing; the setlist is a tour poster on its own field; Play together owns the one hot field. A review on 14 Nov rejected the earlier build as templated (the same label-title-text-picture skeleton in every section, the ring mark used as clip art, grey debug-looking captures); the rules below are what came out of it.

## Why

The owner chose the icon (`public/favicon.svg`, `tools/icon-hit.mjs`) after rejecting glossy 3D renders, cartoon drums, a neon template, a quiet monochrome page and an osu!-like circle. The site has to read as the same brand.

The good indie rhythm-game sites compared on 14 Nov were UNBEATABLE, Spin Rhythm XD, Thumper and Rhythm Doctor. They:

- own one bold field;
- let the mark and art carry the page;
- use type as texture;
- keep copy short;
- never use feature-card grids.

Paradiddle shows the template look to avoid.

## Colour

| Token | Value | Role |
|---|---|---|
| `--plum` | `#1d0b2c` | The page |
| `--plum-2` | `#26103a` | Alternate bands, panels, the setlist's rows on hover |
| `--line` | `#3d2357` | Rules, outlines, quiet borders |
| `--ink` | `#f6efe4` | All main text, the core of the mark |
| `--ink-2` | `#b9aac9` | Secondary text (7.4:1 on plum) |
| `--hot` | `#ff4b2b` | The one action colour: Enter mixed reality, active states, the rings, key words |
| `--hot-ink` | `#1d0b2c` | Text on hot |
**Hot is used sparingly:** for the primary action, the hero's rings, the hit ring on the desk drawing, the chosen instrument's marker, Play together's field, and at most one emphasised word per section (the S in Go for the S). Everything else is ink on plum. On the hot field all type is plum (5.5:1); ink on hot fails contrast and is never used.

There are no difficulty colours on the site: every song has all three levels, so the setlist says it once instead of 57 chips.

## Typography

- **Display:** Big Shoulders Display, weights 800 and 900, capitals. Condensed and loud, used large.
- **Body:** Atkinson Hyperlegible, weights 400 and 700. Its zero is slashed ("2Ø26", "CCØ"), so the figures 0–9 come from a plain local sans (`Figures` in index.html, a `unicode-range` face over Helvetica Neue, Arial or Roboto).
- **Metadata** (nav links, labels, BPM, lengths, spec labels, the desk's foot line): Atkinson Hyperlegible 700 at 14 px, capitals, letter spacing +0.1em. Never the display face at small sizes.
- **One mega element per screen:** the hero capture with its rings, "19 songs", "Go for the S", the example code, the step numerals. The wordmark in the hero is modest (360 px) and the tagline is body type at 30 px.
- **The wordmark:** SVG paths from `src/ui/brand.ts`, the heavy block letters leaning 10°.

| Step | Size / line height | Use |
|---|---|---|
| `--t-mega` | clamp(96px, 15vw, 220px) / 0.85 | The hero wordmark area; one huge word per section at most |
| `--t-1` | clamp(52px, 7vw, 104px) / 0.9 | Section titles (display 900) |
| `--t-2` | clamp(32px, 4vw, 56px) / 0.95 | Setlist song names, instrument names (display 800) |
| `--t-3` | 26px / 1.15 | Sub-heads (display 800, letter spacing +0.02em) |
| `--t-body` | 19px / 1.55 | Body text, 62ch at most |
| `--t-small` | 16px / 1.45 | Captions, specs, footer |
| `--t-cap` | 14px / 1.3 | Labels, navigation and metadata (body 700, capitals, letter spacing +0.1em) |

## Space and layout

- An 8-based scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- Sections are **not** evenly spaced: the gaps vary on purpose (desktop: hero to band 96, band to setlist 160, setlist to scoring 200, scoring to Play together 128, to How to start 160, to specs 96, to the footer 128; roughly two thirds of that on phones).
- Not every section has the same skeleton. Only Setlist and Scoring carry a small text label over their title; the rest are title alone. The Setlist is a full-bleed `--plum-2` band, Play together a full-bleed hot field, Scoring leads with its capture and puts the title beside it.
- Content is 1180 px wide at most, with 24 px gutters (16 px on phones).
- **Asymmetric.** Titles and text sit left; the art sits right or bleeds off the right edge. Nothing in the main flow is centred.
- **Captures are shown no wider than their pixels** (about 716 px for the hero): the hero is designed around that size, bleeding 64 px off the right.
- **No card grids.** Lists are typographic: big type, rules between rows.

## Shape

- Square corners everywhere, except the ring mark.
- 2 px `--line` rules.
- No shadows.
- The 10° lean belongs to the wordmark only. Buttons stay square and upright.

## The ring motif

The broken rings come from the icon: concentric arcs with gaps, each ring turned differently, around an `--ink` core.

The mark is the hit, not a logo, so it appears in exactly **three places**:

- **The nav:** the small mark beside the wordmark.
- **The hero:** three broken hot rings centred on the struck drum in the hero capture, spreading over the page round it and off the right edge only (never cut by the nav or a section edge). They spread in once on load, turn very slowly (60–110 s per turn, alternating directions), and a thin ring goes out from the drum every few seconds. Under `prefers-reduced-motion` they are still.
- **The desk drawing:** a hit sends two broken hot rings out from the point you hit, once (400 ms).

Nowhere else: no section markers, no background arcs, no ring hovers, no ringed numerals. The chosen instrument is marked with a solid hot square and a hot underline.

## Components

- **Primary button** ("Enter mixed reality"):
  - a hot fill, plum display 900 capitals at 22 px with letter spacing +0.06em, 64 px tall, square corners;
  - hover: an ink fill;
  - focus: a 3 px ink ring with a 3 px offset;
  - disabled: a line fill with ink-2 text.
- **Secondary button:** a 2 px ink outline with ink text; hover fills ink with plum text.
- **Link:** ink text with a 2 px hot underline; hover thickens it to 4 px.
- **Primary button off a Quest:** where the browser can't enter mixed reality it says what it does: "Copy the Quest link" (the nav's small one "Copy link"). In the headset's browser it reads "Enter mixed reality" (and "Enter").
- **Captures:** rendered over the page's own plum, so they sit in the page with no frame; their edges are feathered into it. No caption naming the emulator (the honest status lives once, in Specs). No rotation, no shadow. No image appears twice; the score panel at most once.
- **Text field** (Join with a code): a visible label above it, an underline only, a visible caret, the underline thickening on focus.
- **Disclosure** (Settings): a full-width row with a plus in a 2 px square at the right (a minus when open); never the browser's triangle.
- **Navigation:** the mark and the wordmark small at the left, capital links at the right, and a small hot button. It is transparent over the hero, and takes the plum with a 2 px `--line` under it once you scroll.
- **Footer:** `--plum-2`, the wordmark, the credits (Kenney, VCSL, CC0) and the competition line.

## Imagery

- **Captures:** only real ones from the game, rendered over the site's plum (`public/site/`): the kit at a Perfect (hero), one per instrument, and the results with the S. The backdrop's light cone above the desk's back edge is cleared to plum in the hero and the band's drums capture; the instruments and the hit effects are untouched.
- **The desk drawing** (`src/ui/landing-drawing.ts`) is flat: ink outlines on `--plum-2` fills, `--line` details, solid ink hardware, the piano's white keys in ink. One 2 px `--line` frame round it, nothing inside it but the instrument. No gradients, no shadows; hot only for the hit ring.
- **No illustrations or icons** beyond the ring mark and the wordmark.

# Thump website: design system

The direction is **the hit**. The site is built from the icon: deep plum, off-white type, one hot red-orange, and broken rings spreading from a core, the moment a hand hits a drum. Everything is flat: no gradients, no glow, no blur, no 3D renders except real game captures.

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
| `--easy` | `#3ddc97` | EASY marks only |
| `--normal` | `#ffc93c` | NORMAL marks only |
| `--hard` | `#ff4b2b` | HARD marks only (the hot) |

**Hot is used sparingly:** for the primary action, the rings and at most one emphasised word per section. Everything else is ink on plum.

## Typography

- **Display:** Big Shoulders Display, weights 800 and 900, capitals. Condensed and loud, used large.
- **Body:** Atkinson Hyperlegible, weights 400 and 700.
- **The wordmark:** SVG paths from `src/ui/brand.ts`, the heavy block letters leaning 10°.

| Step | Size / line height | Use |
|---|---|---|
| `--t-mega` | clamp(96px, 15vw, 220px) / 0.85 | The hero wordmark area; one huge word per section at most |
| `--t-1` | clamp(52px, 7vw, 104px) / 0.9 | Section titles (display 900) |
| `--t-2` | clamp(32px, 4vw, 56px) / 0.95 | Setlist song names, instrument names (display 800) |
| `--t-3` | 26px / 1.15 | Sub-heads (display 800, letter spacing +0.02em) |
| `--t-body` | 19px / 1.55 | Body text, 62ch at most |
| `--t-small` | 16px / 1.45 | Captions, specs, footer |
| `--t-cap` | 14px / 1.2 | Labels and navigation (display 800, capitals, letter spacing +0.14em) |

## Space and layout

- An 8-based scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- Sections are 144 px apart on desktop and 80 px on phones.
- Content is 1180 px wide at most, with 24 px gutters (16 px on phones).
- **Asymmetric.** Titles and text sit left; the art sits right or bleeds off the edge. Nothing in the main flow is centred.
- **No card grids.** Lists are typographic: big type, rules between rows.

## Shape

- Square corners everywhere, except the ring mark and the circular seats on Play together.
- 2 px `--line` rules.
- No shadows.
- The 10° lean belongs to the wordmark only. Buttons stay square and upright.

## The ring motif

The broken rings come from the icon: concentric arcs with gaps, each ring turned differently, around an `--ink` core.

- **Hero:** the mark is huge and bleeds off the right edge. Its rings turn very slowly (40–90 s per turn, alternating directions) and pulse once on load. Under `prefers-reduced-motion` they stay still.
- **Section markers:** a small static mark (24 px) beside each section's capital label.
- **Background:** one huge ring arc per long section, cropped off an edge, as a 2 px `--line` outline. Texture, not decoration.
- **Interaction:** a hit on the playable desk drawing sends a ring out from the point you hit, in hot, once (an SVG or canvas ring that grows and fades over 400 ms). The site's single flourish.
- **Numerals:** "How to start" uses big display numerals with a hot ring arc around each.

## Components

- **Primary button** ("Enter mixed reality"):
  - a hot fill, plum display 900 capitals at 22 px with letter spacing +0.06em, 64 px tall, square corners;
  - hover: an ink fill;
  - focus: a 3 px ink ring with a 3 px offset;
  - disabled: a line fill with ink-2 text.
- **Secondary button:** a 2 px ink outline with ink text; hover fills ink with plum text.
- **Link:** ink text with a 2 px hot underline; hover thickens it to 4 px.
- **Difficulty marks:** small square-cornered pills (EASY / NORMAL / HARD) in their colours, plum text, 13 px capitals.
- **Screenshot frame:** a real capture with a 2 px `--line` border and a small caption under it in ink-2 ("in the WebXR emulator"). No rotation, no shadow.
- **Navigation:** the mark and the wordmark small at the left, capital links at the right, and a small hot "Enter" button. It sits on plum with a 2 px line under it once you scroll.
- **Footer:** `--plum-2`, the wordmark, the credits (Kenney, VCSL, CC0) and the competition line.

## Imagery

- **Captures:** only real ones from the game. The instruments, the HUD, the results, the held guitar, the kit.
- **No illustrations or icons** beyond the ring mark and the wordmark.

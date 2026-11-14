# Thump website: design system

The direction is a **gig poster for a band on your desk**: one bold paper colour, deep plum ink, a stamped wordmark, a setlist, and real screenshots pasted on like stickers. It is not a dark app landing page.

## Why this direction

I compared five real indie rhythm-game sites in a browser on 14 Nov 2026. UXKIN wasn't connected.

**Sites that look like games:**

- **UNBEATABLE:** a hot-pink illustrated field, slanted black banner plates with a coloured trim, heavy condensed capitals.
- **Spin Rhythm XD:** a fearless saturated yellow field, the logo as the hero, a huge repeated word ("ENTER") as background texture, chunky outlined pill buttons, then trailer, screenshot grid and laurels.
- **Thumper:** one enormous piece of key art, a widely spaced wordmark, tiny capitals for navigation, quiet outlined platform buttons.
- **Rhythm Doctor:** a single dark column carried entirely by its own illustration, the trailer as the hero, awards in gold.

**The site that looks like a template:**

- **Paradiddle:** grey, an icon, a wordmark, three buttons, centred grey paragraphs.

**What the good ones share:**

- They own a single bold colour.
- The wordmark and art carry the page.
- They use type as texture.
- They have little copy.
- They have no feature-card grids.

Our two rejected passes broke those rules. One was quiet monochrome. The other was dark indigo with neon glow, gradient buttons and three-across cards.

Thump's own identity points the same way. The icon is gold-to-orange THUMP on deep plum, and the tagline is "A band on your desk." So the page is the band's poster: marigold paper, plum ink.

## Colour

| Token | Value | Role |
|---|---|---|
| `--paper` | `#ffb51f` | The page: marigold, the colour of the stamped wordmark's middle |
| `--paper-2` | `#ffc94d` | Lighter paper for alternating bands and the texture word |
| `--ink` | `#1d0b2c` | All text on paper, outlines, plates; the in-game plum |
| `--ink-2` | `#3a1f52` | Secondary text on paper (contrast on `--paper` is 9.6:1) |
| `--plate` | `#1d0b2c` | Dark plates: banners, screenshot frames, the play-together ticket |
| `--on-plate` | `#fff6e0` | Text on plates |
| `--on-plate-2` | `#d9c6f0` | Secondary text on plates |
| `--hot` | `#ff3d2e` | The one action colour: Enter mixed reality, links on hover, the record dot |
| `--easy` | `#1f9d55` | EASY marks (on paper) |
| `--normal` | `#1d0b2c` | NORMAL marks |
| `--hard` | `#d61f3c` | HARD marks |
| `--focus` | `#1d0b2c` | A 3 px focus ring with a 3 px paper gap |

There are no gradients except inside the wordmark and the key art. There is no glow. There is one theme (no dark mode): the poster is the brand.

## Typography

- **Display:** Big Shoulders Display, weights 800 and 900, capitals. Condensed poster type, rarely seen on generated pages.
- **Body:** Atkinson Hyperlegible, weights 400 and 700. Built for legibility, with a slightly odd character.
- The THUMP wordmark is SVG paths (`src/ui/brand.ts`), never a font.

| Step | Size / line height | Use |
|---|---|---|
| `--t-mega` | clamp(120px, 18vw, 280px) / 0.82 | The texture word and the hero wordmark area |
| `--t-1` | clamp(56px, 8vw, 112px) / 0.9 | Section titles (display 900) |
| `--t-2` | clamp(36px, 4.6vw, 64px) / 0.95 | Setlist song names, sub-heads (display 800) |
| `--t-3` | 28px / 1.1 | Banner plates, instrument names (display 800, tracked +0.02em) |
| `--t-body` | 19px / 1.55 | Body text (Atkinson 400), measure 60ch at most |
| `--t-small` | 16px / 1.45 | Captions, specs, footer |
| `--t-cap` | 14px / 1.2 | Tiny capitals for navigation and labels (display 800, tracked +0.12em) |

## Spacing

- An 8-based scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Sections are 128 px apart on desktop and 64 px on phones.
- Content is 1200 px wide at most, with 24 px gutters (16 px on phones).
- The layout is asymmetric. Things sit left or right, overlap the edge, and are rotated −2° to 3°. Nothing in the main flow is centred except the setlist.

## Shape and depth

- **Slant:** banner plates and buttons lean 10° (`skewX(-10deg)`, the game's own angle).
- **Radius:** 0 on plates; 999 px on pills (EASY / NORMAL / HARD tags, the code chip).
- **Shadow:** one hard offset, `6px 6px 0 var(--ink)`, for stickers and buttons. No blur anywhere.

## Components

- **Primary button** ("Enter mixed reality"):
  - `--hot` fill, `--on-plate` display 900 text at 24px, 3 px ink outline, the hard shadow, a 10° slant.
  - Hover: the shadow shrinks to 2 px and the button moves 4 px down-right ("pressed").
  - Focus: the ring.
  - Disabled: ink at 35%.
- **Secondary button:** a paper fill, a 3 px ink outline, ink text, the hard shadow, the same slant.
- **Quiet link:** ink text with a 3 px underline in `--hot`, offset 4 px; hover thickens it.
- **Banner plate:** an ink parallelogram with `--on-plate` display 800 capitals, used as each section's kicker (UNBEATABLE-style).
- **Sticker:** a screenshot in a 10 px ink border, the hard shadow, rotated −3° to 3°, sometimes overlapping a neighbour.
- **Setlist row:** song name at `--t-2`, then composer and groove in body text, the tempo in tiny capitals, and EASY / NORMAL / HARD pills. Rows are divided by 3 px ink rules.
- **Ticket:** the play-together box as a torn-edge ink ticket with the code field.
- **Navigation:** the THUMP wordmark small at the left and tiny-capital links. It sticks to the top on paper once you scroll, with a 3 px ink rule under it.
- **Footer:** an ink band with paper text, the CC0 credits and the competition line.

## Imagery and icons

- **Real captures only** (from the game in the WebXR emulator), shown as stickers. Captions say where they come from.
- **The hero:** the rendered key art (the struck snare) cut out on the paper, with the stamped wordmark huge across it.
- **Texture:** the word THUMP repeated in `--paper-2` outline capitals behind sections, drifting slowly. It stops under `prefers-reduced-motion`.
- **Icons:** none in the flow. Instruments are named in type, with their capture beside them, plus a hand-drawn arrow or two in ink SVG where something needs pointing at.

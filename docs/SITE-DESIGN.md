# Thump website: design system

The site has one job: a judge who gives it ten seconds should see hands drumming on a desk in a room, read "A band on your desk.", and know what to do next. Everything else on the page is there for the people who keep scrolling.

The direction is still **the hit** (the icon: deep plum, off-white type, one hot red-orange, a broken ring closing onto a core), but the pictures lead now. A site review on 15 Nov found the earlier build read as AI-made: a cutout of drums on plum with screensaver rings spreading outwards (the game's rings close in), a stock hero stack with the wordmark twice, the same huge-caps-title-plus-grey-text skeleton in every section, small faded captures, a technical drawing with a scale bar, 2000 px of setlist, no maker. The rules below are what came out of it.

## The page, top to bottom

1. **Hero:** the game being played, full bleed, muted and looping (`public/site/hero.mp4`, poster `hero.jpg`). Over it, on the left: "A band on your desk." in the display face (the only H1), one human line under it, one button, and the address. No wordmark (the nav has it).
2. **Six instruments:** six big captures in an uneven two-column mosaic, each with its name and one line on how it's played. Pictures, no title.
3. **Go on, hit something.** The desk drawing, big, filled in the instruments' own colours. It plays itself as it scrolls in; click, tap or drag and it plays the headset's sounds.
4. **Lessons and grades:** two rows, the picture leading and a short head beside it ("Lessons that wait for you to get it.", "Get an S. Then do it again on Hard.").
5. **Setlist:** "17 songs" as one huge word, then a dense three-column poster, originals first.
6. **Play together:** the one hot field. "Four friends, four rooms, one song." Start a band or type a code.
7. **Settings** (a disclosure) and the **footer:** "Made by OR-6" with the reason it exists, the specs as one line, the status, the credits.

At most **three big titles** on the page: the H1, "17 songs" and "Four friends, four rooms, one song." Everything else is a smaller head (`.h2`, `.h3`) or a label.

## The one action

The hero has one button, `#enter-xr`, whose job depends on where the page is open (`src/ui/landing.ts`, `where`):

| Where | Button | Under it |
|---|---|---|
| The Quest's browser (WebXR can start `immersive-ar`) | **Enter mixed reality** (enters) | "Sit at a desk or a tray table and put the controllers down: it's hands only." |
| A computer | **Watch it played** (the loop from the start, full screen with controls where the browser allows; otherwise scrolled to and played) | "On your Quest, open **playthump.pages.dev**", the address big; clicking the address copies it and only then says "Copied. Now open it on your Quest." |
| A phone (coarse pointer, small screen) | **Send it to my Quest** (`navigator.share`, falling back to copying) | The address, as on a computer |

The nav's small button follows it ("Enter", "Watch", "Send"). `?where=desk|phone|xr` forces one, for reviews and screenshots. How to start is folded into the address line ("Sit at a desk, controllers down, tap the desk. Nothing to install."): there is no steps section.

## The hero video

- **Files:** `public/site/hero.mp4` (H.264, `yuv420p`, `+faststart`, no audio track), `public/site/hero.jpg` (the poster: one frame of the loop), optionally `public/site/hero.webm` (VP9, only if it comes out smaller than the mp4; the page doesn't need it).
- **Shape:** 10 s (8–12 s is fine), 1280x720, 30 fps, a seamless loop (the last 0.5 s dissolves into the first). The kit sits right of centre: the left third is under the words on a computer. On a phone the clip is shown on its own above the words, cropped to 4:3 around 62% across, so keep the action between about 35% and 90% of the width.
- **Budget:** mp4 at most 2 MB (the placeholder is about 1.1 MB), poster under 100 KB.
- **On the page:** `autoplay muted loop playsinline`, `preload="auto"`. Under `prefers-reduced-motion: reduce`, or with Save-Data / a 2G connection, it doesn't autoplay (`preload="none"` on a slow connection) and the poster stands in; "Watch it played" still plays it on request. It pauses whenever it's off screen and while you're in the headset.
- **Now:** a placeholder from the emulator, made by `node tools/hero-video.mjs` with the dev server up: the autoplayer plays Mango Season on Hard on the drums while the emulator's two outline hands come down on each piece in time (2.5 cm short of the heads, so only the autoplayer's hits count), seen from the seat, with the emulated room behind darkened and tinted towards plum; the browser's screencast films it at 60 fps and ffmpeg makes the loop.
- **Swapping in real headset footage:** record on the Quest (the headset's own recording, passthrough on, seated at a desk, a song on the drums with a few Perfects; hold the head still and keep the kit right of centre). Pick a 10 s stretch, then
  `node tools/hero-video.mjs --from path/to/quest-clip.mp4 --in <start seconds> [--len 10] [--poster <seconds into the loop>]`
  It crops and scales to 1280x720, cuts the dissolving loop, writes `hero.mp4`, `hero.jpg` (and `hero.webm` when smaller) into `public/site/`, and warns if the mp4 is over budget (raise the CRF in the tool, or shorten `--len`). Nothing in the page changes. Check it at 1440, 768 and 390 (`npx @iwsdk/cli browser run tools/site-pages.mjs --timeout 110000`) that the words don't sit on the action.

## Colour

Every colour on the page is a custom property on `:root` in `index.html`; `landing.ts` and `landing-drawing.ts` hold none, and the ring mark in `brand.ts` takes its colours from CSS (`.mark-ring`, `.core`). To change the palette, change `:root` and nothing else. The names are roles:

| Token | Value | Role |
|---|---|---|
| `--plum` | `#1d0b2c` | The page (and the browser's theme colour, read from it at load) |
| `--plum-2` | `#26103a` | The setlist's field, the drawing's desk, the footer |
| `--line` | `#3d2357` | Rules, quiet borders, the unchosen instrument buttons |
| `--ink` | `#f6efe4` | Main text, the chosen instrument, the hero's full stop |
| `--ink-2` | `#b9aac9` | Secondary text (7.4:1 on plum) |
| `--hot` | `#ff4b2b` | The one action colour: the main button, the rings, the address's underline, Play together's field, the S |
| `--hot-ink` | `#1d0b2c` | Type on hot (5.5:1) |
| `--i-*` | (see `index.html`) | The instruments in the desk drawing, in the colours the game paints them: heads, the red shells, chrome, brass and its grooves, keys, the piano's case, rosewood, rails, conga skin, the handpan's bronze, spruce, the fretboard, strings |

Hot stays scarce: one button, the rings, one word (the S), the together field. Ink on hot fails contrast and is never used. The captures are game frames over the page's plum; they're cropped to the instruments so the game's own panels (being re-skinned to this palette) stay small at the top.

## Typography

- **Display:** Big Shoulders Display 800/900, capitals: the H1 (`--t-hero`, clamp 60–124 px), the three big titles, instrument names, song names, buttons.
- **Body:** Atkinson Hyperlegible 400/700. Its zero is slashed, so the figures 0–9 come from a plain local sans (`Figures`).
- **Metadata** (nav, labels, the instrument buttons, the setlist's by/bpm/length): body 700 at 12–14 px, capitals, letter spacing +0.1em. Never the display face small.
- Text is left-aligned; nothing in the main flow is centred.

## Layout

- Content is 1180 px wide at most, 24 px gutters (16 px under 900 px).
- The hero is full bleed. On a computer the loop starts 22% in from the left and fades into the plum under the words; under 900 px it's a block of its own (16:10, 4:3 under 600 px) above the line and the button.
- Sections are spaced unevenly on purpose (88, 136, 136, 152, then the fields back to back).
- No card grids: pictures in an uneven mosaic, lists as type with rules.
- No horizontal scroll at 375, 768 or 1440.

## Shape and motion

- Square corners, except round things. No shadows, no gradients on surfaces (the hero's scrim is the one gradient). 2 px rules.
- **The ring closes in**, as in the game, never spreads out like a screensaver. It appears in three places:
  - **The nav:** the small mark beside the wordmark.
  - **The hero's full stop:** a broken hot ring closes onto the dot over two beats at 96 bpm, the dot flashes hot and a second ring bursts out as it lands; then two beats' rest.
  - **The desk drawing:** while it's on screen and you haven't touched it, each part due next gets a ring in its own shape (round for a drum, square for a key) closing from nearly twice its size two beats ahead onto its outline, at 96 bpm, then the part lights and a broken hot ring bursts from it. A click, tap or key on a part plays it (with the same burst) and stops the demo until four seconds after your last hit.
- `prefers-reduced-motion: reduce`: no autoplay, no closing rings, no demo, no unfold; a hit still lights the part and fades a ring in place.

## Components

- **Primary button:** hot fill, plum display 900 capitals at 22 px, 64 px tall, square; hover ink; focus a 3 px ink ring offset 3 px.
- **Secondary button:** 2 px ink outline; hover fills ink.
- **The address:** display 900 at 34–52 px with a 4 px hot underline; a button that copies the link.
- **Instrument buttons** (`.pick`): small capitals in a 2 px line box; the chosen one is ink with plum type (`aria-pressed`).
- **Text field** (Join with a code): a visible label, an underline only, the underline thickening on focus.
- **Disclosure** (Settings): a full-width row with a plus in a 2 px square (a minus when open).
- **Nav:** the mark and wordmark small at the left, three capital links, the small button. Clear over the hero, plum with a 2 px rule once you scroll.
- **Footer:** `--plum-2`; the wordmark, "Made by OR-6, after years of drumming on desks that never played back."; one line of specs ("Meta Quest, in its browser. Hands only, seated. 1–4 players. Free, nothing to install."); the status ("Played on a Quest headset; built and tested in the WebXR emulator."); the credits (VCSL CC0; the guitar, a Martin HD-28 recorded by Jeff Learman, Discord SFZ GM Bank, CC0; Kenney CC0); the competition line. The maker is the handle OR-6 only.

## Copy

Blunt, short, human; say what you do, not what it is. No "immersive", "seamless", "unleash", no "experience". A line earns its place by telling a judge something they'd otherwise miss. Lines in use: "Put the controllers down. Your desk is the drum kit now." / "Go on, hit something. Same sounds as in the headset." / "Lessons that wait for you to get it." / "Get an S. Then do it again on Hard." / "Easy, Normal or Hard" / "Four friends, four rooms, one song." / "One of you gets a code. Everyone else types it in." / "Copied. Now open it on your Quest." (only after the click). The sample code is marked with a small "e.g." and nothing more.

## Imagery

- **Captures:** real frames from the game over the site's plum, cut tight to the instrument and shown big (3:2, 1200x800 WebP): `public/site/{drums,guitar,piano,marimba,congas,handpan,lesson,results}.webp`, made by `node tools/site-crops.mjs` (crop boxes in the file) from the submission stills (`artifacts/submission/*.jpg`) and `tools/site-shots.mjs`'s 1280x720 frames. The guitar is the one held on the lap from the seat; the lesson is the one stopped on "Now!". No image appears twice.
- **The desk drawing** (`src/ui/landing-drawing.ts`): plan view at real size from the game's own layouts, every shape with a material class filled from an `--i-*` token, a dark 1.5 px edge, on `--plum-2`. No scale bar, no caption beyond one short hint where a drawing can't say it (the piano's black keys, the guitar's chords, the congas' two zones). It keeps `.part[data-part]` and `.pick[data-inst]`.

## Checks

`npm run typecheck`, `npx vitest run`, `npm run build`, `node tools/e2e-landing.mjs` (every part of every instrument heard, the phone's first-tap unlock, no sideways scroll), `node tools/e2e-band.mjs` (start and join a band), and the three screenshots (`tools/site-pages.mjs` → `artifacts/site-{1440,768,390}.png`).

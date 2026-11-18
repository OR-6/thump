# Thump website: design system

The site is a hackathon project page, made by the person who built the game: what it is in one line, the video and
screenshots, how to play, the six instruments to try, the songs, making a track and playing together, who made it. It
looks like a risograph gig flyer (the owner's pick, from docs/flyer-mockup.html): cream paper, two riso inks (pink and
blue) printed over each other so they darken where they cross, ink black for reading, a yellow highlighter for the
chosen thing.

The page is `index.html` (the tokens and every style, plus the loading shell) and `src/ui/landing.ts` (the markup and
behaviour); `src/ui/landing-drawing.ts` draws the instruments.

## The page, top to bottom

1. **Hero:** "A band on your desk." (the only H1, three lines, blue with a pink copy a few pixels off, over a solid
   pink circle and two halftone circles), one line ("A VR music game you play with just your hands, no controllers, on
   your actual desk."), the one action, and the address on a black ticket stub at an angle. Then the **video** slot,
   full width, and three **screenshot** slots.
2. **How to play:** three numbered steps, left to right (open the link in the Quest browser, sit at your desk, look
   down), and one line on hands only.
3. **Six instruments:** the six names big, separated by pink slashes like a flyer's lineup; they are the picker
   (`.pick[data-inst]`, the chosen one on a yellow highlighter). Under them the desk drawing, which plays itself as it
   scrolls in and plays the headset's sounds under your clicks, with the chosen instrument's name and how it's played
   beside it (under it below 900 px).
4. **Songs:** "N songs" and a line that counts the originals and classics from `TUNES` (one original is named; more are
   listed), then a running order in two columns (number, name, dot leaders, length; composer or style and bpm under),
   originals first with their number on a pink spot.
5. **Make your own track** (a pink sticker) and **Play together** (an inked panel with Start a band and Join a band
   either side of a dashed tear line). On a phone the band controls are hidden and a line says to open the page on the
   Quest.
6. **Settings** (a disclosure) and **Who made it:** one line, then a plate (Made by, Built with, Runs on, Entered in,
   Sounds), and the mark and the name printed big at the very bottom.

No leaderboard, lessons, scoring or Spotlight on the page.

## The one action

`#enter-xr`, and the bar's small button copies its label (`src/ui/landing.ts`, `where`):

| Where | Button | Does |
|---|---|---|
| The Quest's browser (WebXR can start `immersive-ar`) | **Enter** | enters mixed reality |
| A computer | **Watch** once the video is in, **Try it** until then | plays the video with sound / scrolls to the drawing |
| A phone (coarse pointer, small screen) | **Send link** | `navigator.share`, falling back to copying |

`?where=desk|phone|xr` forces one, for reviews and screenshots. The address (`playthump.pages.dev`) is a button that
copies the link.

## The video and the screenshots

Drop the files into `public/site/` and they appear; nothing else changes:

- `public/site/video.mp4` (H.264, 16:9, under 3 minutes; keep it a reasonable size, it loads only its metadata until
  played). It shows with controls; the computer's button becomes **Watch**.
- `public/site/shot-1.jpg`, `shot-2.jpg`, `shot-3.jpg` (16:9 is best; they're cropped to fill). Once one is in, the first
  is shown big with the other two stacked beside it. Another screenshot is one more line in `SHOTS` in
  `src/ui/landing.ts` (alt text there too).

Until a file is there its slot shows an empty state: a paste-up box (a dashed line where the picture goes), the slot's
name ("Video", "Screenshot 1") and one line, and a pink play mark on the video's. The empty video slot is a short
letterbox so the page doesn't open on a big box; empty screenshots stay hidden until one is there.

## Colour

Every colour is a custom property on `:root` in `index.html`; `landing.ts` and `landing-drawing.ts` hold none. Light
only (it's paper).

| Token | Value | Role |
|---|---|---|
| `--paper` | `#efe6d2` | The page, with a fine screen of ink dots over it (`--grain`) |
| `--paper-2` / `--paper-hi` | `#e6dabf` / `#faf5ea` | The stage under the drawing / panels, inputs, toggles |
| `--pink` | `#ff48b0` | Riso ink: the primary button, the misprinted copy of titles, the big circles, slashes, hits |
| `--blue` | `#3255a4` | Riso ink: titles, the lineup, the primary button's offset plate, halftone circles, the demo's closing rings |
| `--ink` | `#1d1d1b` | Body text, rules, outlines, the ticket |
| `--ink-2` / `--ink-3` | `#4f4a42` / `#857e70` | Secondary text (7:1 on paper) / placeholders, dashed slot lines |
| `--yellow` | `#ffe24a` | The highlighter: the chosen instrument, a toggle that's on, a status line |
| `--i-*` | (see `index.html`) | The instruments in the drawing, printed in the same inks (a pink kit, yellow cymbals, a blue keyboard case and handpan, pink marimba bars, a yellow guitar top) |

Pink and blue overlap with `mix-blend-mode: multiply`, so where they cross they print a deep purple, as real riso does.
Pink is never body text (it fails contrast on paper); ink text sits on pink. Halftones are `radial-gradient` dot
screens (`--dots-pink`, `--dots-blue`), each screen turned to its own angle. No gradient washes, no glows, no soft
shadows.

## Type

- **Bricolage Grotesque** (Google Fonts) 800 for titles, names and buttons, tightly tracked (-0.045em on titles), sentence
  case. The H1 is `--t-hero` (80 to 188 px, line height 0.84) in three lines; section titles `--t-2` (40 to 72 px).
- Titles are printed off register (`.riso`): the word in blue, a pink copy from `data-t` a few hundredths of an em down
  and right, both multiplied. The pink plate slides into place as the page opens (not under reduced motion).
- Bricolage Grotesque 400/600 for body (18 px) and small text (15 to 16 px).
- No all-caps labels. Numbers tabular. Text left-aligned; only an empty slot's content is centred on a phone.

## Shape, space, motion

- Buttons and the code field are pills or near-pills; panels have 3 px ink outlines and a 14 px radius; rules are 3 px
  ink between sections, 1 px between rows.
- Content 1200 px wide; gutters 32 / 20 / 16 px; sections 136 / 96 / 80 px apart (desktop / tablet / phone).
- Motion: the hero's pink plate slides into its misprint once; the drawing's demo rings (blue) close onto the next
  part and a broken pink ring bursts from a hit. Nothing fades in on scroll. `prefers-reduced-motion` stops the plate,
  the demo and the button nudges.

## Components

- **Primary button** (`.btn-1`): pink fill, ink type, a hard blue plate 6 px off to the side; one per screen.
  **Secondary** (`.btn-2`): an ink-outlined pill that fills with ink on hover.
- **Lineup** (`.pick[data-inst]`, `aria-pressed`): big blue names, pink slashes between; the chosen one in ink on a
  yellow highlighter swipe.
- **Ticket** (`#addr`): black, rotated a few degrees, a perforation (dashed line and two notches) before a "Quest 3"
  stub; the address is a button that copies the link.
- **Toggles** (Settings): an ink-outlined track; on is yellow with the ink knob at that side.
- **Code field** (`#band-code`): 3 px ink outline, 800 weight with wide tracking, placeholder ABCD.
- **Disclosure:** between two 3 px rules, a plus in an ink ring.

## Link preview and icons

`public/site/og.jpg` (1200 by 630) is the hero as a flyer: the misprinted line over the circles, the ticket, the one line
and the lineup along the bottom. The icons (`public/favicon.svg`, `favicon-32.png`, `icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`) keep the mark (two broken rings and a core) printed on paper: the inner ring pink, the outer
blue, the core black over a pink copy a little off register.

## Copy

The owner's voice (the my-writing-style skill, docs/SUBMISSION.md's About section): casual, first person, plain, a "!"
on the one or two best things (trying the instruments here; playing in a band). No colons leading lists, no em dashes,
no slogans in threes. Buttons are one or two words.

## Checks

`npm run typecheck`, `npx vitest run`, `npm run build`, `node tools/e2e-landing.mjs` (every part of every instrument
heard, the phone's first-tap unlock, the six named, Play together and Start a band, no leaderboard or scoring copy, no
sideways scroll), `node tools/e2e-band.mjs` (start and join a band), and screenshots at 390, 820 and 1440.

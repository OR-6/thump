# Thump website: design system

The site is a hackathon project page, made by the person who built the game: what it is in one line, the video and
screenshots, how to play, the six instruments to try, the songs, making a track and playing together, who made it. It
follows docs/UI-DIRECTION.md, the same look as the headset panel: music hardware (a drum machine, a mixer, a good
synth's screen), warm graphite, flat, one signal orange.

The page is `index.html` (the tokens and every style, plus the loading shell) and `src/ui/landing.ts` (the markup and
behaviour); `src/ui/landing-drawing.ts` draws the instruments.

## The page, top to bottom

1. **Hero:** "A band on your desk." (the only H1), one line ("A VR music game you play with just your hands, no
   controllers, on your actual desk."), the one action and the address. Then the **video** slot, full width, and three
   **screenshot** slots.
2. **How to play:** three numbered steps, left to right like a step sequencer (open the link in the Quest browser, sit
   at your desk, look down), and one line on hands only.
3. **Six instruments:** a channel strip (the six as rows: name and one line on how it's played; the chosen row raised
   with an orange bar at its left) beside the desk drawing, which plays itself as it scrolls in and plays the headset's
   sounds under your clicks. Under 900 px the rows become a 3 by 2 grid of tiles (the bar at the bottom) and the chosen
   one's line goes under the drawing.
4. **Songs:** "N songs" and a line that counts the originals and classics from `TUNES` (one original is named; more are
   listed), then a track listing in two columns, originals first with an orange dot.
5. **Make your own track** (a narrow panel) and **Play together** (a wide one with Start a band and Join a band). On a
   phone the band controls are hidden and a line says to open the page on the Quest.
6. **Settings** (a disclosure) and **Who made it:** one line, then a spec plate (Made by, Built with, Runs on, Entered
   in, Sounds).

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

Until a file is there its slot shows an empty state: the raised surface, a viewfinder's four corners, a small orange dot
with the slot's name ("Video", "Screenshot 1") and one line. The empty video slot is a letterbox (21:8) so the page
doesn't open on a big dark box; empty screenshots sit three in a row (one on a phone).

## Colour

Every colour is a custom property on `:root` in `index.html`; `landing.ts` and `landing-drawing.ts` hold none. Dark
only (the panel is dark too).

| Token | Value | Role |
|---|---|---|
| `--bg` | `#161419` | The page, the stage under the drawing, the band boxes |
| `--raised` | `#211e24` | Panels, slots, the channel strip, inputs, secondary buttons |
| `--pressed` | `#2b2730` | The chosen instrument, a pressed secondary button, a toggle's track |
| `--line` | `#36323b` | Hairlines, the viewfinder corners |
| `--text` | `#f2eee8` | Text |
| `--text-2` | `#a29da8` | Secondary text |
| `--text-3` | `#6d6873` | Disabled, placeholders |
| `--accent` | `#ff5a1f` | The one primary button per screen, the "this one" bar and dots, step numbers, the hit rings |
| `--on-accent` | `#1a0d07` | Type on orange |
| `--i-*` | (see `index.html`) | The instruments in the drawing, in the colours the game paints them |

No purple, no gradients, no glows, no shadows. Orange is never a wash.

## Type

- **Barlow Condensed** (the headset panel's face, served from `public/fonts`) 600/700, upright, sentence case: the H1
  (`--t-hero`, 64–148 px, line height 0.88), section titles (`--t-2`, 40–64 px), instrument and song names, buttons
  (uppercase, +0.04em).
- **Barlow** (Google Fonts) 400/500/600: body 18 px, small 15–16 px.
- **Silkscreen labels** (`.silk`): Barlow Condensed 600, 13 px, uppercase, +0.14em, secondary colour. Only where a label
  names a slot or a spec row, never as an eyebrow over a heading.
- Numbers tabular. Text left-aligned; only an empty slot's content is centred.

## Shape, space, motion

- Radius 8 px on panels and slots, 6 px on buttons, tiles and inputs. 1 px hairlines.
- Content 1200 px wide; gutters 32 / 20 / 16 px; sections 136 / 96 / 80 px apart (desktop / tablet / phone).
- Motion: the H1's full stop lands on the beat (a ring closes onto it, the dot flashes orange); the drawing's demo rings
  close onto the next part and a broken ring bursts from a hit. Nothing fades in on scroll. `prefers-reduced-motion`
  stops the full stop and the demo.

## Components

- **Primary button:** orange fill, dark type, 52 px tall; one per screen. **Secondary:** raised fill, hairline inset.
- **Instrument rows / tiles** (`.pick[data-inst]`, `aria-pressed`): chosen = pressed fill + 4 px orange bar (left on a
  row, bottom on a tile).
- **Toggles** (Settings): a plain track; on is orange with the knob at that side, off is grey.
- **Code field** (`#band-code`): raised, hairline, Condensed 30 px with wide tracking, placeholder ABCD.
- **Disclosure:** a hairline row with a plus in a small raised square.

## Copy

The owner's voice (the my-writing-style skill, docs/SUBMISSION.md's About section): casual, first person, plain, a "!"
on the one or two best things (trying the instruments here; playing in a band). No colons leading lists, no em dashes,
no slogans in threes. Buttons are one or two words.

## Checks

`npm run typecheck`, `npx vitest run`, `npm run build`, `node tools/e2e-landing.mjs` (every part of every instrument
heard, the phone's first-tap unlock, the six named, Play together and Start a band, no leaderboard or scoring copy, no
sideways scroll), `node tools/e2e-band.mjs` (start and join a band), and screenshots at 390, 820 and 1440.

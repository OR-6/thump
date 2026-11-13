# Video: shot list and voice-over (real passthrough on a Quest 3)

Target **2:00** (judges may stop at 3:00). Real gameplay only, recorded in the headset; no AI video. The first second is a finger tapping a real mug, a ring of light round it, and a bell. "Your desk is a drum machine" by second three.

## Before you record

- **Desk:** your own, a mug, a book, a bottle, a keyboard, the laptop open. Warm light, nothing branded in view. No room scan needed.
- **Headset:** charged, lenses clean, hand tracking on, controllers out of reach.
- **Recording:** Meta button → Camera → Record video, landscape, highest resolution, **microphone on** (the real knock under the sound is the point).
- **Move slowly.** Turn your head half as fast as feels natural; hold each shot a beat before and after.
- **Fresh start** for shots 1–3: on the 2D page open Settings → *Start over*. Film at `https://or-6.github.io/thump/` (no `?debug`).

## Voice-over (short, dry, the hook by second 3)

- 0:00 (a finger on the mug, a bell; no words for one beat)
- 0:02 "This is Thump. Your desk is a drum machine."
- 0:06 "Hit the desk, it's a kit. Hit your mug, it rings. Anything in reach plays."
- 0:24 "Pick what anything sounds like."
- 0:30 "Then build a track out of it, one part at a time."
- 1:00 "And play it live. Fills. Then the lights go off."
- 1:25 "Someone to play with, too."
- 1:40 "It works in an airplane seat."
- 1:52 "Thump."

Feature chips (top right): **hand tracking** on shots 1–4, **passthrough** on 2 and 5–6, **persistent anchor** when your kept things come back.

## Shots, in story order

| # | Time | Shot | How to get it | On-screen text |
|---|---|---|---|---|
| 1 | 0:00–0:05 | **A mug gets its ring:** a real desk, a finger taps the mug, a ring of light round it, a bell | Fresh start (Settings → Start over), a mug on the desk | "Hit your mug." |
| 2 | 0:05–0:12 | **The machine running:** the desk playing a track by itself, rings flashing on the mug, the book, the keyboard | Build Kick Start first, then just watch | "Your desk is a drum machine." |
| 3 | 0:12–0:24 | Discovery in a few hits: the desk is a kit, the book knocks, the keyboard becomes keys, the knee is a conga | Fresh start | "Everything in reach plays." |
| 4 | 0:24–0:30 | Change a sound: hit the mug, ▶ ▶ on the module: bell, chime, glock | Any time | "Pick its sound." |
| 5 | 0:30–1:00 | **Build:** *Hit what plays the kick*; the desk; two bars along with the lights; the snare on the book, the hat on the mug… | ▶ on *Build a track?* | "Build a track out of your stuff." |
| 6 | 1:00–1:25 | **Perform:** notes fly to the mug and the book; *Fill!*; the lights go off, *Hold it*; *Tight 84%* | ▶ on *Perform?* | "Then play it live." |
| 7 | 1:25–1:40 | JAM: the bandmate's mallets lift off the module and play on the mug; you answer | After the first performance (or `?unlock=all`) | "Someone to play with." |
| 8 | 1:40–1:52 | An airplane-style tray: a cup, a phone, knees; the same game in a tight seat | Any small table | "Anywhere you can sit." |
| 9 | 1:52–2:00 | The link | Title card | "or-6.github.io/thump" |

Record 2–3 takes of each. Keep your head still during the action; move only between shots.

## Assembling it

1. Copy the headset recordings into `artifacts/video/` named as in `docs/video-shots.json` (or edit that file), and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

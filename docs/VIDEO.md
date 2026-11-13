# Video: shot list and voice-over (real passthrough on a Quest 3)

Target **2:20** (judges may stop at 3:00). Real gameplay only, recorded in the headset; no AI video. The first second is a real hand hitting a real door, and a marimba note. "Every surface in your room is an instrument" by second three.

## Before you record

- **Room:** a desk near a wall, with a door and a window you can reach (stand for them). Warm light, nothing branded in view. Run **Space setup** first and mark the table, walls, door and window.
- **Headset:** charged, lenses clean, hand tracking on, controllers out of reach.
- **Recording:** Meta button → Camera → Record video, landscape, highest resolution, **microphone on** (the real knock under the instrument is the point; we can lay the clean game audio under it).
- **Move slowly.** Turn your head half as fast as feels natural; hold each shot a beat before and after.
- **Fresh start** for shots 1–5: on the 2D page open Settings → *Start over*. Film at `https://or-6.github.io/thump/` (no `?debug`).

## Voice-over (short, warm; the hook by second 3)

- 0:00 (a hand on the door, a marimba note; no words for one beat)
- 0:02 "This is Thump. Every surface in your room is an instrument."
- 0:08 "Hit anything. Your table is a drum kit."
- 0:16 "Your wall, a gong. Your window, a glockenspiel. Your door, a marimba."
- 0:36 "Then songs are written for your room: the notes fly to whatever you've found."
- 1:05 "A bandmate takes one of your instruments, and listens to you."
- 1:25 "A friend's phone can be the bass."
- 1:40 "Next time, your room remembers what it plays."
- 1:55 "One hand, slow songs, no words: made for every pair of hands."
- 2:10 "Thump. Play your room."

Feature chips (top right): **hand tracking** on shots 1–2, **plane detection** on 3, **scene understanding** on 4–5 (the wall, door and window), **passthrough** on 6, **persistent anchor** on 9.

## Shots, in story order

| # | Time | Shot | How to get it | On-screen text |
|---|---|---|---|---|
| 1 | 0:00–0:05 | **Cold open:** a flat hand taps the real door; light bars climb across it; a marimba note | Fresh start; walk to the door; hit it once | "Every surface is an instrument." |
| 2 | 0:05–0:14 | Back at the desk: the module says "Hit anything"; a slap on the table and the kit draws itself | Fresh start, sit down first | "Hit anything." |
| 3 | 0:14–0:22 | Left, middle, right across the table: kick, snare, hat; the edge a rim | Keep playing | "Your table is a drum kit." |
| 4 | 0:22–0:36 | The wall: a gong ring draws itself, a long boom. The window: keys appear, soft taps climb up a scale | Lean or stand | "Your wall, a gong. Your window, keys." |
| 5 | 0:36–1:05 | *Porch Step*: the count-in on the module, light motes flying from the module to the pads and the door's bars; both hands playing | Tap ▶ on the module | "Songs cast onto your room." |
| 6 | 1:05–1:25 | **JAM:** the bandmate's bars light on the door as it plays; "Your turn"; you answer; the next call gets busier | After the first song, tap JAM | "A bandmate that listens." |
| 7 | 1:25–1:40 | A friend's phone in frame, tapping the bass pad in time with the light | Tap JAM; the code on the module; join from the phone | "A friend's phone is the bass." |
| 8 | 1:40–1:55 | Headset off and on: the kit and the door's bars are still drawn | Real re-entry | "Your room remembers." |
| 9 | 1:55–2:10 | The settings page on the module: one hand, slow, contrast (quick cuts) | Tap ◀ twice on the module | "Made for every pair of hands." |
| 10 | 2:10–2:20 | The link, big | Title card | "or-6.github.io/thump" |

Record 2–3 takes of each. Keep your head still during the action; move only between shots.

## Assembling it

1. Copy the headset recordings into `artifacts/video/` named as in `docs/video-shots.json` (or edit that file), and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

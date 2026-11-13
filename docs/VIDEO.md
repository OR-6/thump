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
| 1 | 0:00–0:05 | **Cold open:** a flat hand taps the real door; light spreads from the hand and marimba bars snap in; a marimba note | Fresh start; walk to the door; hit it once | "Every surface is an instrument." |
| 2 | 0:05–0:12 | Back at the desk: "Hit anything"; a slap, and the kit blooms out from the palm, each pad sounding as it appears | Fresh start, sit down first | "Hit anything." |
| 3 | 0:12–0:24 | The wall becomes a gong (bronze, a long bloom, rings across the wall); the next wall a timpani; the window a harp, played gently | Lean or stand | "Your walls, a gong and timpani. Your window, a harp." |
| 4 | 0:24–0:30 | **The tutti:** both hands slam the table and the whole room answers, a ring of light crossing the room, each instrument sounding as it arrives | Three instruments found, then both hands at once | "The whole room, at once." |
| 5 | 0:30–1:00 | *Porch Step*: notes fly as light to the desk's bars and the pads; the instruments you found join in softly; the last chord crosses the room | Tap ▶ on the module | "Songs cast onto your room." |
| 6 | 1:00–1:18 | **JAM:** the bandmate's mallets fly from the module to its instrument and play; "Your turn"; you answer | After the first song, tap JAM (or `?unlock=all`) | "A bandmate at your table." |
| 7 | 1:18–1:30 | **Swap:** pinch and hold the window; it becomes a glockenspiel, then chimes | After Porch Step | "Change any sound." |
| 8 | 1:30–1:42 | A friend's phone in frame, tapping the bass pad in time with the light | Tap JAM; the code on the module; join from the phone | "A friend's phone is the bass." |
| 9 | 1:42–1:55 | Headset off and on: the kit and the door's bars are still drawn | Real re-entry | "Your room remembers." |
| 10 | 1:55–2:08 | Seated only (the airplane test): kit and bars, swap the bars to a vibraphone, play | Sit, hands on the desk | "A whole instrument at any desk." |
| 11 | 2:08–2:20 | The link, big | Title card | "or-6.github.io/thump" |

Record 2–3 takes of each. Keep your head still during the action; move only between shots.

## Assembling it

1. Copy the headset recordings into `artifacts/video/` named as in `docs/video-shots.json` (or edit that file), and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

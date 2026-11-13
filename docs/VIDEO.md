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
| 1 | 0:00–0:06 | **Cold open, seated:** a coffee cup on a table. A finger taps it twice; a ring of light, then it rings like a bell | Fresh start; a cup on the table | "Tap your cup twice." |
| 2 | 0:06–0:14 | Three cups of different heights tapped in turn: three different notes, a little tune | Keep playing | "Taller cups ring lower." |
| 3 | 0:14–0:22 | A slap on the table: the kit grows out from under the palm, each pad sounding as it appears; then a groove | Same seat | "The table is a drum kit." |
| 4 | 0:22–0:28 | A book knocks like wood; hands drum on knees under the table: congas | Same seat | "Your knees are congas." |
| 5 | 0:28–0:34 | **Both hands slam the table:** every instrument found plays one chord, light running across them | Three or more found | (no text) |
| 6 | 0:34–1:02 | *Porch Step*: notes fly to the cups and the bars a beat early; the other instruments join in quietly; the last chord; then the encore | Tap ▶ on the module | "Songs for whatever's on your table." |
| 7 | 1:02–1:18 | **JAM:** the bandmate's mallets lift off the module, play on your cups, and you answer | After the first song, tap JAM (or `?unlock=all`) | "Someone to play with." |
| 8 | 1:18–1:28 | Pinch and hold the bars: balafon becomes a harp | After Porch Step | "Change any sound." |
| 9 | 1:28–1:44 | Stand up: the wall booms like a gong, the door is a marimba, the window a glockenspiel | Needs the room scan | "Get up and the room joins in." |
| 10 | 1:44–1:56 | An airplane-style tray: a cup and a phone, played seated in a tight space | Any small table | "Anywhere you can sit." |
| 11 | 1:56–2:06 | The link | Title card | "or-6.github.io/thump" |

Record 2–3 takes of each. Keep your head still during the action; move only between shots.

## Assembling it

1. Copy the headset recordings into `artifacts/video/` named as in `docs/video-shots.json` (or edit that file), and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

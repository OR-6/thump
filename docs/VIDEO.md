# Video: shot list and voice-over

About 90 seconds. Real passthrough recorded in a Quest 3, real hands, the game's own sound. It opens on someone sitting at a desk or a tray table, and the first hit lands in the first three seconds.

## Before you record

- Where: a small table or a tray table, sitting down. A plain wall behind, warm light, nothing branded in view. Clear the table: the instruments go where your mug would be.
- Headset: charged, lenses clean, hand tracking on, controllers out of reach.
- Recording: Meta button → Camera → Record video, landscape, highest resolution, microphone on. The knock of your hand on the table under the sound is part of it.
- Move slowly. Turn your head half as fast as feels natural. Hold each shot a beat before and after the action.
- Address: `https://or-6.github.io/thump/` (no `?debug`). For shots 1–2 do a fresh start: on the 2D page, Settings → *Start over*.
- For shots 5–7 you need Kick Start built once. Build it before filming, or film shot 4 and keep going.
- For shot 8 you need a second player. A second Quest is best. If there isn't one, join from a laptop on the 2D page (its pads play into the band) and film the laptop with a phone.

## Voice-over

Short and dry. Leave gaps; the music does most of it.

- 0:00 (no words: a palm on the tray, a tap, the drums come up)
- 0:03 "This is Thump. You play it sitting down."
- 0:10 "The arrows on the box put something else on the desk."
- 0:20 "Every note's in the scale. You can't hit a wrong one."
- 0:26 "Then you build a track. Copy one bar, make the next one yours."
- 0:44 (no words: the silent bar, then the drop)
- 0:50 "Then play it over the top."
- 1:02 "Switch to piano halfway if you like."
- 1:12 "Friends join from their own desks."
- 1:25 "Thump."

## Shots, in order

In the Shot column, quoted lines are exactly what the module or the 2D page shows. The last column is the caption card.

| # | Time | Shot | How to get it | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:06 | A tray table, two hands. A palm rests, the module turns up ("Tap the desk"), one tap and the drums come up under the hands | Fresh start, sit down, enter mixed reality | "Tap the desk." |
| 2 | 0:06–0:10 | A few hits on the drums: BOOM, SMACK, TICK, the light bars behind | Straight on from shot 1 | (none) |
| 3 | 0:10–0:20 | The piano comes out: two notes and the chord pad; then the guitar, a chord pad and a strum; then the handpan, a run round it | The arrow right of ▶, then play each a few seconds | "Swap what's on the desk." |
| 4 | 0:20–0:26 | NOTES: "Notes: Sad" and a run on the handpan. SOUND: "Sound: Bells" | The last two keys on the module | "No wrong notes." |
| 5 | 0:26–0:44 | Build Kick Start: "Pick the big boom", a hit, "Hit when it glows", the lit bar copied, "Your turn: play anything", a bar of your own. Cut to TUNE: the piano comes out by itself | ▶ on "Build a track?" | "Build it a part at a time." |
| 6 | 0:44–0:50 | "Everything, in…": a silent bar, the riser, then the whole track drops in at once | The last part of the build | (none) |
| 7 | 0:50–1:12 | Perform: "Hit what glows", "Go wild!" and a fast fill, then the arrow right of ▶ and "Piano next", "Find it, then join in", the tune on the piano. End on the results: notes played and the stars | ▶ on "Your track. Perform? ▶" | "Play it live." |
| 8 | 1:12–1:25 | Two people at two desks. On the 2D page "Start a band", the code, typed on the other side, "2 in the band". Then both play; a note from the friend lands to one side | See *Before you record* | "Play together, from anywhere." |
| 9 | 1:25–1:30 | End card | Title card | "or-6.github.io/thump" |

Shoot two or three takes of each. Keep your head still during the action and move only between shots. Don't stage the results number: use whatever you get.

Feature chips (top right): hand tracking on shots 1–5, passthrough on 1 and 7, plane detection on 1 (the desk is found from a plane or a resting palm).

## Assembling it

The cut list and captions used by the tools are from an earlier version of the video. Update both to the table above before assembling: `docs/video-shots.json` (clip names, `in`/`out`, card, chip) and the caption text in `tools/video-cards.mjs`.

1. Copy the headset recordings into `artifacts/video/`, named as in `docs/video-shots.json`, and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

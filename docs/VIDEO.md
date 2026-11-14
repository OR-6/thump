# Video: shot list and voice-over

About 90 seconds. Real passthrough recorded in a Quest 3, real hands, the game's own sound. It opens on someone sitting at a desk or a tray table, and the first hit lands in the first three seconds.

## Before you record

- Where: a small table or a tray table, sitting down. A plain wall behind, warm light, nothing branded in view. Clear the table: the instruments go where your mug would be.
- Headset: charged, lenses clean, hand tracking on, controllers out of reach.
- Recording: Meta button → Camera → Record video, landscape, highest resolution, microphone on. The knock of your hand on the table under the sound is part of it.
- Move slowly. Turn your head half as fast as feels natural. Hold each shot a beat before and after the action. Poke the panel slowly enough that the light on an item shows before it presses.
- Address: `https://or-6.github.io/thump/` (no `?debug`). For shot 1 do a fresh start: on the 2D page, Settings → *Start over*.
- Shots 4 and 5 use Kick Start on EASY, which is open from the start.
- For shot 7 you need a second player. A second Quest is best. If there isn't one, join from a laptop on the 2D page (its pads play into the band) and film the laptop with a phone.

## Voice-over

Short and dry. Leave gaps; the music does most of it.

- 0:00 (no words: a palm on the tray, a tap, the drums come up)
- 0:04 "This is Thump. You play it sitting down."
- 0:10 "Pick what's on the desk."
- 0:18 "Every note's in the scale. You can't hit a wrong one."
- 0:24 "Pick a song. The notes fall onto what plays them."
- 0:40 "Swap instruments halfway if you like. And the band waits for your last hit."
- 0:52 "Or make your own, a part at a time."
- 1:04 (no words: the silent bar, then the drop)
- 1:10 "Friends join from their own desks."
- 1:25 "Thump."

## Shots, in order

In the Shot column, quoted lines and capital-letter labels are exactly what the panel or the 2D page shows. The last column is the caption card.

| # | Time | Shot | How to get it | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:08 | A tray table, two hands. A palm rests, the panel appears over the back of the table ("Tap the desk to start"). One tap and the drums come up under the hands. A few hits on the kick, snare and hat; the soft band comes in under them | Fresh start, sit down, enter mixed reality | "Tap the desk." |
| 2 | 0:08–0:18 | A fingertip near the panel: Instruments lights and grows as it gets close, then presses. Six miniatures on the panel: drums, piano, marimba, guitar, congas, handpan; the one under the finger rises and turns. Poke the piano: its miniature flies to the desk and the piano unfolds there; a run on the ivory keys, the keys sinking | Straight on from shot 1 | "Pick what's on the desk." |
| 3 | 0:18–0:24 | Quick cuts: a pinch and a mallet appears, a roll on the marimba bars as they bounce; a chord on the guitar's neck and a strum over the soundhole; open tones and slaps on the congas; a run round the handpan | INSTRUMENTS on the panel, then each card, a few seconds each | "No wrong notes." |
| 4 | 0:24–0:40 | Piano out. SONGS on the panel, Kick Start, EASY, PLAY. The count-in, then notes falling onto the piano keys and bursting as they're hit, the band playing the rest. Hold close on the keys | Straight on from shot 3, with the piano out | "Play along with the band." |
| 5 | 0:40–0:52 | Mid-song, poke the DRUMS card: "Drums next", the drums come out at the next loop, "Find it, then join in", the notes start falling on the drums. Then "Solo!": the room above dims and a fast fill washes it in colour. At the end "Bring it home": the band holds, one big hit and they land on it with you. Then the results and "That was you" as your best two bars play back in gold | Straight on from shot 4 | "Swap mid-song." |
| 6 | 0:52–1:10 | MAKE A TRACK. "1/6  BOOM", "Hit when it glows", the lit bar copied, "Your turn: play anything", a bar of your own. Cut to TUNE: the piano comes out by itself. Cut to the last part, "Everything, in…": a silent bar, the riser, then the whole track drops in at once | MENU, then MAKE A TRACK | "Make it yours." |
| 7 | 1:10–1:25 | Two people at two desks. On the panel PLAY TOGETHER, START A BAND, "Code …: friends type it on the Thump page". The friend types it on their Thump page and taps *Join*, then "2 in the band" on the panel. PICK A SONG: it starts on both at once; the friend is a light across the desk in their instrument's colour that swells as they play, and their notes come from that side | See *Before you record* | "Play together, from anywhere." |
| 8 | 1:25–1:30 | End card | Title card | "or-6.github.io/thump" |

Shoot two or three takes of each. Keep your head still during the action and move only between shots. Don't stage the results: use whatever you get.

Feature chips (top right): hand tracking on shots 1–6, passthrough on 1 and 4, plane detection on 1 (the desk is found from a plane or a resting palm).

## Assembling it

The cut list (`docs/video-shots.json`) and the captions (`tools/video-cards.mjs`) follow the table above. Set each shot's `in`/`out` once you have the takes.

1. Copy the headset recordings into `artifacts/video/`, named as in `docs/video-shots.json`, and set each shot's `in`/`out` seconds.
2. Make the cards once (with the dev server up): `npx @iwsdk/cli browser run tools/video-cards.mjs` → `artifacts/video-cards/`.
3. `node tools/video-assemble.mjs docs/video-shots.json artifacts/video/thump.mp4` (needs ffmpeg). Title card, each shot with its caption and feature chip, end card, at 1920×1080, with the game's own sound.

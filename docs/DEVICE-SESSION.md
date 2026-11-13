# Device session 1: hit feel (Quest 3)

About 30 minutes. The goal is numbers I can tune from: is every slap heard, are there sounds you didn't play, how late does it feel, and the frame rate. Please read the numbers out (a voice memo is perfect) or type them into the table at the end.

## Before you start

- Quest 3 charged, lenses clean, **hand tracking on**, controllers put down out of reach.
- Sit at a real table (a desk is ideal), good light, the area in front of you clear. A laptop on the table is fine; put it to one side.
- In the Quest browser open: **https://or-6.github.io/thump/?debug=1**
- Press **Enter mixed reality** and allow what Quest asks for.

`?debug=1` puts a paper tag behind the kit (it appears once the kit is on the table). It reads, left to right:

| On the tag | What it means |
|---|---|
| `72 fps (min 70)` | frame rate now, and the lowest seen since the kit appeared |
| `3 hits/s` | hits in the last second |
| `last 0.84 m/s cross` | how fast your hand was coming down on the last hit, and how it was caught (`cross`: passed through the table plane; `stop`: stopped sharply just above it) |
| `4 planes` | room surfaces Quest gave the game |
| `table 6 mm` | how far the game has moved its idea of the table to match where your hands actually stop |
| `offset 0 ms` | timing correction applied to your hits |
| `out 12 ms` | audio output latency the browser reports |
| `q0` | quality level (0 is full quality; 1 or 2 means it shed effects to keep the frame rate) |
| `0.35/15/12` | strike settings in use: speed (m/s) / near-table band (mm) / stop sharpness (m/s²) |

## 1. Placement (2 min)

1. Note where the first felt pad appeared: on its own straight away (Quest found your table), or after you rested your palm flat.
2. Does the pad sit **on** the wood? Or float above it, or sink into it? Roughly how many centimetres?
3. Read: **planes**.

## 2. Ten medium slaps (2 min)

Slap the red pad (the kick) with a flat palm, ten times, about once a second, like slapping a desk.

- How many of the ten made a sound? Any that played twice?
- Read **last m/s** after three of them.

## 3. Ten soft taps (2 min)

Tap the red pad with one or two fingertips, gently, ten times.

- How many made a sound?
- Read **last m/s** for three of them, and whether it says `cross` or `stop`.

## 4. Ten hard slaps (1 min)

- How many sounded? Did any play twice? Read **last m/s** for two.

## 5. Things that must stay silent (3 min)

Any sound during these is a false hit; count them.

1. Lower a hand slowly onto the table and leave it there for 3 seconds.
2. Lean on the table on both forearms.
3. Reach across the table slowly to pick something up at the far side.
4. Pinch your thumb and finger together above the pad.
5. Drum your fingers lightly on the bare table beside the pads (this should give a quiet knock, not a drum).

## 6. Speed (1 min)

Alternate your hands on the two pads as fast as is comfortable for five seconds.

- Read **hits/s** while you do it. Did it keep up, or drop hits?

## 7. Latency, by feel (2 min)

Slap the kick in time with something steady (count out loud, or a metronome app on your phone).

- Does the drum sound land **with** your palm, **just after**, or **clearly late**?

## 8. The first ten minutes (10–12 min)

Play from the start as a judge would: the first pad, copying the grooves, the crowd, *Porch Step*, the tom, *Kitchen Clock*, the gong, the bandmate, *Call & Answer*. Say out loud anything that confuses you, anything you hit that didn't play, and anything that played that you didn't hit.

- Read **fps (min)** at the end of a song.
- After *Porch Step*: how many stars?
- Where did the gong appear: on your wall, or at the right edge of the table?

## 9. Timing check (2 min)

1. Exit to the page (take the headset off and on, or press the Meta button and go back to the browser page).
2. Open **Settings**, tick **Check my timing next time**, enter mixed reality again.
3. Tap the red pad with the 8 clicks.
4. Read **offset** on the tag afterwards (also shown in Settings on the page).

## 10. Headset off and on (1 min)

Mid-song, take the headset off for five seconds and put it back on.

- Did the song wait and come back with two clicks? Was the kit still in place?

## If a test goes badly

The strike settings can be changed from the address, no new build needed. Add them after `?debug=1`, for example `?debug=1&speed=0.28`:

| Problem | Try |
|---|---|
| Soft taps don't sound | `&speed=0.28` (default 0.35), then `0.22` |
| Hits don't sound when the pad seems to float above the table | `&near=25` (default 15), then `35` |
| Sounds you didn't play (ghosts) | `&speed=0.45`, or `&decel=18` (default 12) |
| A slap plays twice | `&latch=130` (default 90), or `&rearm=18` (default 12) |
| Fast drumming drops hits | `&latch=60&rearm=8` |

Tell me which settings felt best and I'll make them the defaults.

## Write it down here

| Test | Result |
|---|---|
| Placement: by itself or by palm? on the wood? planes | |
| Medium slaps heard / 10, doubles, m/s ×3 | |
| Soft taps heard / 10, m/s ×3, cross/stop | |
| Hard slaps heard / 10, doubles, m/s ×2 | |
| False hits (rest / lean / reach / pinch / finger drum) | |
| Fast roll hits/s, dropped? | |
| Latency feel (with / just after / late) | |
| fps (min) after a song, q level | |
| Porch Step stars; where the gong went | |
| Timing check offset (ms) | |
| Headset off/on: waited, two clicks, kit in place? | |
| Anything else that confused you | |

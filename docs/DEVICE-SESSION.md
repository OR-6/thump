# Device session: 45 minutes with the Quest 3

One session that does the work of two: feel first, tuned in the headset (no URL editing, no headset off), then everything else in order. Read the numbers out as you go; a voice memo is perfect. Each step says which numbers to read and what **good** looks like.

## Before the clock starts (5 min, not counted)

- Quest 3 charged, lenses clean, **hand tracking on**, controllers put down.
- **Room scan:** Settings → Physical space → Space setup. Mark the table, the walls, a door and a window (Quest asks you to label them). This is where the game's surfaces come from.
- Sit at a table near a wall, ideally with a door or window within a step.
- Quest Browser: **https://or-6.github.io/thump/?debug=1** → **Enter mixed reality** → allow what it asks (it asks once to use your room).
- Optional, for latency: prop your phone beside you to film in slow motion (240 fps) during step 1c.

### What you'll be reading

**The debug board** (dark glass behind the module, three lines):

| Line | Example | Means |
|---|---|---|
| 1 | `72 fps (min 70) · 3 hits/s · q0 · out 12 ms · offset 0 ms` | frame rate now (lowest), hits in the last second, quality level (0 = full), the browser's audio output latency, the timing correction |
| 2 | `14 planes · 9 meshes · 12 surfaces · table 4 mm · anchor yes · 0.35/18/12` | what Quest gave the game, how many became instruments, how far the table was nudged to match your hands, whether the kit is anchored, speed/near/stop thresholds |
| 3 | `last: p4 wall → gong z0 · stop 0.84 m/s · 3.20 m² hol 0 gl 0 soft 0` | the last surface hit, its label, its instrument and note, how the hit was caught (`cross`/`stop`) and how fast, its size, hollowness, glass, softness |

**The tuning page** (on the module): tap **◀ twice** for Settings, then **◀ twice again** for Tuning. The keys say what they do: **Prev · Done · Next · − · +**. Each change applies at once and is saved. The second line shows readouts from your last hits:

| Page | Readout | Lower it when… | Raise it when… |
|---|---|---|---|
| Speed (0.35 m/s) | last and softest hit speed | soft taps don't sound | sounds you didn't play |
| Stop (12 m/s²) | how many recent hits were stops | gentle hits on a pad that seems to float don't sound | resting or leaning makes sounds |
| Near (18 mm) | how far above the surface the last hit was caught | — | hits just above the surface don't count |
| Latch (120 ms) | doubles in the recent hits | fast drumming drops hits | one slap plays twice |
| Re-arm (22 mm) | doubles | fast repeats drop | one slap plays twice |
| Timing (0 ms) | the offset the songs learned, and fps | — | (set it from step 4 if songs feel early or late) |
| Defaults | | | tap + to reset everything |

Tune, then re-test the same ten hits. Read out the final values at the end.

## 1. Feel first: the table (15 min)

**1a. The first slap (1 min).** The module says *Hit anything*. Slap the table.
- Good: the kit draws itself (black pads with coloured rims, amber bars at the back), a tag "Your table is a drum kit", a drum sound **with** your palm.
- Read: line 2 (planes, meshes, surfaces, table mm, anchor).

**1b. Ten per pad (5 min).** Ten medium slaps on each pad (kick, snare, hat), about one per second; then ten soft fingertip taps on the snare.
- Read after each set: heard /10, doubles (tuning page, Latch readout), line 3 `m/s` and `cross`/`stop` for the last one.
- Good: medium 10/10 heard, 0 doubles; soft ≥ 8/10; softest speed shown ≥ 0.2 m/s.
- If not: tune (see the table above), repeat the set, and say what you changed.

**1c. Latency (2 min).** Ten slaps, filmed in slow motion if you can.
- Say: the drum lands **with** your palm, **just after**, or **clearly late**. From the film: frames from palm contact to the sound (at 240 fps, 1 frame ≈ 4 ms). Read `out … ms` on line 1.
- Good: feels "with"; under 50 ms filmed.

**1d. Across the table (2 min).** Slap the bare table far left, middle, far right, and the front edge.
- Good: deep (kick) → snare → bright (hat), a rim click at the edge.

**1e. Nothing you didn't play (2 min).** Rest a hand flat for 5 s; lean on the table; reach across it slowly; pinch near a pad.
- Good: silence. Any sound: say which, then raise Stop or Speed one step and repeat.

**1f. Fast (1 min).** Alternate both hands as fast as is comfortable for 5 s.
- Read: hits/s (line 1), doubles. Good: ≥ 8 hits/s, no missed beats you can hear.

**1g. Table bars (2 min).** Tap the amber bars along the back, left to right.
- Good: a tag "The bars are a balafon" on the first, notes climbing left to right.

## 2. Placement on two tables (5 min)

1. On the 2D page (take the headset's browser out of XR with the Meta button, or on your laptop at the same address): Settings → *Start over*. Re-enter.
2. Rest your palm flat on the table. Good: the kit appears under your hand within 2 s, pads flush with the wood (line 2 `table` within ±5 mm).
3. Do the same at a second table (kitchen, coffee table). Good: same.

## 3. The wall (4 min)

Stand or lean to a wall. Ten flat slaps, one per second.
- Good: the first one draws a ring on the real wall with a tag "Your wall is a gong", a long boom; ≥ 9/10 heard; the ring sits on the wall (not floating or sunk; say how far off).
- Read: line 3 for one slap (label, `stop`/`cross`, m/s).

## 4. The door, the window, the cupboard (6 min)

For each: ten hits (the window: gentle fingertip taps only).
- Good: the first hit draws its instrument on the real surface (door: marimba bars; window: glockenspiel keys; cupboard: tongue drum), the tag names it, 9/10 heard, bars and keys climb in pitch left to right.
- Read: line 3 (`hol`, `gl`, `soft`) once per surface. Say anything that should have been an instrument but had no glow.
- The door is the hero of the video: does it feel like your door became an instrument?

## 5. A full song (5 min)

Sit back down. With two instruments found, **▶** pulses: tap it. Play *Porch Step* to the end.
- Read at the end: stars, fps min (line 1), the Timing readout (Settings → Tuning → Timing).
- Say: did the light dots tell you what to hit? Did hits feel early, on, or late? If consistently late, set Timing to the learned value + the difference and play again.
- Good: 2–3 stars on a first play, fps min ≥ 70.

## 6. Headset off and on (2 min)

Mid-song, take the headset off for 5 s, then put it back on.
- Good: the song waited and comes back after two clicks; the kit and instruments are where they were (line 2 `anchor yes`).
- Then exit XR, re-enter: good: the kit and the instruments you found come back drawn, no slap needed.

## 7. JAM and the phone (6 min)

1. After Porch Step, tap **JAM**. The bandmate plays two bars on one of your instruments, then "Your turn": answer on the lit bars. Two rounds. Good: it gets busier when you answer well.
2. The module shows a 4-letter code. On your phone open **https://or-6.github.io/thump/**, type the code. Good: the phone shows a bass pad pulsing on the beat; your taps play bass in the headset, in time and in key.
- Read: how long from a phone tap to the sound (feel: tight / loose / late).

## 8. Before you take it off (2 min)

- Swaps: tap ◀ twice on the module, and if it says swaps are new, pinch and hold the door for a second. Good: it changes (marimba → glockenspiel → …) and a second pinch changes it again.
- Record 10 s with the Quest's own recorder (Meta button → Camera → Record video) while you hit the door, to check the video shows passthrough.
- Read out the tuning values you ended on (Settings → Tuning, Prev/Next through them).

## Write it down

| Step | Result |
|---|---|
| 1a planes / meshes / surfaces / table mm / anchor | |
| 1b medium heard /10 per pad, doubles, soft heard /10, softest m/s | |
| 1c latency feel; filmed frames; out ms | |
| 1d left → right → edge | |
| 1e false hits (rest / lean / reach / pinch) | |
| 1f hits/s, doubles | |
| 1g table bars named and climbing? | |
| 2 placement: time, table mm, second table | |
| 3 wall: heard /10, ring on the wall?, line 3 | |
| 4 door / window / cupboard: heard /10, instrument, line 3 | |
| 5 stars, fps min, timing feel, learned timing | |
| 6 song waited? kit in place? came back after re-entry? | |
| 7 jam busier? phone joined? phone latency feel | |
| 8 swap worked? recording shows passthrough? | |
| Final tuning: speed / stop / near / latch / re-arm / timing | |

## Filming, once the feel is right

The same address without `?debug=1`. Shortcuts:
- `?unlock=all` opens JAM, the tom, swaps and REC without playing the songs first (for the JAM shot).
- `?autoplay=1` plays itself (discovers your surfaces and hits every note on time); useful to frame a song shot without hands in view.
- Settings → *Start over* (2D page) for a clean "Hit anything" opening.
See `docs/VIDEO.md` for the shot list.

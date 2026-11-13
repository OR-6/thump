# Device session: the first 45 minutes on a Quest 3

Sit at a desk or a small table, the way you'd sit at a tray on a plane. Clear the space in front of you. Read the numbers out as you go (a voice memo is fine) and fill in the table at the end. Each step says what to do, what to read and what good looks like.

Until this session, everything has only been checked in the IWER emulator and in a two-page test on a laptop.

## Before the clock starts (5 min, not counted)

- Quest 3 charged, lenses clean, hand tracking on, controllers out of reach.
- Quest Browser: `https://or-6.github.io/thump/?debug=1` → *Enter mixed reality* → allow what it asks.
- For step 6: a second Quest, or a laptop with `https://or-6.github.io/thump/` open (no headset needed on that side).
- For step 1c, if you can: your phone propped up filming in slow motion (240 fps).

### What you'll be reading

The debug board is the dark panel behind the module. Three lines:

1. `fps (min) · hits/s · q · out ms · offset ms`. `q` is how much the game has turned down effects to hold the frame rate (0 is none). `out` is the browser's own audio output latency.
2. `planes · meshes · surfaces · table mm · speed/near/stop`, the last three being the hit thresholds in use.
3. `last:` the last hit, with its speed in m/s.

The tuning page (debug only): tap ◀ twice on the module for Settings, then ◀ twice again. Speed, Stop, Near, Latch, Re-arm, Timing, Defaults. The − and + keys change each one live, and it's saved. The second line shows readouts from your last hits.

## 1. Sitting down, the drums (8 min)

1a. First hit. Rest a palm on the desk. The module should turn up at the back with "Tap the desk". Tap the desk. Good: the drums come up under your hands (three pads, eight light bars behind), and the first tap sounds with your hand, not after it. Read line 2.

1b. Ten per pad. Ten medium slaps on each pad, then ten soft fingertip taps on the middle one. Read: heard out of 10, any doubles (the Latch readout on the tuning page), the speed on line 3. Good: 10/10 medium, no doubles, at least 8/10 soft. If not, tune and repeat, and write down what you changed.

1c. Latency. Ten slaps, filmed if you can. Say for each: with, just after, or late. From the film: frames from contact to sound (at 240 fps one frame is about 4 ms). Read `out ms` on line 1. Good: it feels with you, under 50 ms on the film.

1d. Nothing you didn't play. Rest both hands flat for 5 s, lean on the desk, reach across it, pick up a cup and put it down. Good: silence.

## 2. Piano, guitar, handpan (10 min)

The two arrows either side of the solid ▶ step through the instruments (the right one forward, ◀ back). The module shows its name and how to play it.

2a. Piano ("Every key fits"). Ten hits on each of the six keys with one finger, then walk up and down them. Then the wide pad on the left: each hit should play the next of three chords. Good: the key you meant every time, even on the two end keys; no neighbour sounding.

2b. Guitar ("Tap a square, then strings"). Left hand on each of the three chord pads (each plays a soft strum of its chord), then strum with the right in the band on the right: a hit or a brush down. Ten strums on each chord. Good: the strum plays the chord you picked last; a brush counts as one strum, not two.

2c. Handpan ("Tap anywhere on it"). The big middle note ten times, then each of the eight round it. Alternate hands round the rim and you should walk up the scale. Good: the note you meant, every time.

2d. Fit. Does each instrument fit your table without reaching? Say which one felt cramped or too far away.

## 3. NOTES and SOUND (3 min)

On the piano, guitar or handpan the last two keys on the module become NOTES and SOUND. Tap NOTES through Happy, Sad, Bluesy, Dreamy; tap SOUND through each instrument's sounds (piano: Grand, Vibes, Marimba, Glock; guitar: Nylon, Steel, Harp; handpan: Steel, Glass, Bells). Good: the module shows "Notes: Sad" or "Sound: Glock", a short run plays the change, and it sticks. Then step to the drums and back: the settings you left are still there.

## 4. Build a track (8 min)

When ▶ pulses with "Build a track?", tap it. For each part the module asks for something ("Pick the big boom"); hit it, then "Hit when it glows" to copy the lit bar, then "Your turn: play anything" for a bar of your own. The instrument for each part comes out by itself.

- Good: each part goes in and loops; the module says how it went in ("BOOM: yours", or "BOOM: 7 of 8" if you only copied part of it) and what's next; after the last part, "Everything, in…", a silent bar with a riser, then the whole track drops in together.
- Say: was it obvious what to do at each step? Where did you hesitate? How long did the whole build take?

## 5. Perform, with a switch (6 min)

On "Your track. Perform? ▶", tap ▶. Play what glows. "Go wild!" twice: hit anything, fast. Partway through, tap the arrow to the right of ▶ once: the module should say "Piano next" and then "Find it, then join in" as the piano comes out at the next loop. At the end, "Keep it going" with the lights down.

- Read: the results (notes played out of the total, stars, "On time" % or which side of the beat), and fps min on line 1 straight after.
- Good: the lights land on the beat, the switch lands on the next loop with a bar to find the piano, the frame rate holds.

## 6. Playing together (7 min)

Take the headset off. On the Quest's 2D page tap *Start a band*; you get a 4-letter code. On the second Quest or the laptop, type the code and tap *Join*. Both pages should say "2 in the band". Enter mixed reality on the Quest (and on the second Quest if you have one).

- Play on one side, listen on the other. On a laptop, tap the pads on the page.
- Good: the friend's notes are heard, a little to one side, and in time with how they were played. Note how late they feel. Check that nothing doubles or echoes back.
- Say whether the code was easy to read and type.

## 7. Numbers, and the headset off and on (3 min)

7a. Ten slaps while a track runs; read line 1 (fps, min, `out ms`, `offset ms`).

7b. Take the headset off for 5 s mid-track and put it back on. Say what happened. Then exit and re-enter mixed reality: is the module back where it was on the desk?

## Write it down

| Step | Result |
|---|---|
| 1a planes / meshes / table mm, first tap with you? | |
| 1b heard /10 per pad, doubles, soft /10 | |
| 1c latency feel, frames on film, out ms | |
| 1d false hits from resting, leaning, reaching | |
| 2a piano: right key /10, end keys, chord pad | |
| 2b guitar: chord pads, strums /10, brush counted once? | |
| 2c handpan: middle /10, rim notes, walking the scale | |
| 2d fit on the table, what felt cramped | |
| 3 NOTES / SOUND changed and stuck? | |
| 4 build: time, where you hesitated, did the drop land? | |
| 5 notes played, stars, On time %, switch landed?, fps min | |
| 6 band: joined?, friend's notes heard, how late, any echo | |
| 7a fps / min / out ms / offset ms | |
| 7b off and on, back where it was? | |
| Final tuning values | |

Frame rate: [FILL from line 1]. Hit-to-sound latency: [FILL from 1c].

## Filming, once the feel is right

The same address without `?debug=1`. `?unlock=all` opens everything at once (the tom, JAM, loops). `?autoplay=1` builds and performs by itself, for framing shots. Settings → *Start over* on the 2D page for a clean start. Shot list: `docs/VIDEO.md`.

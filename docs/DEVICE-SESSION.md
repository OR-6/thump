# Device session: the first 45 minutes on a Quest 3

Sit at a desk or a small table, the way you'd sit at a tray on a plane. Clear the space in front of you. Read the numbers out as you go (a voice memo is fine) and fill in the table at the end. Each step says what to do, what to read and what good looks like.

Until this session, everything has only been checked in the IWER emulator, by unit tests and in a two-page band test on a laptop.

## Before the clock starts (5 min, not counted)

- Quest 3 charged, lenses clean, hand tracking on, controllers out of reach.
- Quest Browser: `https://or-6.github.io/thump/?debug=1` → *Enter mixed reality* → allow what it asks.
- For step 6: a second Quest, or a laptop with `https://or-6.github.io/thump/` open (no headset needed on that side).
- For step 1c, if you can: your phone propped up filming in slow motion (240 fps).

### What you'll be reading

The debug board is the dark slab behind the panel. Three lines:

1. `fps (min) · hits/s · q · out ms · offset ms`. `q` is how much the game has turned down effects to hold the frame rate (0 is none). `out` is the browser's own audio output latency.
2. `planes · meshes · surfaces · table mm · speed/near/stop`, the last three being the hit thresholds in use.
3. `last:` the last hit, with its speed in m/s.

The tuning page (debug only): SETTINGS on the main menu, then poke SLOWER SONGS twice, about half a second apart (the second poke undoes the first). It steps through Speed, Stop, Near, Latch, Re-arm, Timing, Defaults: ◀ and ▶ pick one, − and + change it live, and it's saved. Done closes it. The second line shows readouts from your last hits.

## 1. Sitting down, the drums (8 min)

1a. First hit. Rest a palm on the desk. The panel should appear above the back of the desk, leaning toward you, with THUMP and "Or just tap the desk". Tap the desk. Good: the drums come up under your hands (kick, snare, hi-hat, light bars behind) and the first tap sounds with your hand, not after it. Read line 2.

1b. Ten per drum. Ten medium slaps on the kick, the snare and the hat, then ten soft fingertip taps on the snare. Read: heard out of 10, any doubles (the Latch readout on the tuning page), the speed on line 3. Good: 10/10 medium, no doubles, at least 8/10 soft. If not, tune and repeat, and write down what you changed.

1c. Latency. Ten slaps, filmed if you can. Say for each: with, just after, or late. From the film: frames from contact to sound (at 240 fps one frame is about 4 ms). Read `out ms` on line 1. Good: it feels with you, under 50 ms on the film.

1d. Nothing you didn't play. Rest both hands flat for 5 s, lean on the desk, reach across it, pick up a cup and put it down. Good: silence, and nothing pressed on the panel.

1e. The band. Keep playing a simple beat. Good: a soft band (chords and bass) comes in under you within a beat or two. Stop for two bars: it drops out.

## 2. The panel (4 min)

2a. Poke. Bring a fingertip slowly toward FREE PLAY. Good: it lights as your finger gets within a few centimetres, and presses (with a click) once your fingertip goes through the face, not before. Press BACK, then a few other tiles. Count presses you meant against presses you got.

2b. Pinch. Pinch on an item instead of poking it. Good: it presses the item you were on, and only that one.

2c. Reach. Is the panel easy to see and reach without leaning? Does your arm cross the instrument to get to it? Say what you'd move.

## 3. The instruments (10 min)

FREE PLAY, then a card each. Every one should unfold onto the desk when picked. Say whether each sounds with your hand.

3a. Piano. Ten hits on each of the six ivory keys with one finger, then walk up and down them. Each key should sink when hit. Then the wide ebony chord key on the left: each hit plays the next of three chords. Good: the key you meant every time, even the two end keys; no neighbour sounding.

3b. Marimba, bare hands. Ten hits on each of the eight bars. The bars should bounce. Good: the bar you meant, no doubles.

3c. Marimba, with a mallet. Pinch in each hand: a mallet should appear in it. Play the bars with the mallet heads. Good: the head is what strikes (not your fingertip), the bar you aimed at plays, and letting go of the pinch puts the mallet away.

3d. Guitar. Left hand on each of the three chord positions on the neck, then strum over the soundhole with the right: a hit or a brush down. Ten strums on each chord. Good: the strum plays the chord you picked last; a brush counts as one strum, not two.

3e. Handpan. The big middle note ten times, then each of the eight round it. Alternate hands round the rim and you should walk up the scale. Good: the note you meant, every time.

3e2. Congas. The middle of each drum ten times, then the edge ten times. Good: the middle sounds open and round, the edge sharper (a slap), low drum on the left. On the piano (outside a song), hit a small black key: you should hear the two white keys either side of it.

3f. Settings and fit. On the piano's settings page, change the notes (HAPPY, SAD, BLUESY, DREAMY), a sound and LOWER or HIGHER; PLAY IT and check you hear the change. Switch to the drums and back: it should still be set the way you left it. Does each instrument fit your table without reaching? Say which one felt cramped or too far away.

## 4. A song on Easy, with a switch (7 min)

Put the piano out. SONGS, Kick Start, EASY, then PLAY. After the count-in, notes fall onto the keys that play them.

- Watch: each note falls onto the exact key and lands on the beat. Hit it and it bursts.
- Partway through, poke the DRUMS card. The panel should say "Drums next", the drums come out at the next loop, and "Find it, then join in" gives you a bar before the notes start falling on the drums.
- "Go wild!" twice: hit anything, fast. The room above eye level should dim (your hands and the desk stay lit) with soft colour, never flickering. On Easy the notes keep falling to the end.
- "Last one!": the band holds its chord and your instrument pulses. Wait two seconds, then hit it: the band should land on your hit.
- Read: the results (stars, notes played out of the total, "On time" % or which side of the beat, the song and your best run), "That was you" as your two best bars play back with your notes in gold, and fps min on line 1 straight after.
- Good: the notes land on the beat and on the right target, the switch lands at the next loop with a bar to find the drums, the frame rate holds.

## 5. Make a track (7 min)

MENU, then MAKE A TRACK. For each part the panel says what to do ("Hit a drum for BOOM"); hit it, then "Hit when it glows" to copy the lit bar, then "Your turn: play anything" for a bar of your own. The instrument for each part comes out by itself.

- Good: each part goes in and loops; the panel says how it went in ("BOOM: yours", or "BOOM: 7 of 8" if you only copied part of it) and what's next; after the last part, "Everything, in…", a silent bar with a riser, then the whole track drops in together.
- Then perform it. In the emulator only the autoplayer has started this, and the build page shows just BACK A PART and STOP, so write down how you got it going (or that you couldn't).
- Say: was it obvious what to do at each step? Where did you hesitate? How long did the whole build take?

## 6. Playing together (6 min)

On the panel: PLAY TOGETHER, START A BAND. The panel shows a 4-letter code. On the second Quest's Thump page (or the laptop), type the code and tap *Join*, then enter mixed reality on the second Quest if you have one. The panel should say "2 in the band".

- PICK A SONG and start one. Good: it starts for both on the same beat. Each side should hear the other's part from the friend, a little to one side, not from its own band.
- Play on one side, listen on the other. On a laptop, tap the pads on the page. Note how late the friend's notes feel. Check that nothing doubles or echoes back.
- Say whether the code was easy to read and type. LEAVE at the end.

## 7. Numbers, and the headset off and on (3 min)

7a. Ten slaps while a song runs; read line 1 (fps, min, `out ms`, `offset ms`).

7b. Take the headset off for 5 s mid-song and put it back on. Say what happened. Then exit and re-enter mixed reality: are the instrument and the panel back where they were on the desk?

## Write it down

| Step | Result |
|---|---|
| 1a planes / meshes / table mm, first tap with you? | |
| 1b heard /10 per drum, doubles, soft /10 | |
| 1c latency feel, frames on film, out ms | |
| 1d false hits or panel presses from resting, leaning, reaching | |
| 1e band came in? dropped out after two bars? | |
| 2a poke: presses meant / presses got, lit before pressing? | |
| 2b pinch pressed the right item? | |
| 2c panel easy to see and reach? | |
| 3a piano: right key /10, end keys, chord key | |
| 3b marimba bare hands: right bar /10, doubles | |
| 3c marimba mallet: appeared?, head strikes?, right bar /10 | |
| 3d guitar: chord positions, strums /10, brush counted once? | |
| 3e handpan: middle /10, rim notes, walking the scale | |
| 3e2 congas: middle vs edge heard?, low left / high right; piano black key plays two notes? | |
| 3f settings heard and kept? fit, what felt cramped | |
| Go wild!: room above eye level dims, tray and hands stay lit?, any flicker? | |
| tray: panel top row reachable without touching the seat ahead? any presses you didn't mean? | |
| band: friend's light across the desk, sound from their side? | |
| 4 notes on target and on the beat?, stars, notes played, On time %, switch landed?, fps min | |
| 5 build: time, where you hesitated, did the drop land?, how you performed it | |
| 6 band: joined?, same beat?, friend's notes heard, how late, any echo | |
| 7a fps / min / out ms / offset ms | |
| 7b off and on, back where it was? | |
| Final tuning values | |

Frame rate: [FILL from line 1]. Hit-to-sound latency: [FILL from 1c].

## Filming, once the feel is right

The same address without `?debug=1`. `?unlock=all` opens the tom and the other extras at once. `?autoplay=1` plays by itself, for framing shots. Settings → *Start over* on the 2D page for a clean start. Shot list: `docs/VIDEO.md`.

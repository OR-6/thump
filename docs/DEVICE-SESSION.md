# Device session 1: your room as an instrument (Quest 3)

About 30 minutes. What we need to learn: does the Quest give the game your room's surfaces (and the room mesh), do your wall, door and window take hits, does the door-as-marimba feel magical, and is the table kit tight. Please read the numbers out (a voice memo is perfect) or fill the table at the end.

## Before you start

- Quest 3 charged, lenses clean, **hand tracking on**, controllers put down.
- **Room scan:** Settings → Physical space → Space setup. Scan the room you'll play in, and make sure the table, the walls, a door and a window are marked (Quest asks you to label furniture). This is what gives the game your surfaces.
- Sit at a table near a wall, ideally with a door or window you can reach by leaning or standing.
- In the Quest browser open: **https://or-6.github.io/thump/?debug=1** and press **Enter mixed reality**. Allow what Quest asks for (it asks once to use your room).

`?debug=1` puts a dark board behind the module (the little black panel at the back of the table). Three lines:

| Line | What it says |
|---|---|
| 1 | `72 fps (min 70) · 3 hits/s · q0 · out 12 ms · offset 0 ms`: frame rate now and lowest, hits in the last second, quality level (0 = full), the audio output latency the browser reports, the timing correction |
| 2 | `14 planes · 9 meshes · 12 surfaces · table 4 mm · 0.35/18/12`: room planes and room-scan meshes the Quest gave the game, how many became playable surfaces, how far the game moved its idea of the table to match your hands, the strike settings |
| 3 | `last: p4 wall → gong z0 · stop 0.84 m/s · 3.20 m² hol 0 gl 0 soft 0`: the last surface hit, its room-scan label, the instrument it became, which note, how the hit was caught (`cross` / `stop` / `late`) and how fast, the surface's size and measured hollowness, glass and softness |

## 1. What the Quest gives us (2 min)

1. Read line 2: **planes** and **meshes**. (0 meshes means the room mesh isn't reaching the browser; planes still work.)
2. Look around the room: every surface the game can play has a faint white outline and sheen. Which of your surfaces have one (table, each wall, door, window, cupboard, sofa)?

## 2. The table (5 min)

1. The module says **Hit anything**. Slap the table. The kit should draw itself: three black pads with coloured rings, a row of slim amber keys behind them, and a tag "Table · drum kit".
2. Ten medium slaps on the pads, about one a second: how many sounded? Any that played twice? Read **last m/s** for three.
3. Ten soft fingertip taps: how many sounded? Read m/s and `cross`/`stop` for three.
4. Slap the bare table to the far left, the middle, the far right, and the front edge: does it go deep (kick) → snare → bright (hat), with a rim click at the edge?
5. Rest a hand flat for three seconds, lean on the table, reach across it slowly: any sounds you didn't play?
6. Alternate both hands as fast as is comfortable for five seconds: read **hits/s**.
7. Latency by feel: does the drum land **with** your palm, **just after**, or **clearly late**?

## 3. The room (10 min)

For each surface you can reach (lean or stand up): wall, door, window, cupboard, sofa, anything else with a sheen.

1. Hit it once with a flat hand (gently on glass). Its instrument should draw itself on the real surface with a tag naming it (for example "Door · marimba", "Wall · gong", "Window · glockenspiel").
2. Did the first hit register? If not, how many tries?
3. Read **line 3** and say it out loud (the label, the instrument, `hol`, `gl`, `soft`).
4. Play it: on a marimba or glockenspiel, are the bars or keys where you'd expect, and do they climb in pitch? Does it feel like *your door* has become an instrument?
5. Anything that should have been an instrument but had no sheen?

## 4. A song (5 min)

1. With two instruments found, the module's **▶** key pulses. Tap it.
2. Light dots fly from the module to the pad, bar or key that will play next; it lights a beat ahead. Play along.
3. Stars at the end? What did it cast where (which song part went to which surface)?
4. Read **fps (min)** at the end.

## 5. Headset off and on (1 min)

Mid-song, take the headset off for five seconds and put it back on. Did the song wait and come back with two clicks? Was the kit still in place?

## If a test goes badly

Strike settings can be changed from the address (no new build). Add them after `?debug=1`, for example `?debug=1&speed=0.28`:

| Problem | Try |
|---|---|
| Soft taps don't sound | `&speed=0.28` (default 0.35), then `0.22` |
| Hits don't sound when the pad seems to float above the table | `&near=28` (default 18) |
| Sounds you didn't play | `&speed=0.45` or `&decel=18` (default 12) |
| A slap plays twice | `&latch=160` (default 120) or `&rearm=30` (default 22) |
| Fast drumming drops hits | `&latch=90&rearm=15` |

## Write it down here

| Test | Result |
|---|---|
| planes / meshes (line 2) | |
| Surfaces with a sheen | |
| Table: kit drew itself? medium slaps heard / 10, doubles, m/s ×3 | |
| Soft taps heard / 10, m/s ×3, cross/stop | |
| Left → right → edge: kick, snare, hat, rim? | |
| False hits (rest / lean / reach) | |
| Fast hits/s | |
| Latency feel | |
| Each room surface: hit registered? tries, label → instrument, hol/gl/soft | |
| Door/window: bars/keys where expected? magical? | |
| Song: stars, what went where, fps (min) | |
| Headset off/on | |
| Anything confusing | |

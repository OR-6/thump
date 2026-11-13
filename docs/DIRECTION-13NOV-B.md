# Direction B (13 Nov, afternoon): your desk is the drum machine

This replaces DIRECTION-13NOV.md and DESIGN.md wherever they disagree. Read it whole before touching code.

## What went wrong

The build chased the big surfaces: walls, doors, windows, cupboards. Those fail the brief three ways. A judge sits at a desk and the door is across the room (the airplane-seat test says everything within 2 ft). Quest's room scan only sees furniture, so "every surface" became "every wall". And the small stuff, the mug, the book, the keyboard, the phone, the bottle, the knee under the desk, is exactly what a person at a desk reaches for first, and it barely played. The game has to be built the other way round: start from what is in arm's reach of a seated player and treat the room's big surfaces as a bonus.

## The idea in one line

**Everything within reach of your hands is a pad.** Your desk is the drum machine; your mug, book, bottle, keyboard, phone, laptop lid, chair arm and knees are its pads. You find them by hitting them. The game teaches you to play beats on your own stuff.

That is the fantasy of a finger-drumming controller (an MPC, a Maschine, an SP-404) with your real objects as the pads. It is impossible without passthrough (you cannot see your mug) and without hand tracking (your fingers are the sticks). It holds up in any room because nothing depends on the room being scanned: your hands are the sensor.

## How a thing becomes a pad: touch, one hit, not two

Quest will not tell us where a mug is. The hand does. A hand coming in fast and stopping dead where no known surface is has hit something. That is already in `src/room/touch.ts`; three changes:

1. **One hit plays.** The first stop on a new spot plays at full volume, draws a ring there at that height, and shows a tag. Two taps to "find" is a dead first impression. A thing that is never hit again within 20 s fades out (that was a hand stopping in the air; one sound, no harm). The second hit within 6 cm confirms it and it is saved with the desk.
2. **Shape from touches, not a label.** Every stop on the same thing adds a point and an approach direction. Coming down sets its top height; coming from the side sets a side face and a width. The pad's footprint and height grow from that. No object recognition anywhere; the mesh, where Quest exposes it, only speeds this up.
3. **Voice from shape and feel.** Decided by physics every time, refined as the shape fills in:

| What the touches say (height above the desk, extent, how the stop felt) | Pad |
|---|---|
| the desk itself, by zone | **kit**: left kick, centre snare, right hat, front edge rim; tom when unlocked |
| under 4 cm, small (a phone, a coaster, a notebook) | **clave / wood block**, higher the smaller |
| under 4 cm, wider than 25 cm (a keyboard, a tray) | **keys**: a row of pitched pads across it, low left to high right |
| 4 to 12 cm, round-ish (a mug, a cup, a bowl) | **bell**, lower the wider; open-topped reads as a bowl |
| 12 to 35 cm, narrow (a bottle, a can, a candle) | **chime / tubular**, lower the taller |
| a vertical face in front of you, thin and above the desk (a laptop lid, a monitor) | **ride / glass**, soft taps only, never asked to hit hard |
| soft stop, the hand sinks (a cushion, a sleeve, a bag) | **shaker / brush** |
| below the desk, in front (your knees, your thighs) | **congas**: left low, right high |
| below the desk, at your sides (the chair arms) | **cowbell / rim** |
| two palms meeting | **clap** |
| a wall or door within reach (bonus, never required) | gong, marimba, as before |

Two things of the same kind never sound the same (a second mug rings a different note; a second book is a slit drum). Harder hits are louder and brighter; the stop's sharpness colours the attack. Every pad keeps a tiny per-object seed so your bottle is yours.

## Why it is a game, not a lookup

Finger drumming on real objects is already fun; the game's job is to give it shape, pressure and reasons. Five things, all within reach:

1. **Find (minute 0 to 2).** The module says *Hit something.* The desk plays the kit. Each new thing you hit lights up with a ring and a one-word tag (*Bell*, *Block*, *Keys*). The module counts: *3 things found*. Tracks unlock by things found, so finding is progress, not a tutorial: track 1 needs the desk, track 2 needs one thing, track 3 needs three, track 5 needs five. *Find 2 more things* is the only gate in the game, and it sends you looking round your own desk.
2. **Tracks (the core).** A track is a chart in roles (KICK, SNARE, HAT, PERC 1 to 4, KEYS, BASS). On start the game casts roles onto your pads: the desk zones take the kit, the smallest highest thing takes the hat if you have no hat zone, found things take PERC in the order found, a keyboard or the desk's front edge strip takes KEYS, your knees take BASS. Notes fly from the module to the exact object, light its ring a beat ahead, and you hit it. Forgiving windows, no fail, stars at the end. Every eight bars a **FILL** window opens: two bars where anything you hit counts, scored on density and on-grid-ness. After the chart the track carries on for four bars with no notes shown (*keep it going*): hold the groove from memory. Three stars needs a good fill and a held groove, not just accuracy.
3. **Jam.** The bandmate (rules, named honestly) takes one of your pads, plays a two-bar call, you answer, it gets busier when you are good and simpler when you struggle. It can also swap pads with you mid-jam (*your turn on the bell*).
4. **Loop.** REC records four bars of anything, layers up to three, plays under free play. A loop you keep is a "beat", saved with the desk, named by the day.
5. **Cards.** Between tracks the module deals one short optional challenge for a star: *Hat on your mug for one bar.* *Find something that rings.* *Both hands, two different things.* *Play the chart with your eyes shut* (no lights). They are small and they push you to touch everything on the desk.

Progression that shows between sessions: the desk map (every pad, saved under the anchor, drawn again next time), the track list with stars and gold, the daily track, kept beats, unlocks (tom, jam, loops, swaps, cards). New desk, new pads: the map fills in per room.

## The ten minutes a judge gets

0:00 enter, passthrough, the module settles at the back of the desk: *Hit something.* 0:10 slap the desk: kick, the three LED rings appear. 0:20 hit the coffee cup: a ring draws round it at its height, *Bell*, a clean ting. 0:40 the pen, the notebook, the laptop lid: *Block*, *Block*, *Ride*. Module: *4 things found. Track 2 ready.* 1:00 PLAY: a count-in, notes fly to the cup and the notebook, a fill window, keep it going, stars. 3:00 track 3 asks for one more thing: the knee under the desk, congas. 5:00 JAM: the bandmate takes the cup. 7:00 a card: *Hat on your mug for one bar.* 8:00 REC a loop. 10:00 the desk map on the module, five tracks, two gold. Nothing in the ten minutes is further than a forearm away.

## Look and voice

Professional sampler hardware, not a concert programme. Matte black module, mono display, numerals in a tabular face, one accent colour per pad family, LED rings on objects that flash by strength. The desk kit is three slim rings and a strip, not drawn drums. Pads on objects are a thin ring at the object's top height with a short vertical tick showing its height; the tag is one word.

Copy rules: short, plain, present tense, no poetry, no "your room is an orchestra", no "tonight". Name what the player does or sees, in six words or fewer in the headset. Track names sound like a sample pack, not a novel: *Kick Start*, *Two Step*, *Boom Bap 88*, *Lowrider*, *Night Shift*, *Daily*. The 2D page says what it is in one line, *Your desk is a drum machine*, shows real passthrough stills of a cup with a ring round it, and has one button.

Ban list: "orchestra", "conducted", "tonight", "in the pocket", "nearly there", "once more?", song names made of two cosy nouns, any line a person would not say out loud.

## Order of work

1. Touch pads: one-hit play, shape from touches, the voice table above, fade-out, confirm, save under the anchor. Unit tests on synthetic hand paths (mug, book, keyboard, bottle, knee, mid-air stop). Debug line: thing id, height, extent, voice, why.
2. Casting by role onto pads; gate tracks by things found; the five tracks rewritten and renamed; FILL windows and keep-it-going scoring; cards.
3. Copy pass over every string; the module display; the 2D page.
4. Bandmate pad-swap; loops as kept beats; desk map on the module.
5. Device session script around the desk, not the door. Video shot list: the cup getting its ring is shot one.

Walls, doors and windows stay in the code as bonus pads; nothing asks for them, no track needs them, the landing does not lead with them.

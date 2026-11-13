# Thump: the game

This is the single source for what the game is. DIRECTION-13NOV-B.md keeps the touch mechanics (how a thing becomes a pad) and the copy rules; OPERATING-13NOV.md is how to work. Where anything older disagrees with this file, this file wins.

## The idea

**You build a music machine out of the stuff on your desk, then you play it live.**

Your mug, your notebook, your keyboard, your bottle, your phone, your knees: each one becomes a part of a track. You pick which object plays which part by hitting it, you teach it its part by playing two bars with light guidance, and it loops. Six parts later your desk is playing a song by itself, rings flashing on your real objects in time, and you perform on top of it for stars. That is a thing you can only do with passthrough and hand tracking, it makes a stranger's desk a different instrument from yours, and it is the shot that makes people stop scrolling: a coffee cup lighting up on the two and four.

Why it is a game and not a toy: it has a goal (finish the machine), a creative act (which object plays what, how you play the part), a skill act (the live performance), a visible payoff (the machine running), and a reason to return (more tracks, your machines saved per desk, a daily). Why nonmusicians love it: every part is quantised to the groove and in key, so it always sounds good; the skill shows in the performance, not in the building. Why drummers love it: the performance, tight %, fills, dynamics.

Three modes, each one sentence:
- **Play (free play):** hit anything, it sounds; change any object's sound with ◀ ▶ or a pinch-hold; the band follows your tempo.
- **Build:** a track is six parts; assign each to an object by hitting it, record it with light guidance, it loops; watch the machine run.
- **Perform (song mode):** the machine plays, panels light on your objects, you hit them on the beat; fills, hold the groove, stars.

## The first ten minutes (what a judge plays)

| Time | What happens | Why |
|---|---|---|
| 0:00 | Enter. Passthrough. The module settles at the back of the desk. Display: *Hit something.* | no text to read |
| 0:10 | Slap the desk: kick, three slim LED rings appear on the desk (kick, snare, hat). Hit the coffee cup: a ring draws round it at its height, *Bell*, a clean ting. Hit the notebook: *Block*. The laptop lid: *Ride*. | the toy: everything plays |
| 0:45 | Module: *Build a track?* PLAY pulses. Tap it. | the goal |
| 0:50 | **Build, part 1 of 6: KICK.** *Hit what plays the kick.* You slap the desk left. Two bars of guidance lights pulse on that ring; you play along; it loops, quantised. The desk is now kicking by itself. | first part in 20 s |
| 1:20 | **Part 2: SNARE.** You pick the notebook. Record. Now kick and snare run. **Part 3: HAT.** The cup. **Part 4: PERC.** *Find something new.* The bottle: *Chime*. **Part 5: KEYS.** The keyboard becomes eight pitched keys; the guidance shows a four-note hook; you play it. **Part 6: BASS.** Under the desk: your knee, congas tuned low. | six objects, found because the game needed them |
| 3:30 | **The machine runs.** Every ring lights in time, the whole desk plays the track, the module says the track's name and *Perform?* You watch it for a bar. This is the moment. | payoff |
| 3:45 | **Perform.** The machine drops to a bed; notes fly to the real objects; you hit the lit panel. Every eight bars a FILL window: two bars where anything you hit counts. Then four bars with no lights: hold the groove. Stars, tight %. | the skill act |
| 6:00 | Results: 2 stars, *Tight 71%*, a card dealt: *Swap the hat to something that rings.* Track 2 unlocked: eight parts. | growth |
| 6:30 | Back in Play. JAM: the producer (the rule-based bandmate) takes the cup and trades two-bar phrases. REC catches a loop you like; it is kept as a beat. | depth |
| 9:00 | The desk map on the module: six rings with names, two tracks, one gold, one kept beat, a streak of 1. | reason to come back |

Nothing in the ten minutes is further than a forearm away. Nothing needs a room scan. Every step is one gesture: hit.

## Build mode in detail

- A track has **parts** in order: KICK, SNARE, HAT, PERC, KEYS, BASS for track 1; later tracks add PERC 2, CLAP, a second KEYS, up to eight.
- **Assign:** *Hit what plays the kick.* Any pad qualifies; the module suggests by physics (a bell for the hat, a low thing for the bass) with a soft glow on the suggestion, but the player decides. Hitting a brand-new object both finds it and assigns it. The desk's three rings can take any drum part.
- **Record:** two bars, guidance lights pulse the part's pattern on that ring one beat ahead, the player plays, hits are quantised to the grid and velocity kept. Sloppy still sounds right. Missing hits are filled from the pattern at low volume so a part is never broken. Tap the ring once more to re-record; ◀ to go back a part.
- **Pitched parts:** KEYS on a keyboard or any wide low thing (eight keys across it), or on the desk's front strip if nothing qualifies. The guidance shows which key; all keys are in the track's key, so wrong keys are still consonant.
- **The machine runs** when every part has been recorded: all parts at full volume, rings lighting, two bars, then *Perform?* The player can stay and watch, change a part, or add the producer's part (it picks an unused object and plays something that fits).
- Time to build track 1: three minutes for a first-timer, under two for a returner.

## Perform mode in detail

- The machine plays at bed volume; the chart shows the parts the track wants you to play live (track 1: kick, snare, hat on the desk and the cup; later tracks hand you more). Notes travel from the module to the real object and light its ring a beat ahead. Windows ±60/±120 ms (×1.5 in slow mode). No fail state.
- **FILL** every eight bars: two bars, free, scored on density and on-grid fraction; a good fill lights the whole desk.
- **Hold it:** after the chart, four bars with no lights; the judge keeps scoring. The applause meter on the module is the only feedback.
- **Results:** stars at 70/90 %, *Tight %* (100 minus the median timing error in ms, floored at 0), gold at full tempo with three stars, dynamics star when accented notes are hit harder.
- **Encore:** the whole performance plays back on the objects, rings in sequence. A three-star performance is kept as a beat.

## Play mode in detail

- Always on outside Build and Perform. Every pad plays; new objects are found on first hit (DIRECTION-13NOV-B.md, the touch rules). Physics picks the default sound.
- **Change the sound:** hit an object, the module shows *Cup · Bell* with ◀ ▶; step through the whole bank (kit pieces, percussion, bells, keys, bass, synth, vocal chops). Or pinch-hold the object to cycle. Saved with the desk.
- **Tempo follow:** four even hits and the band drops in under you; stop and it leaves.
- **REC:** four bars, three layers, kept as a beat with one tap.
- **JAM:** the producer claims a pad, calls, you answer; it gets busier when you are good, steals your favourite pad once a jam and hands you one you ignore.

## Progression

- **Tracks** unlock in order; each needs more parts, so more objects. Track 1: six parts. Track 2: seven. Track 3: eight, with a clap (your hands). Track 4: two pitched parts. Track 5: everything, with a fill every four bars. Plus a **daily** generated from the pads you have.
- **Cards** after each performance: one short optional challenge for a star (*Hat on your mug for one bar*, *Eyes shut*, *Swap the hat to something that rings*, *Both hands, two things*, *Build track 1 again in under 90 s*).
- **The desk map:** every pad, its sound and its part, saved under the anchor per room; drawn again next session. New desk, new machine.
- **Kept beats:** your machines and three-star performances, named by the day, playable from the module, playable to a friend.
- **Streak:** days played; a new card each day.
- **Unlocks:** the tom (track 1), JAM and swaps (track 1), REC (track 2), the producer's part (track 2), cards (track 1), film mode always.

## Social and agentic, honestly

- A friend's phone joins with a four-letter code and becomes a part the desk does not have (a bass or a pad on the screen); the headset plays it in key.
- A second pair of hands at the same desk is tracked; the left half of the desk is theirs in Perform; they take fills in turn.
- The producer is a rule-based musical agent and is named as such everywhere: listens to which pads you play, when and how hard; answers; simplifies when you struggle; adds a part that fits.

## Sound

Recorded one-shots (CC0, the Versilian library already in the repo) with two or three loudness layers, round-robins and per-object detune so two cups differ; the modal synth as the fallback and the body of the bells; everything quantised and in key in Build; a room reverb; a soft limiter. Palm versus fingertip on the desk is open versus closed (kick/rim, open/closed hat). Harder is louder and brighter everywhere.

## Look

Sampler hardware. Matte black module, mono display with tabular numerals, five rubber keys. Pads are thin LED rings at an object's top height, one accent colour per sound family, flashing by strength, with a one-word tag on the first hit. The desk's kit is three rings and a key strip. The machine running is the hero visual: rings pulsing in time across real objects. No drawn drums, no felt, no confetti; celebrations are light sweeps across the rings.

## Copy

Rules and ban list in DIRECTION-13NOV-B.md. The whole headset vocabulary: *Hit something. Bell. Block. Keys. Chime. Build a track? Hit what plays the kick. Play along. Looping. Find something new. Perform? Fill! Hold it. Tight 71%. Again? Swap the hat to something that rings.* Track names like a sample pack: *Kick Start, Two Step, Boom Bap 88, Lowrider, Night Shift, Daily.* Landing: *Your desk is a drum machine.* One button.

## What only the device can prove

Hit feel on a cup and a keyboard, false stops in mid-air, latency, knees under the desk, the laptop lid. The device script is rewritten around the desk: the user builds track 1 at their own desk and reads the debug line for each object (height, extent, voice, why, latency).

## Order of work

1. Touch pads: one-hit play, shape from touches, the voice table, fade, confirm, save. Change-the-sound with ◀ ▶ and pinch-hold, the whole bank. Tests on synthetic paths.
2. Build mode: parts, assign by hit, two-bar guided record with quantise and fill-in, the machine runs, Perform handoff. Track 1 as six parts.
3. Perform: cast onto the built machine, FILL, hold it, results with tight %, encore, kept beats.
4. Copy pass, module display, landing with the new line. Deploy. Judge round. Creative round.
5. Tracks 2 to 5 and the daily; cards; the producer's part; tempo follow; palm versus fingertip; the desk map; film mode; the device script; the video shot list (shot one: a cup getting its ring; shot two: the machine running on a real desk).

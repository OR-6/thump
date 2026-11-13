# The game, version 3 (13 Nov, evening): play any instrument with your hands

This file is the game. It replaces GAME.md, DIRECTION-13NOV-B.md and DIRECTION-13NOV.md. OPERATING-13NOV.md (how to work: the judge round and the creative round after every deploy) still applies in full. docs/COMPETITION.md is still the rubric.

## What we are making, in the user's words

People can play any instrument with their hands. They choose an instrument and it appears in front of them, on their real desk, and they play it with their real hands. In free mode they can play anything. In song mode the notes appear and they have to play them. A complete beginner who knows nothing about music can play and sound good. Many instruments, added one at a time, each with a good model and good animation. Co-op: several VR players, online or in the same room, playing different instruments together.

## Why it wins (how it maps to the rubric)

- **Innovation:** hands-first instruments on your real desk with no controllers, and a band that can be in your room or across the world. The instruments sit on your real table so your palm meets real wood on every drum hit: passthrough is load-bearing, not decoration. Turn passthrough off and you lose the desk, the haptics and the people.
- **Experience design:** one gesture per instrument (hit, press, strum, shake, wave), everything within a forearm, seated, no text. Beginner mode means the first song is a success for anyone.
- **Technical:** hand tracking at 72 fps with sub-frame hit timing, instruments anchored to the detected table, a shared clock for co-op, colocated anchors for same-room play.
- **Polish:** real instrument models with motion (keys that sink, heads that ripple, strings that blur), a sound set that is not a MIDI toy, a landing and video that show real hands on a real desk.
- Special awards in reach: Social & Multiplayer (the band), First Five Minutes (pick, play, song, stars in three minutes), Accessibility (one hand, slow, big keys, no-wrong-notes), Reason to Come Back (instruments and songs unlock, daily, the band).

## The first ten minutes (the judge's slice, build this first and make it flawless)

| Time | What happens |
|---|---|
| 0:00 | Enter. Passthrough. A **stand** (a slim shelf of light) settles on the real desk with three instrument icons: Drums, Keys, Marimba. *Pick one.* |
| 0:10 | Pinch Drums. The kit **unfolds** onto the desk (a half-second build animation). The module display: *Hit anything.* |
| 0:15 | Slap: kick. Hit: snare. Hit the hat. The heads ripple, the hoops flash. Nothing to read. Thirty seconds of free play. |
| 0:50 | The module pulses: *Play a song?* Pinch. Song list: three easy songs. Pinch *Kick Start*. |
| 1:00 | **Beginner mode is on by default.** A count-in. Notes fall onto the drum they want, a beat ahead, big and slow; the band plays the rest of the song; a missed note is simply quiet. Two minutes. Stars. *Nice. 2 stars.* |
| 3:00 | *Try the keys?* Pinch Keys. A keyboard unfolds, big keys, in the song's key with the black keys folded away in beginner mode. Free play: everything you press sounds right. |
| 3:30 | Song on keys: the same song, the melody. Notes drop onto the keys (a waterfall). Chords are one wide key in beginner mode. Stars. |
| 5:30 | Marimba unlocks: *New: Marimba.* Mallets appear in your hands when you pinch; hit the bars. |
| 6:30 | **Band.** The module says *Play together?* A four-letter code. A second player, in the room or online, picks an instrument; the song is split into parts; you both play; one score, two stars each. If nobody joins, the band bot takes a part. |
| 9:00 | Results, the song list with stars, the stand with five instruments, one locked. *Tomorrow: a new song.* |

Everything within a forearm. One hand works for every instrument. Nothing floats but notes and the stand.

## Instruments (the roster, in build order)

Chosen for what hands can actually do without haptics. Each has one gesture, a model, animation, a sound set, a free-play scale, a song-mode notation, a beginner simplification and a Pro layout.

| # | Instrument | Gesture | What a beginner gets | Pro |
|---|---|---|---|---|
| 1 | **Drum kit** (kick, snare, hat, two toms, crash, ride) | hit through the head with a palm or fingers; fingertip = closed hat, palm = open | three pieces, notes drop onto them | the whole kit, ghost notes, dynamics scored |
| 2 | **Keys** (piano and electric piano, 2 octaves) | press a key with a fingertip (fingertip crosses the key top downward) | white keys only, in the song's key, chords are one wide key | 3 octaves, black keys, two hands, real voicings |
| 3 | **Marimba / xylophone / glockenspiel** | mallets snap into pinching hands; hit the bars | pentatonic bars, big | chromatic, two mallets each hand |
| 4 | **Handpan / tongue drum** | tap the tone fields | eight fields, all in key | nine fields, ghost strokes |
| 5 | **Congas / bongos / cajón** | palm and fingertip strikes, slap vs open by position | two drums | slap, open, heel, muted |
| 6 | **Guitar / bass (simplified)** | left hand pinches a **chord pad** on the neck (one pad per chord), right hand strums through the strings | chord pads lit a beat ahead, strum anything | pads per string, muting, picking lanes |
| 7 | **Harp / lyre** | run fingers through strings (glissando), pluck one | strings in key, glissando always sounds right | 22 strings, two hands |
| 8 | **Theremin / synth lead** | right hand height = pitch, left hand distance = volume; continuous | pitch snaps to the scale | free pitch, vibrato by hand shake |
| 9 | **DJ pads / sampler** | 4×4 pads, hit them; pads hold the song's stems | pads light in order, any pad sounds right | finger drumming, holds, chops |
| 10 | **Shakers / tambourine / cowbell** | pinch to hold, shake; cowbell hit | shake on the beat | accents, rolls |
| 11 | **Singing bowl / gong / chimes** | rub the rim, strike | — | — |
| 12 | **Kalimba** | thumb flicks on tines | pentatonic | chromatic |
| 13 | **Steel pan** | hit the notes with mallets | in key | chromatic |
| 14 | **Vocal pads / choir** | hold a hand open and move it: height = note | in key | harmony with two hands |

Build order: 1, 2, 3 for the ten-minute slice; then 4, 5, 6, 9; then the rest. Every instrument ships with its model, animation, sound set, free-play scale, song notation, beginner and Pro layouts, tests, and one song that features it. An instrument that is missing any of those is not shipped.

**Where instruments live.** They sit on the real desk (table plane or resting palm, as now), at seated reach, facing you; the drum kit and keys use the real surface for haptics. Pinch and drag the stand's handle to move the whole setup; instruments can be rescaled with two hands. Up to three instruments on the desk at once (a kit left, keys centre, a handpan right): that is a Pro setup and a video shot.

**Models.** Built in `src/scene-assets/` as procedural Three.js prototypes (glTF where a CC0 model is better): real proportions, PBR materials (lacquered wood, brushed metal, rubber, nickel strings), subtle wear. Animation on every hit: keys sink 6 mm with a spring, drum heads ripple with a shader, strings blur and shimmer, bars bounce, mallets follow the hand and strike. LED-style feedback is on the song notes, not the instrument: the instruments look like instruments.

**Sound.** Recorded one-shots per instrument (CC0 libraries already in the repo: Versilian and others), two or three loudness layers, round-robins, pitch-shift at most a few semitones; sustain via loops for keys and theremin; a shared room reverb; a soft limiter; the band's backing stems rendered from the same instruments so the player's part sits in the mix.

## Playing with hands (what makes it feel right)

- **Hits** (drums, bars, pads, fields): the existing strike detector per surface: crossing or sharp stop within 1.5 cm, latch 120 ms, re-arm by lift, resting rejection, dropouts survived, times back-dated to contact; velocity from approach speed; position within the head picks the sound (centre, edge, rim).
- **Presses** (keys, chord pads): a fingertip crossing the key's top plane downward at any speed; release when it lifts; velocity from crossing speed; one note per finger; adjacent-key rejection by the fingertip's nearest key centre; a hand resting flat plays nothing (five tips crossing within 30 ms = rest).
- **Strums** (guitar, harp): fingertips crossing string planes in sequence; direction sets up/down; speed sets loudness; a glissando is a run of crossings.
- **Shakes:** pinch to hold; angular acceleration peaks above a threshold trigger; the model shakes with the hand.
- **Continuous** (theremin, vocal pads): a filtered hand position (the One-Euro filter is in the repo) mapped to pitch and volume at 90 Hz.
- **Mallets and sticks:** appear in a pinching hand, follow it with a little lag and weight, and strike at the tip: this gives drums and bars a longer reach and a visible stroke in the video.
- **Latency:** audio scheduled on the audio clock, strike times back-dated, the calibration page kept.

## Beginner mode (the whole point)

Default on. The player never sees the word "beginner"; the module calls it *Easy* and the toggle is one pinch.

- **Every instrument is in the song's key.** Wrong notes do not exist: keys without the song's notes fold away, bars and fields are pentatonic, strum pads are the song's chords.
- **Notes come to you.** A song's notes travel to the exact key, drum or pad a beat ahead, big and slow, and the target glows. Timing windows ±120 ms; a miss is silent, never a buzzer; no fail state, no health bar.
- **Chords are one key.** A chord in the chart is one wide key on the keyboard or one pad on the neck.
- **Less, then more.** The first song asks for one note per bar; the next, one per beat; difficulty is per song and per part, chosen by what the player managed last time (the game moves you up when you three-star, never down).
- **Listen first.** Pinch the song once more and it plays itself on the instrument, the keys moving, for one chorus. Learning by watching.
- **Auto-rhythm (optional, on for the first song):** a hit within a half-beat snaps to the grid in the mix. The player hears themselves in time from the first bar.
- **Guide hands (optional):** faint ghost hands show where the next note is on keys and guitar; off by default on drums.
- **One hand, slow, big:** one-handed layouts for every instrument; tempo 60 to 100 %; big keys mode; high contrast; no words; seated always.
- **Stars** at 70/90 %; a dynamics star when accents are played harder; gold at full tempo in Pro. The results screen says one thing that went well first.

Reference points, used deliberately: Synthesia's waterfall for keys; Guitar Hero's highway turned into notes landing on the real layout for drums; Unplugged's chord-pad guitar for hands; Electronauts' "every pad is right" for free play; Beat Saber's clarity of one note, one target; Rock Band's parts and shared score for the band; Rhythm Heaven's call-and-response for lessons.

## Song mode

- Charts in parts (drums, keys, melody, chords, bass, perc) with three difficulty layers each (Easy, Normal, Pro), written in the grid notation already in the repo, in key, with tempo and sections.
- Notation per instrument: a waterfall onto keys; drops onto drum heads and pads; chord pads lit a beat ahead with a strum arrow for guitar; a wave on the theremin showing the pitch to follow; a pulse for shakers.
- A song's band: the parts the player is not playing come from the bed stems, mixed under them.
- Songs: originals written in-house (no rights issues) and public-domain pieces arranged: ten at launch across styles (a pop groove, a lo-fi beat, a waltz, a march, a folk tune, a Latin groove, a synth tune, a lullaby, a blues, a dance track), each with a featured instrument; a daily song generated from the chart library; speed and part choice per song.
- Results: stars, tight %, the part, the instrument; a replay on the instrument (the keys moving) that can be watched.

## Free mode

Pick any instrument; everything in a chosen key (or chromatic in Pro); a backing band that follows your tempo after four even hits; REC for four-bar loops, three layers; swap instruments mid-loop; a jam partner (the rule-based bot, named as such) that answers on a second instrument. Free mode is also where the band hangs out between songs.

## Co-op: the band

- **Online:** the module shows a four-letter code; a friend enters it on their headset's page; PeerJS data channels (in the repo) carry hand poses at 20 Hz, hits with timestamps, and a shared song clock (one host; offsets measured by ping, notes scheduled against the shared clock). Up to four players. Each picks an instrument and a part; the song is split by part; one shared score and personal stars. You see the others as hands and their instruments arranged in a circle round the desk (their desk is wherever they are; yours is yours).
- **Same room (colocated):** two or more headsets in one room join the same code; the host's table anchor is shared by a quick alignment (both players pinch the same corner of the desk), after which instruments appear in the same real place for everyone and players see each other through passthrough, no avatars needed. Latency is local-network small.
- **Pass-and-play (one headset):** parts in turn, the previous part plays back as the band.
- **Phone band member:** a friend with no headset opens the page on a phone and gets a pad instrument (already in the repo as the phone jam).
- **Bot band:** any part nobody takes is played by the bot at the player's level.
- **Social moments:** a count-in everyone hears; a shared fill window where whoever plays most densely in time lights the whole band; a shared encore replay; a band name and the band's best scores saved.

## Progression

- **Instruments unlock** in roster order by playing: the first three at once, then one per song three-starred or per day played, so a returning player always has a new instrument waiting.
- **Songs unlock** by stars; each instrument has a featured song; Pro charts unlock at three stars on Normal.
- **Daily song**, a streak, a new lesson card each day (*Play the hat with your other hand*, *Learn the chorus on keys*).
- **The stand remembers:** your instruments and their places on the desk under the persistent anchor; your band's name; your kept loops.
- **Lessons:** short call-and-response drills per instrument (the bot plays two bars, you copy), the beginner's way into Pro.

## Look

Instruments that look like instruments: real materials, real proportions, soft shadows on the desk, hoops and keys that catch the room's light. UI is the stand (a shelf of instrument icons on the desk), the module (the small display with five keys, kept), and the notes. Clean geometric type; one accent colour per instrument; no felt, no confetti; celebrations are light sweeping along the instrument and a short animation (the cymbals shimmer, the keys ripple). Models must read in passthrough from a seated view and in a 16:9 video frame.

## Copy

Short, plain, said out loud: *Pick one. Hit anything. Play a song? Listen first. Easy. Nice. 2 stars. New: Marimba. Play together? Your part: drums.* Six words or fewer in the headset. No "orchestra", no "tonight", no cosy song names; songs are named like tracks (*Kick Start, Two Step, Slow Waltz, Lowrider, Night Shift*).

## Architecture (what to reuse, what is new)

Keep: hand tracking and filtering, the strike detector (generalised per surface), the table placement and persistent anchor, the audio engine and sampler, the sequencer and judge, the module, the bandmate rules, the phone link and PeerJS transport, the settings and progress store, the E2E harness and autoplayer, the deploy and video tooling. The real-object touch system from version 2 is retired (kept in git, not in the build).

New: `src/instruments/<name>/` (model, animation, input, sound map, layouts, notation, tests) behind one `Instrument` interface (`place`, `update(hands)`, `hit(...)`, `notes`, `layout(mode)`); `src/stand/` (the picker); `src/songs/charts/` with difficulty layers; `src/band/` (shared clock, peers, parts, colocation alignment); `src/notation/` (waterfall, drops, chord pads, pitch wave).

Performance: 72 fps with three instruments and four remote players; one draw per instrument body, instanced keys and bars, one draw for all notes, shaders warmed at placement, no per-frame allocation.

## Testing

Unit: input per gesture on synthetic hand paths (press, strum, shake, continuous), layouts, charts and difficulty layers, judge, shared clock and offset math, part splitting. E2E in the emulator: pick an instrument, play free, play a song Easy to stars, two emulated peers through a song, the stand's persistence, every instrument's placement screenshot from the seated view. Device sessions: hit feel per instrument, press feel on keys, strum, shake, latency; two headsets in one room.

## Schedule with cut lines (deadline 18 Nov 21:00 Amsterdam; submit by midday)

- **P0 (must ship):** the stand; drums, keys, marimba with models, animation, sound; free mode; song mode Easy and Normal with notation; beginner mode in full; five songs; online band for two with a bot for the rest; persistence; the ten-minute slice flawless; landing, README, gallery, video.
- **P1:** handpan, congas, guitar (chord pads), DJ pads; ten songs; four-player band; colocated alignment; lessons; daily and streak; Pro charts.
- **P2:** harp, theremin, shakers, bowl and gong, kalimba, steel pan, vocal pads; replays; band names and bests; pass-and-play.
- Cut from the bottom only. An instrument that cannot be finished to the standard is cut, not shipped half.

## Order of work (start now)

1. The `Instrument` interface and the stand; drums ported onto it with the real model and animation; free mode; the module's new lines. Deploy.
2. Keys: model, press input, waterfall notation, beginner folding; marimba with mallets. Song mode with Easy and Normal on all three; five songs. Deploy; judge round; creative round.
3. The band: shared clock, two online players, parts, bot. Deploy; judge round.
4. P1 instruments one at a time, each complete. Deploy after each; judge and creative rounds.
5. Device script for the user (per instrument feel), the video shot list (shot one: hands unfolding the kit on a real desk; shot two: two people in one room playing together), the gallery, the Devpost text.

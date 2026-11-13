# Thump: design

*Play your room. Every surface in your room is an instrument.*

The design the code is built from. Section numbers match the references in the source (`DESIGN.md §3.3` and so on).

---

## 0. The game in one sentence

**The headset turns your room into an orchestra: every surface you can reach becomes an instrument chosen by its physics (the table a drum kit, the wall a gong, the door a marimba, the window a glockenspiel); you discover them by hitting them, then play songs cast across your own room.**

- **Only possible in mixed reality.** A desk already knocks without a headset. With one, your door is a marimba with pitched light bars drawn across it. Turn passthrough off and there is nothing to play .
- **Every room is a different instrument set.** Size, orientation, hollowness, glass and softness decide each instrument and its voice; a big door's marimba is deeper than a cupboard's tongue drum. "Holding up in rooms the developer never tested" is the concept itself.
- **Explains itself in two words:** "Hit anything." Each first hit reveals an instrument drawn onto the real surface.
- **The real surface is the haptics:** your palm stops on real wood, glass, fabric.
- **A complete arc in ten minutes:** discover the kit and a few instruments, play a song cast onto them, earn stars, unlock the next, jam with a bandmate who claims an instrument.

## 2. The first ten minutes (P0, sacred)

| Clock | What happens | What it teaches |
|---|---|---|
| 0:00 | 2D page: **Enter mixed reality**. "Quest will ask once to use your room." | nothing to read |
| 0:10 | Passthrough. The table is found (plane, or a resting palm). A small matte-black **module** settles at the back of the table; its display says **Hit anything.** Every reachable surface carries a faint sheen. | look around |
| 0:15 | You hit the table: the **kit** draws itself (black mesh heads, chrome hoops); the hit plays a drum by position (left kick, centre snare, right hat, edge rim). "Table · drum kit", room map 1 of N. | a hit reveals |
| 0:30–2:00 | The wall: a gong ring draws itself, a long boom. The door: light bars climb across it, a marimba. The window: glockenspiel keys. Each first hit draws its overlay and names it for two seconds; the module's room map fills. | the room is an orchestra |
| 2:00 | With two instruments found the module's **PLAY** key pulses. Tap it: *Porch Step*, cast onto the kit and one melodic surface. Notes travel to the exact pad, bar or key and light it a beat ahead. | songs |
| 4:00 | Stars on the display, a light sweep across every instrument. The next song asks for one more instrument. | growth |
| 5:00–8:00 | Song 2 on three surfaces. Free play between songs: everything you hit plays, melodic surfaces in key. | your room, your band |
| 8:00 | **JAM**: the bandmate claims an instrument (its lights pulse), plays two bars; you answer; it answers back, busier when you're good. | it listens |
| 10:00 | Songs on the module, the room map. You are mid-song or exploring. | reason to come back |

## 3. Core systems

### 3.1 Surfaces (P0)

- **Sources:** detected planes, bounded volumes and the global mesh (when the browser exposes `mesh-detection`), and the table found at placement (plane or resting palm). Quest's room-scan labels (table, wall, door frame, window frame, storage, couch, bed, floor) are scene-understanding hints next to the measured geometry; the instrument is decided by physical features, not by recognising objects.
- **A surface** has a local frame (y = outward normal; x across; z up the surface for vertical ones), bounds, area, height above the floor, orientation and features: **hollow** (a volume behind it within 2–60 cm, or a box volume), **glass** (a pane framed in a wall), **soft** (measured: the hand sinks more than 2 cm and stops slowly), **curved** (mesh normal spread), **small** (a bump on the table, from the mesh), **reach** (closest point to the seated head).
- **Hits on any surface:** per hand, every surface within 30 cm runs the strike detector in its own frame (height = distance along its normal). One hit per strike; the nearest surface wins.

### 3.2 Strikes (P0, the heart)

The v1 detector, generalised to any surface frame and hardened by the feel review: survives tracking dropouts up to 120 ms, rebounds up to 3 cm never double, no hits from hovering, resting judged by height spread over time (not frame speed), speed measured against the last changed sample (Quest may repeat 30 Hz samples) and real frame time, strike times back-dated to the contact, a true palm centre plus knuckles, about 24 dB of loudness range, pinching only blocks hits while something is held. Thresholds overridable from the address.

### 3.3 Instruments from physics (P0)

| What the shape says | Family | Voice by size |
|---|---|---|
| horizontal, table height, large, hard | **kit** (left kick, centre snare, right hat, edge rim; tom when unlocked) | table size: kick depth |
| vertical, large, solid | **gong** | bigger = lower, longer |
| vertical, hollow, door-sized | **marimba**: 8 light bars, low at the bottom, high at the top | register by size |
| hollow box (cupboard, drawer) | **tongue drum**: 5 tongues around where you hit | box size |
| glass | **glockenspiel**: 8 keys across the pane, low left to high right | pane size |
| curved shell | **singing bowl**, a ring of 6 notes | diameter |
| small bump, tall (mug) | **bell** | height |
| small flat bump, shelf | **wood block** | size |
| soft | **shaker** | area |
| floor | **stomp** | — |

Melodic zones sit around the spot of the first hit (it was in reach), clamped into the surface, in the current key (C major pentatonic, or the song's key while it plays).

### 3.4 Sounds (P0)

A **modal voice** per family: decaying partials (ratios, amplitudes, decays) excited by a short filtered noise burst, brighter and louder with speed, lower and longer on bigger surfaces. Presets: marimba (wooden, 4 partials, 0.4 s), glockenspiel (bright, inharmonic, 1.5 s), gong (dense, beating, 3 s), tongue drum (hollow formant), bowl (beating pairs, 4 s), bell, block, shaker (filtered noise), stomp. The kit keeps synthesised drums with harmonics that carry on Quest's speakers. No compressor in the hit path; a soft-clip limiter. No AI-generated audio.

### 3.5 Discover (P0)

The default state after placement. Undiscovered reachable surfaces carry a faint sheen; the first hit on each draws its overlay with a light sweep and names it for two seconds ("Door · marimba"); the module's room map counts and shows family icons. The room map is saved: next session in the same room the instruments are already drawn.

### 3.6 Songs (P0: 4; P1: 8)

- Charts are written in **parts** (kick, snare, hat, tom, rim, melody, bass, chime, shake, gong) with scale degrees for pitched parts. **Casting:** each part maps to a discovered instrument (exact family, then the nearest family: marimba ↔ glockenspiel ↔ tongue ↔ bowl ↔ bell; bass → gong/tongue/stomp); anything missing falls back to the table's **table keys** (five slim light bars at the front of the kit). Early songs use two surfaces; later ones up to five.
- Notes are **light motes travelling across the room** from the module to the exact pad, bar or key, which lights a beat ahead. Windows ±60/±120 ms (×1.5 slow), stars at 70% / 90%, no fail state, gold at full tempo.
- Songs: *Porch Step* 80 bpm (kit + melody), *Kitchen Clock* 92 (+ hat, bass), *Night Bus* 104 (kit, melody, chime), *Big Room* 76 (gong, marimba, kit). P1: *Rain on the Window*, *Sofa Shuffle*, *Call & Answer*, *Your Room*.
- Unlocks: song 1 → the tom; song 2 → JAM; song 3 → loops; song 4 → swaps.

### 3.7 Free play and loops (P0 free play; P1 loops)

Always on outside songs; melodic surfaces in key. Loop reel (P1): 8 bars, lightly quantised, three layers.

### 3.8 Jam and the bandmate (P1)

A rule-based musical agent, named honestly. It **claims** one discovered melodic instrument (its lights pulse there), plays a two-bar call, you answer; it listens (which surfaces, when, how hard), gets busier when you answer well and simpler when you struggle, echoes your own groove back once a jam, nudges a sound you keep playing late, counts you back in when you stop.

### 3.9 Phone jam (P1)

A friend opens the page on a phone, types the 4-letter code shown on the module, and the phone becomes an instrument your room doesn't have (bass first). The headset plays it in key.

### 3.10 Instrument swaps (P1)

Pinch a family icon on the room map and drop it on a surface: it now plays that family, coloured by its physics. Saved with the room.

### 3.11 Accessibility (P0 basics)

One-handed kit; slow mode 0.6–0.9 (stars unchanged); high contrast (white overlays, thicker keys); calm motion; no words in the headset; a visual twin for every sound; seated (only surfaces in reach lit); no fail states.

### 3.12 Persistence and pause

The kit and room map under the persistent anchor; progress local. Headset off: the song waits; on return two clicks and it continues.

### 3.13 Art direction (decided)

Professional electronic instrument. Kit: matte black mesh heads, rubber rims, thin chrome hoops, an LED ring flashing by strength; heads dent and ripple. Overlays: slim precise light bars and keys on the real surfaces, one accent per family (marimba amber, glockenspiel ice blue, gong warm white, tongue teal, bowl violet, bell gold, shaker green, block orange, stomp red). The only UI is a small matte-black **module** at the back of the table: monochrome display, four rubber keys (◀ PLAY ▶ JAM). Celebrations are light sweeps. No felt, paper, plastic or confetti. Clean geometric sans. No crowd: an applause meter on the module.

### 3.14 Performance

72 fps at quality 0 on Quest 3 in passthrough; overlays batched per surface; one draw for all motes; shaders warmed at placement; frame guard; no per-frame allocations in update paths.

### 3.15 The 2D page

"Every surface in your room is an instrument." Enter mixed reality; how to play from a laptop; the phone-jam join box; settings folded away.

## 4. Numbers

Kit zone ±0.32 m across, ±0.2 m deep; kick (−0.09, 0) Ø14 cm, snare (+0.09, 0) Ø12, hat (+0.235, +0.06) Ø9, tom (−0.245, +0.06) Ø11, rim within 3 cm of the kit zone's front edge. Strike: 0.35 m/s, or a 12 m/s² stop within 1.5 cm; latch 120 ms; re-arm 2.2 cm. Bars: 8 × (5 × 1.2 cm) over 0.5 m; keys: 8 × (2 × 9 cm) over 0.4 m. Reach: closest point within 0.75 m of the head.

## 5. Polish bar

A stranger hits something within 15 s and something wonderful happens; every hit sounds and shows; no headset text over 6 words; nothing floats but tags and motes; 72 fps; works first time at a desk, a kitchen table, a coffee table; headset off/on resumes within 3 s; the video opens on a real door becoming a marimba.

## 6. Architecture

Kept: `src/input/*`, `src/app/*`, `src/kit/strike.ts` (generalised), `src/kit/layout.ts`, `src/songs/judge.ts`, `src/songs/sequencer.ts`, `src/bandmate/bandmate.ts`, `src/persistence/*`, `src/net/coop.ts`, `src/jam/*`, the E2E harness and autoplayer.

New: `src/room/surfaces.ts` (planes, volumes, mesh → surfaces + features), `src/room/classify.ts` (features → family, voice; pure), `src/room/zones.ts` (pitch zones; pure), `src/room/overlay.ts` (bars, keys, rings, sheen), `src/audio/modal.ts`, `src/ui/module.ts`, `src/play/game.ts` (discover/free/song/jam), `src/songs/cast.ts` (parts → instruments; pure), `src/room/room-system.ts`.

Removed: the felt crowd, felt bird, felt cards and textures, luggage tags, copy mode as the tutorial.

## 8. Testing

Unit: strikes (dropouts, rebounds, hover, jitter rest, repeated samples, hitches, back-dating), classification (door, wall, window, cupboard, table, sofa, floor), zones, casting (every song onto rooms with 1–7 instruments), judge, sequencer, bandmate, the game's modes with a bot. E2E (emulator living_room: tables, couch, walls, a window): place, discover the table and the window by animated hands, a cast song to stars, debug logging. Device sessions: `docs/DEVICE-SESSION.md`.

## 10. Risks

- **The room mesh may not reach WebXR on Quest Browser.** Planes still give tables, walls, doors, windows, storage and couches; bumps (mug, bowl) need the mesh and are a bonus, never on the critical path.
- **Hits on vertical surfaces** may track worse (hands side-on); tune on device.

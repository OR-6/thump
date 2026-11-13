# Thump: play your room

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A music game for Meta Quest 3 that you play by hitting real things. Sit at a table and put the headset on. The table is a drum kit. Tap your cup twice and it rings like a bell, a taller cup lower. A book is a wood block, your knees are congas. If you stand up, the walls, the door and the window play too. Design notes are in [docs/DESIGN.md](docs/DESIGN.md).

**Play:** open **https://or-6.github.io/thump/** in the Quest browser and press *Enter mixed reality*. Hands only, nothing to install.

## Sitting down with it

1. Rest a palm on the table. A small black drum module turns up at the back of it and says *Hit anything*.
2. Slap the table. A kit grows out from under your hand: deep on the left, bright on the right, a rim click at the edge, and a row of bars behind the pads.
3. Tap something on the table twice: a cup, a glass, a book, a phone. The first tap leaves a small ring of light where your hand stopped. The second makes it an instrument. Cups ring as bells and each one is a different note; flat things knock like wood. Drum on your knees under the table and they become congas.
4. When ▶ on the module pulses, tap it for a song. Notes fly to the pad, bar or cup they belong to and light it a beat early. Everything else you found plays along quietly, and the last chord is the whole lot at once. Then your last four bars play back to you.
5. After the first song, JAM: two light mallets get up off the module and play a phrase on one of your instruments, and you play it back. A friend can join from their phone as the bass (beta).
6. Pinch and hold anything you found to change its sound: the bars become a marimba, a xylophone, a harp; a cup becomes chimes. It's remembered.
7. Slam both hands on the table at once and every instrument answers.
8. Stand up and hit the wall, the door, the window. They join the rest.

Tap ◀ twice on the module for settings (slower songs, one hand, high contrast, no words). Tap ▶ twice to stop a song.

## How it works

- **Surfaces** (`src/room/`): detected planes and room-scan volumes become surfaces with their own frame; their measured shape (orientation, size, height, a pane or door set into a wall, softness from how far your hand sinks in) picks an instrument and its register (`classify.ts`, unit-tested). Quest's room-scan labels fill in what geometry can't measure (glass, a hollow door).
- **Strikes** (`src/kit/strike.ts`, unit-tested on synthetic hand paths): per surface, in that surface's frame, the hand's lowest point crossing it fast, or stopping sharply within 1.8 cm of it (tunable in the headset). Survives tracking dropouts, repeated samples and frame hitches; rebounds, hovering, resting and reaching never play.
- **An orchestra, not a band** (`src/room/classify.ts`): twenty instruments. Walls are gongs, timpani, frame drums or a bass drum; doors marimbas or xylophones; windows a glockenspiel or a harp; cupboards a kalimba or a slit drum; other tables congas; a sofa a shaker or a tambourine. Screens, pictures and lamps are never instruments. Surfaces of the same kind get different instruments in turn, so a room with four walls has four. Pinch and hold any of them (the desk's bars too) to change what it plays; it's saved with the room.
- **Sound** (`src/audio/`): recorded instruments and a piano for the band, 186 short clips from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0), chosen by how hard you hit (two or three loudness layers), re-pitched to the note, with a little variation per hit so no two sound alike, through a room reverb and a soft limiter. Melodic surfaces play in the song's key; bigger surfaces ring lower. A modal synthesiser (decaying partials struck by a noise burst) stands in while the clips load.
- **Songs** (`src/songs/`): written in parts (drums, melody, bass, chime, gong), cast onto the instruments your room has, with the table's edge keys as the fallback.

## Status

Verified in the IWSDK emulator and by unit tests. Device numbers (frame rate, hit-to-sound latency) are added here once measured on a Quest 3 with `?debug=1`.

## Develop

```
npm install
npm run typecheck && npx vitest run
npx @iwsdk/cli dev up --headless --allow-browser-automation --ai-mode agent
node tools/e2e-all.mjs
```

## Licence

Code: MIT (see LICENSE).

Sounds: recordings from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) by Samuel Gossner and contributors, CC0 1.0 (trimmed and converted; see `src/audio/sample-map.ts`).

Type: [Barlow Condensed](https://github.com/jpt/barlow) by Jeremy Tribby, SIL Open Font License 1.1 (`public/fonts/OFL.txt`).

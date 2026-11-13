# Thump: play your room

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A hands-first mixed-reality music game for Meta Quest. **Every surface in your room is an instrument:** your table is a drum kit, your wall a gong, your door a marimba, your window a glockenspiel. Hit anything to find out what it plays, then play songs cast across your own room. The real surface gives you the feel no controller can fake.

**Play:** open **https://or-6.github.io/thump/** in the Quest browser, sit at a table, and press *Enter mixed reality*. Hands only; nothing to install.

## The first ten minutes

1. A small black module settles at the back of your table: **Hit anything.** Every surface you can play has a faint sheen.
2. Hit the table: a drum kit draws itself (left deep, right bright, the edge a rim).
3. Hit the wall, the door, the window: each becomes its instrument, drawn in light on the real surface (a gong ring, marimba bars, glockenspiel keys) and named for two seconds. The module's room map fills.
4. With two instruments found, tap ▶ on the module: a song is cast onto your room's instruments. Notes fly as light to the exact pad, bar or key and light it a beat ahead. Stars at the end; each song unlocks the next.

## How it works

- **Surfaces** (`src/room/`): detected planes and room-scan volumes become surfaces with their own frame; their measured shape (orientation, size, height, a volume behind, a pane inset in a wall, softness from how your hand stops) picks an instrument and its register (`classify.ts`, unit-tested). Quest's room-scan labels fill in what geometry can't measure (glass, a hollow door).
- **Strikes** (`src/kit/strike.ts`, unit-tested on synthetic hand paths): per surface, in that surface's frame, the hand's lowest point crossing it fast, or stopping sharply within 1.8 cm of it. Survives tracking dropouts, repeated samples and frame hitches; rebounds, hovering, resting and reaching never play.
- **Sound** (`src/audio/`): every instrument is a modal voice (decaying partials struck by a short noise burst), louder and brighter the harder you hit, lower and longer on bigger surfaces; melodic surfaces play in the song's key. Nothing is sampled.
- **Songs** (`src/songs/`): written in parts (drums, melody, bass, chime, gong), cast onto the instruments your room has, with the table's edge keys as the fallback.

## Status

Verified in the IWSDK emulator and by unit tests. Device numbers (frame rate, hit-to-sound latency) are added here once measured on a Quest 3 with `?debug=1`.

## Develop

```
npm install
npm run typecheck && npx vitest run
npx @iwsdk/cli dev up --headless --allow-browser-automation --ai-mode agent
node tools/e2e-room.mjs --song
```

## Licence

Code: MIT (see LICENSE).

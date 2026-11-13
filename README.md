# Thump: play your room

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A hands-first mixed-reality music game for Meta Quest. **Every surface in your room is an instrument (see [docs/DESIGN.md](docs/DESIGN.md)):** your table is a drum kit, your wall a gong, your door a marimba, your window a glockenspiel. Hit anything to find out what it plays, then play songs cast across your own room. The real surface gives you the feel no controller can fake.

**Play:** open **https://or-6.github.io/thump/** in the Quest browser, sit at a table, and press *Enter mixed reality*. Hands only; nothing to install.

## The first ten minutes

1. A small black module settles at the back of your table: **Hit anything.** Every surface you can play has a faint sheen.
2. Hit the table: a drum kit draws itself (left deep, right bright, the edge a rim).
3. Hit the wall, the door, the window: each becomes its instrument, drawn in light on the real surface (a gong, marimba bars, glockenspiel keys, harp strings) and named for two seconds ("Your door is a marimba"). The module's room map fills.
4. With two instruments found, tap ▶ on the module: a song is cast onto your room's instruments. Notes fly as light to the exact pad, bar or key and light it a beat ahead. Stars at the end; each song unlocks the next (and a new song of the day).
5. After the first song, tap **JAM**: a bandmate takes one of your instruments and plays two bars; you answer; it gets busier when you answer well and plays your own phrase back. The module shows a code: a friend types it on this page on their phone and their phone becomes the bass (beta).
6. After *Kitchen Clock*, pinch and hold any instrument you found: it changes to the next one that suits it (a window: glockenspiel, then harp, triangle, chimes, tubular bells…); seated, the desk's bars change too. Saved with the room.
7. After *Night Bus*, tap **REC**: four bars of whatever you play, anywhere in the room, loop back; layer up to three.
8. Next time in the same room, the instruments you found are already drawn. In the headset, tap ◀ twice for settings (slow songs, one hand, contrast, words); tap ▶ twice to stop a song.

## How it works

- **Surfaces** (`src/room/`): detected planes and room-scan volumes become surfaces with their own frame; their measured shape (orientation, size, height, a pane or door set into a wall, softness from how far your hand sinks in) picks an instrument and its register (`classify.ts`, unit-tested). Quest's room-scan labels fill in what geometry can't measure (glass, a hollow door).
- **Strikes** (`src/kit/strike.ts`, unit-tested on synthetic hand paths): per surface, in that surface's frame, the hand's lowest point crossing it fast, or stopping sharply within 1.8 cm of it. Survives tracking dropouts, repeated samples and frame hitches; rebounds, hovering, resting and reaching never play.
- **An orchestra, not a band** (`src/room/classify.ts`): twenty instruments. Walls are gongs, timpani, frame drums or a bass drum; doors marimbas or xylophones; windows a glockenspiel or a harp; cupboards a kalimba or a slit drum; other tables congas; a chair a cajón; a lamp a vibraphone; a sofa a shaker or a tambourine. Surfaces of the same kind get different instruments in turn, so a room with four walls has four. Pinch and hold any of them (the desk's bars too) to change what it plays; it's saved with the room.
- **Sound** (`src/audio/`): recorded instruments, 172 short clips from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0), chosen by how hard you hit (two or three loudness layers), re-pitched to the note, with a little variation per hit so no two sound alike, through a room reverb and a soft limiter. Melodic surfaces play in the song's key; bigger surfaces ring lower. A modal synthesiser (decaying partials struck by a noise burst) stands in while the clips load.
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

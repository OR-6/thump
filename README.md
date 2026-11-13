# Thump: your desk is a drum machine

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A music game for Meta Quest 3. You sit at your desk and hit your own stuff. The desk is a kit. Your mug rings, a book knocks, your keyboard is a row of keys, your knees are congas. Every thing in reach plays the first time you hit it, and you choose what it sounds like. Then you build a track out of it and play it live. Design notes: [docs/GAME.md](docs/GAME.md).

**Play:** open **https://or-6.github.io/thump/** in the Quest browser and press *Enter mixed reality*. Hands only.

## At your desk

1. Rest a palm on the desk. A small black module turns up at the back: *Hit something*.
2. Slap the desk: it's a kit (left kick, middle snare, right hat, the edge a rim), with a row of keys behind.
3. Hit anything else: the mug, a book, a bottle, the laptop lid, your knee. It plays at once and a ring of light goes round it. Hit it again and it's kept. The module shows its sound; ◀ ▶ change it (28 sounds, any on any thing), or pinch and hold it.
4. *Build a track?* ▶. The module asks for each part (kick, snare, hat, perc, keys, bass); hit what should play it, then play two bars along with the lights. It snaps to the beat, fills in what you missed, and loops. Six parts later your desk plays the track by itself.
5. *Perform?* ▶. The machine plays underneath and you play the kit parts on your things. Two fills where anything counts, then four bars with no lights. Stars and *Tight %*. Then your last bars play back.
6. After that: JAM (a bandmate with two light mallets plays a phrase on your things; you play it back), REC loops, slam both hands down for everything at once, clap.
7. Stand up and walls, doors and windows play too (with Quest's room scan). Nothing needs them.

Tap ◀ twice on the module for settings (slower, one hand, high contrast, no words). Tap ▶ twice to stop.

## How it works

- **Surfaces** (`src/room/`): detected planes and room-scan volumes become surfaces with their own frame; their measured shape (orientation, size, height, a pane or door set into a wall, softness from how far your hand sinks in) picks an instrument and its register (`classify.ts`, unit-tested). Quest's room-scan labels fill in what geometry can't measure (glass, a hollow door).
- **Strikes** (`src/kit/strike.ts`, unit-tested on synthetic hand paths): per surface, in that surface's frame, the hand's lowest point crossing it fast, or stopping sharply within 1.8 cm of it (tunable in the headset). Survives tracking dropouts, repeated samples and frame hitches; rebounds, hovering, resting and reaching never play.
- **Things found by touch** (`src/room/touch.ts`): a hand that comes in fast and stops dead where nothing is known has hit something. It plays at once; its height over the desk and the way the hand came in pick the sound (low and flat a block, a mug a bell, a bottle a chime, a lid a ride, under the desk congas); a second hit keeps it, and it grows to the shape you hit. Any sound on any thing (`src/audio/bank.ts`). Walls, doors and windows from Quest's room scan play too, as a bonus.
- **Sound** (`src/audio/`): recorded instruments and a piano for the band, 204 short clips from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0), chosen by how hard you hit (two or three loudness layers), re-pitched to the note, with a little variation per hit so no two sound alike, through a room reverb and a soft limiter. Melodic surfaces play in the song's key; bigger surfaces ring lower. A modal synthesiser (decaying partials struck by a noise burst) stands in while the clips load.
- **Songs** (`src/songs/`): written in parts (drums, melody, bass, chime, gong), cast onto the things on your desk, with the desk's kit and keys as the fallback.

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

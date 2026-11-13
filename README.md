# Thump: a band on your desk

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A music game for Meta Quest 3, played sitting down. Hit your desk (or an airplane tray) and a drum kit comes up under your hands. The arrows on the little box swap it for a piano, a guitar or a handpan. Every note is in the scale, so there's no wrong one. Build a track a part at a time, then play it live, alone or with up to three friends in their own headsets. Hands only, in passthrough. Design notes: [docs/GAME-V3.md](docs/GAME-V3.md).

**Play:** open **https://or-6.github.io/thump/** in the Quest browser, put the controllers down and press *Enter mixed reality*.

## At your desk

1. Sit at a desk or a tray table. Rest a palm on it. The module turns up at the back: a small black box with a display and five keys (◀, a solid ▶ for play, a second arrow, then two more). It says *Tap the desk*.
2. Tap the desk. The drums come up: three pads under your hands (a tom joins after your first performance) and a row of eight light bars behind them.
3. The two arrows either side of the solid ▶ swap what's on the desk:
   - Drums: hit the pads.
   - Piano: six big keys for the right hand, a chord pad for the left.
   - Guitar: three chord pads on the left, a strum band on the right. The strings are synthesised in the browser.
   - Handpan: a low note in the middle, eight around it.
4. On the piano, guitar and handpan the last two keys become NOTES and SOUND. NOTES picks the scale: Happy, Sad, Bluesy, Dreamy. SOUND picks the sound: Grand, Vibes, Marimba or Glock on the piano; Nylon, Steel or Harp on the guitar; Steel, Glass or Bells on the handpan. Whatever you left out is there next time.
5. It's all sized for a tray. Piano keys are 5 cm wide and the piano is 44 cm end to end; the drums are a touch wider.

## Build a track

When ▶ pulses (*Build a track?*), tap it. The module asks for one part at a time: BOOM, SMACK, TICK, EXTRA, TUNE, BASS. The instrument for each part comes out by itself. Bar 1 lights the pattern to copy; in bar 2 the lights go out and whatever you play is kept. It snaps to the beat and fills in softly what you missed. Chords play under the track while you build. When the last part is in, there's a silent bar with a riser, then everything drops in at once.

Five tracks: Kick Start, Two Step, Boom Bap 88, Lowrider, Night Shift. Each opens once you've performed the one before.

## Perform

*Perform?* ▶. The machine you built plays underneath and you play the live parts over it. Two *Go wild!* windows where anything you hit counts. The last bars the lights go dim (*Keep it going*). The arrows switch instrument mid-song: it takes over at the next loop and you get a bar to find it. Your parts wear tape labels in marker so you can see what's where.

Results: notes played, stars, *On time %* when you were close (or which side of the beat you were on), a line about what carried it, then the machine plays you out twice.

## Play together

On the 2D page, one of you taps *Start a band* and gets a 4-letter code. Friends type it and tap *Join*. Then everyone enters mixed reality. Up to four headsets, wherever you all are. You hear every note the others play, a little to one side.

Signalling goes through the PeerJS public broker; after that it's peer-to-peer. Only note messages are sent, and each one is checked: a friend's headset can only ask for sounds the game already makes, at most 80 a second. No accounts, no voice.

## Settings

In the headset, tap ◀ twice on the module: Slow, One hand, Contrast, Words. On the 2D page under Settings there's also lead hand, less movement, piano and bass under tracks, and *Start over*.

## How it works

- Hits are read from raw hand-joint poses in each surface's own frame (`src/kit/strike.ts`, unit-tested on synthetic hand paths). A hit is the hand's lowest point passing through fast (0.35 m/s or more), or stopping sharply within 1.8 cm of it, since tracking loses the last centimetre. It survives dropouts and frame hitches; rebounds, resting and reaching don't play.
- `src/kit/shelf.ts` has the four instruments, their layouts in centimetres, the scales and the three chords that fit each scale.
- `src/play/build.ts` has the tracks and how a take is snapped to the beat; `src/play/game.ts` runs building, performing, switching and scoring.
- The sound (`src/audio/`) is 204 short clips from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0), picked by how hard you hit and re-pitched to the note, through a room reverb and a soft limiter. The guitar is a plucked-string synth.
- Playing together is `src/net/coop.ts` (the code and the connections) and `src/net/band.ts` (the note messages, the checks and the rate limit).

There's an older idea still in the code: tap a mug or a book and it becomes an instrument too. It's a side extra now.

## Status

Verified in the IWER emulator (IWSDK's browser-based XR emulator), by unit tests, and with a real two-page PeerJS test where each page hears the other. Not yet tried on a Quest 3. Frame rate and hit-to-sound latency go here once measured on the headset with `?debug=1`.

## Develop

```
npm install
npm run typecheck && npx vitest run
npx @iwsdk/cli dev up --headless --allow-browser-automation --ai-mode agent
node tools/e2e-all.mjs
```

`tools/e2e-band.mjs` runs the playing-together test on its own (it needs the network).

## Licence

Code: MIT (see LICENSE).

Sounds: recordings from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) by Samuel Gossner and contributors, CC0 1.0 (trimmed and converted; see `src/audio/sample-map.ts`).

Type: [Barlow Condensed](https://github.com/jpt/barlow) by Jeremy Tribby, SIL Open Font License 1.1 (`public/fonts/OFL.txt`). [Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker) by Font Diner, Apache License 2.0 (`public/fonts/PermanentMarker-LICENSE.txt`).

Networking: [PeerJS](https://github.com/peers/peerjs), MIT.

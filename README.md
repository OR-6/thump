# Thump: play your room

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A hands-first mixed-reality drum game for Meta Quest. **Every surface in your room is a drum:** hit your real table and it plays. The table gives you the feel no controller can fake; the game teaches you to play it.

**Play:** open **https://or-6.github.io/thump/** in the Quest browser, sit at a table, and press *Enter mixed reality*. Hands only; nothing to install.

## The first ten minutes

1. A felt pad appears on your real table and lights twice. Tap it: **thump**.
2. A snare slides in. The pads play *boom · tak · boom · tak*; you copy it, and a groove starts under you.
3. A hat joins; copy again. A tiny felt crowd arrives at the back of the table.
4. *Porch Step*: notes slide along your table toward the pads; play along. The crowd is your score.
5. Stars, then a tom slides onto the table and asks for one hit. *Kitchen Clock*.
6. A gong goes up on your real wall (or the table's edge if there's no wall in reach). A felt bird with a tiny drum sits down: *Call & Answer*, it plays, you answer.
7. Pinch a pad to move it: the kit is yours. Then pick songs from the felt cards on your table.

## How it works

- **Strikes** (`src/kit/strike.ts`, unit-tested on synthetic hand paths): the hand's lowest point (palm or fingertips) crossing the table plane fast, or stopping sharply within 1.5 cm of it (hand tracking often loses the last centimetre; the real table stops the real hand). One slap is one hit; resting, reaching and pinching hands never play. The table's height is learned from where your hands actually stop.
- **Sound** (`src/audio/engine.ts`): every drum is synthesised in Web Audio at the moment of the hit, louder and brighter the harder you hit; nothing is sampled.
- **The room**: the kit snaps to a detected table plane, or to where your palm rests; the gong looks for a real wall within reach; the kit is held by a persistent anchor and comes back where you left it.
- **The bandmate** is a rule-based musical agent (`src/bandmate/bandmate.ts`): it listens to your hits and answers with busier or simpler calls; it is not an AI model.

## Status

Verified in the IWSDK emulator and by unit tests. Device numbers (frame rate, hit-to-sound latency) are added here once measured on a Quest 3 with `?debug=1`.

## Develop

```
npm install
npm run typecheck && npx vitest run
npx @iwsdk/cli dev up --headless --allow-browser-automation --ai-mode agent
node tools/e2e-strike.mjs
```

## Licence

Code: MIT (see LICENSE). Fonts: Lilita One, SIL Open Font License (public/fonts).

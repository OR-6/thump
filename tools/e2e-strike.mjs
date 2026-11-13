#!/usr/bin/env node
/**
 * The heart of the game, in the emulator: rest a palm → the kit is placed on the table; slap the
 * kick → it sounds (the kick voice plays, louder for a harder slap), the pad squashes; a slow
 * lowering and a rest do not play; a slap beside the pads knocks the bare table.
 */
import { xr, state, wait, check, done, shot, freshSession, placeKit, measureHand, slap, HAND, DESK_Y } from './e2e-lib.mjs';

await freshSession();
let s = state();
check('starts unplaced', s.debug.phase !== 'placed', `phase=${s.debug.phase}`);
s = await placeKit();
check('kit placed by a resting palm', s.debug.phase === 'placed', `source=${s.debug.deskSource} deskY=${s.debug.deskY}`);
check('the table height is the palm rest', Math.abs(s.debug.deskY - DESK_Y) < 0.012, `deskY=${s.debug.deskY}`);
check('only the kick, at first', JSON.stringify(s.flow.lanes) === '["kick"]', JSON.stringify(s.flow.lanes));
const hand = await measureHand();
s = state();
const kick = s.targets.kick;
check('the kick is within reach', Math.hypot(kick[0] - s.targets.head[0], kick[2] - s.targets.head[2]) < 0.5, JSON.stringify(kick));
shot('strike-01-placed', [kick[0], DESK_Y, kick[2]]);

const before = s.debug.hits;
await slap(hand, kick, { speed: 1.2 });
s = state();
check('a slap on the kick is a hit', s.debug.hits === before + 1 && s.debug.lastHit?.lane === 'kick', JSON.stringify(s.debug.lastHit));
check('the kick sounded', (s.played.kick ?? 0) >= 1 || !s.debug.audio, `played=${JSON.stringify(s.played)} audio=${s.debug.audio}`);
const loud = s.debug.lastHit?.gain ?? 0;
await wait(300);
await slap(hand, kick, { speed: 0.45 });
s = state();
check('a soft tap is a quieter hit', s.debug.hits === before + 2 && s.debug.lastHit.gain < loud, `${s.debug.lastHit?.gain} < ${loud}`);

// lower slowly onto the pad and rest there: no hit
const n = s.debug.hits;
const x = kick[0] - hand.palm[0];
const z = kick[2] - hand.palm[2];
xr('set-transform', { device: HAND, position: { x, y: DESK_Y - hand.low + 0.08, z }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(300);
xr('animate-to', { device: HAND, position: { x, y: DESK_Y - hand.low + 0.001, z }, duration: 0.8 });
await wait(1600);
s = state();
check('lowering a hand slowly and resting is silent', s.debug.hits === n, `hits ${n} → ${s.debug.hits}`);
xr('set-transform', { device: HAND, position: { x, y: DESK_Y + 0.25, z }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(400);

// the bare table, well clear of the kick
const k0 = s.debug.knocks;
await slap(hand, [kick[0] - 0.05, DESK_Y, kick[2] + 0.17], { speed: 1.0 });
s = state();
check('a slap on the bare table knocks', s.debug.knocks === k0 + 1, `knocks ${k0} → ${s.debug.knocks}`);
await slap(hand, kick, { speed: 1.0 });
await wait(200);
shot('strike-02-hit', [kick[0], DESK_Y, kick[2]]);
s = state();
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);
done('E2E strike');

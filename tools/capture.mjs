#!/usr/bin/env node
/**
 * Review and gallery captures from the live game in the emulator (no debug board): the autoplayer
 * discovers the room and plays, and each moment is framed. Writes artifacts/cap/*.png.
 *   node tools/capture.mjs
 */
import { xr, state, wait, goto, placeKit, until, cli, DESK_Y } from './e2e-lib.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('artifacts/cap', { recursive: true });
const shot = (name, look, head) => {
  if (head) xr('set-transform', { device: 'headset', position: { x: head[0], y: head[1], z: head[2] }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  if (look) xr('look-at', { device: 'headset', target: { x: look[0], y: look[1], z: look[2] } });
  cli('browser', 'screenshot', '--output-file', `artifacts/cap/${name}.png`);
};
const SEAT = [0, 1.2, 0];
await goto('');
let s = await placeKit();
const kit = [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05];
await wait(500);
shot('01-hit-anything', kit, SEAT);
// now the autoplayer takes over
await goto('autoplay=1', { clear: true });
s = await placeKit();
s = await until((x) => x.game.found.includes('kit'), 6000, 300);
await wait(700);
shot('02-kit', kit, SEAT);
s = await until((x) => x.game.found.length >= 3, 15000, 400);
s = state();
for (const v of s.debug.surfaces.filter((x) => x.discovered && x.id !== 'kit').slice(0, 3)) {
  const at = s.targets[`surface-${v.id}`];
  const n = s.targets[`normal-${v.id}`];
  if (!at || !n) continue;
  shot(`03-${v.family}-${v.id}`, at, [at[0] + n[0] * 1.0, Math.max(1.2, at[1]), at[2] + n[2] * 1.0]);
}
s = await until((x) => x.game.mode === 'play', 30000, 400);
await wait(6000);
shot('04-song', kit, SEAT);
s = await until((x) => x.game.mode === 'results', 90000, 1000);
await wait(1800);
shot('05-results', kit, SEAT);
console.log('captured', s.game.found.join(','));

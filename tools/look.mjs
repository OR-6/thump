#!/usr/bin/env node
/**
 * One framed look at the desk in the emulator, for art checks: node tools/look.mjs <out.png> <instrument> <menu>
 * <eye dx,dy,dz from the kit> <look dx,dy,dz from the kit>. Places the kit first if it isn't.
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { xr, goto, placeKit, measureHand, slap, wait, state, run, HAND, DESK_Y } from './e2e-lib.mjs';

const [out, inst = 'drums', menu = 'free', eye = '0,0.42,0.34', at = '0,0,-0.03'] = process.argv.slice(2);
let s = state();
if (!s.debug?.kitOrigin) {
  await goto('debug=1&shots=1');
  s = await placeKit();
  const k = s.debug.kitOrigin;
  await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
  await wait(2000);
  s = state();
}
const k = s.debug.kitOrigin;
writeFileSync('tools/.look.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; r.putOut(${JSON.stringify(inst)}); r.game.menu = ${JSON.stringify(menu)}; r.game.refreshDisplay(); }); }\n`);
run('tools/.look.mjs');
rmSync('tools/.look.mjs', { force: true });
xr('set-transform', { device: HAND, position: { x: 0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
xr('set-transform', { device: 'hand-left', position: { x: -0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(1500);
const e = eye.split(',').map(Number);
const a = at.split(',').map(Number);
xr('set-transform', { device: 'headset', position: { x: k[0] + e[0], y: k[1] + e[1], z: k[2] + e[2] } });
xr('look-at', { device: 'headset', target: { x: k[0] + a[0], y: k[1] + a[1], z: k[2] + a[2] } });
await wait(700);
execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/shot-hd.mjs']);
execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-i', 'artifacts/shot-hd.png', '-vf', 'crop=ih*0.74*16/9:ih*0.74:(iw-ih*0.74*16/9)/2:0', out]);
console.log(out);

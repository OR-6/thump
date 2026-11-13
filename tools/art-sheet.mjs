#!/usr/bin/env node
/**
 * Contact sheets for the art standard (docs/ART-13NOV.md): each instrument on the desk in the emulator, from the
 * seated view (eyes 40 cm over the desk, 45 cm back from the instrument) and a quarter view, saved under
 * docs/art/<instrument>/seated.png and quarter.png. Run with the dev server up: node tools/art-sheet.mjs [ids...]
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cli, xr, goto, placeKit, measureHand, slap, wait, HAND, DESK_Y } from './e2e-lib.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['drums', 'piano', 'marimba', 'guitar', 'congas', 'handpan'];
const put = (id) => {
  writeFileSync('tools/.put-out.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump?.game; r.putOut(${JSON.stringify(id)}); return r.kit.inst; }); }\n`);
  cli('browser', 'run', 'tools/.put-out.mjs');
};
const view = (name, eye, at) => {
  xr('set-transform', { device: 'headset', position: { x: eye[0], y: eye[1], z: eye[2] } });
  xr('look-at', { device: 'headset', target: { x: at[0], y: at[1], z: at[2] } });
  execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/shot-hd.mjs']);
  // the middle of the headset view, 16:9 (about what a seated head takes in)
  execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-i', 'artifacts/shot-hd.png', '-vf', 'crop=ih*16/9:ih', name]);
};

await goto('debug=1');
const s = await placeKit();
const k = s.debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(2500);
// hands out of the frame
xr('set-transform', { device: HAND, position: { x: 0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
xr('set-transform', { device: 'hand-left', position: { x: -0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
for (const id of ids) {
  put(id);
  await wait(1500);
  mkdirSync(`docs/art/${id}`, { recursive: true });
  const at = [k[0], DESK_Y + 0.01, k[2] - 0.03];
  view(`docs/art/${id}/seated.png`, [k[0], DESK_Y + 0.4, k[2] + 0.45], at);
  view(`docs/art/${id}/quarter.png`, [k[0] + 0.32, DESK_Y + 0.28, k[2] + 0.3], at);
  console.log(`${id}: docs/art/${id}/seated.png, quarter.png`);
}
rmSync('tools/.put-out.mjs', { force: true });

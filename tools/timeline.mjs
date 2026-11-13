#!/usr/bin/env node
/**
 * Every line the module shows, in order, through one autoplay run (find things, build, perform, results), with
 * screenshots at each mode change. What a critic reads instead of wearing the headset.
 *   node tools/timeline.mjs [OUT_DIR]       default artifacts/timeline
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { goto, placeKit, state, wait, shot, DESK_Y } from './e2e-lib.mjs';

const out = process.argv[2] ?? 'artifacts/timeline';
mkdirSync(out, { recursive: true });
await goto('autoplay=1&debug=1');
let s = await placeKit();
const t0 = Date.now();
const lines = [];
let last = '';
let mode = '';
let n = 0;
while (Date.now() - t0 < 360000) {
  s = state();
  const d = s.game.display;
  const key = `${s.game.mode} | ${d.line} | ${d.sub}`;
  if (key !== last) {
    lines.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${key}${d.stars >= 0 ? `  stars=${d.stars}` : ''}`);
    last = key;
  }
  if (s.game.mode !== mode) {
    mode = s.game.mode;
    shot(`timeline-${String(++n).padStart(2, '0')}-${mode}`, [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05]);
  }
  if (s.game.mode === 'results' && Date.now() - t0 > 20000) {
    await wait(4000);
    s = state();
    lines.push(`(results) ${s.game.display.line} | ${s.game.display.sub} | last=${JSON.stringify(s.game.last)}`);
    break;
  }
  await wait(400);
}
writeFileSync(`${out}/timeline.txt`, lines.join('\n') + '\n');
console.log(lines.join('\n'));

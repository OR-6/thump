#!/usr/bin/env node
/**
 * The piano's keys hold, as a real keyboard's do: a fingertip pressed down and kept there keeps its note sounding
 * past the end of its recording; lifting the finger lets it go; a quick tap is still a note that ends by itself.
 *   node tools/e2e-hold.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { xr, state, wait, check, done, goto, placeKit, until, run, HAND, DESK_Y } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.hold-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; const A = window.__thump.audio; ${body} }); }\n`);
  const o = run('tools/.hold-js.mjs');
  rmSync('tools/.hold-js.mjs', { force: true });
  return o;
};
// the piano's held voices now: how many, and the loudest one's gain
const held = () => js(`const now = A.ctx.currentTime; const v = A.voices.filter((x) => x.owner.startsWith('key') && x.end > now); return { n: v.length, held: v.filter((x) => x.held).length, gain: Math.max(0, ...v.map((x) => x.g.gain.value)) };`);

/** A fingertip pressed down onto `at` (and, unless `hold`, lifted straight off). Returns the lift. */
async function press(at, { from = 0.06, hold = false } = {}) {
  const pose = { pitch: -50, yaw: 0, roll: 0 };
  const P = [at[0], at[1] + 0.3, at[2]];
  xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: pose });
  await wait(300);
  const h = state().right;
  const pts = [[h.indexTip, h.tipRadius], [h.middleTip, h.tipRadius], [h.ringTip, h.tipRadius], [h.palm, h.palmRadius]];
  let low = Infinity;
  let lowPt = null;
  for (const [p, r] of pts) {
    const d = p[1] - P[1] - r;
    if (d < low) {
      low = d;
      lowPt = p;
    }
  }
  const base = (d) => ({ x: at[0] - (lowPt[0] - P[0]), y: at[1] + d - low, z: at[2] - (lowPt[2] - P[2]) });
  xr('set-transform', { device: HAND, position: base(from), orientation: pose });
  await wait(250);
  xr('animate-to', { device: HAND, position: base(-0.004), duration: from });
  await wait(from * 1000 + 150);
  const lift = async (d = 0.12) => {
    xr('animate-to', { device: HAND, position: base(d), duration: 0.12 });
    await wait(200);
  };
  if (!hold) await lift();
  return lift;
}

await goto('debug=1');
let s = await placeKit();
await press([s.targets.table[0] + 0.06, DESK_Y, s.targets.table[2]], { from: 0.08 });
await until((x) => x.game.found.includes('kit'), 3000);
js(`r.putOut('piano'); return 1;`);
await wait(1500);
s = state();
check('the piano is out', s.targets.inst?.[0] === 1, JSON.stringify(s.targets.inst));
const key = s.targets.inst2.map((v, i) => v - (i === 1 ? 0.01 : 0));

// held: the recordings run 0.6–1.3 s; at 1.6 s the note is still sounding
let hits = s.debug.hits;
const lift = await press(key, { hold: true });
s = state();
check('a fingertip pressing a key plays it', s.debug.hits > hits && /piano/.test(s.debug.lastHit?.family ?? ''), JSON.stringify(s.debug.lastHit));
await wait(1600);
let h = held();
check('held down, the note sounds on past its recording (1.6 s in)', h.held >= 1 && h.gain > 0.05, JSON.stringify(h));
await lift(0.03);
await wait(700);
h = held();
check('lifting the finger lets the note go', h.held === 0 && h.gain < 0.02, JSON.stringify(h));

// a quick tap: a note, gone by itself within about a second and a half
hits = state().debug.hits;
await press(key);
s = state();
check('a quick tap plays the key', s.debug.hits > hits, `${hits} -> ${s.debug.hits}`);
await wait(1500);
h = held();
check('and the tapped note is over (nothing left held)', h.held === 0 && h.gain < 0.02, JSON.stringify(h));
check('no frame errors', state().debug.errors === 0, `errors=${state().debug.errors}`);
done('E2E hold');

#!/usr/bin/env node
/**
 * Moving the instruments: pinch the move handle on the desk (front left), carry it 12 cm to the right, let go. The
 * whole setup goes with it and turns to face you, the move is saved, and the drums still play where they now stand.
 *   node tools/e2e-move.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { xr, goto, placeKit, wait, run, state, check, done, slap, measureHand, DESK_Y, HAND } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.move-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.move-js.mjs');
  rmSync('tools/.move-js.mjs', { force: true });
  return o;
};
const POSE = { pitch: -30, yaw: 0, roll: 0 };

await goto('', { clear: true });
let s = await placeKit();
const k0 = s.debug.kitOrigin;
// the drums found first (the handle is for a setup that's out)
await slap(await measureHand(), [k0[0] + 0.06, DESK_Y, k0[2]]);
await wait(800);
const puck = js(`const p = r.movePuck; return p && p.visible ? p.getWorldPosition(p.position.clone()).toArray() : null;`);
check('the move handle is on the desk', !!puck, JSON.stringify(puck));

// put the hand so its pinch lands on the handle (aim, see where the pinch point is, correct)
xr('set-transform', { device: HAND, position: { x: puck[0], y: puck[1] + 0.06, z: puck[2] + 0.05 }, orientation: POSE });
await wait(300);
xr('set-select-value', { device: HAND, value: 1 });
await wait(300);
const pp = state().right.pinchPoint;
xr('set-select-value', { device: HAND, value: 0 });
await wait(300);
const at = { x: puck[0] + (puck[0] - pp[0]), y: puck[1] + 0.06 + (puck[1] - pp[1]), z: puck[2] + 0.05 + (puck[2] - pp[2]) };
xr('set-transform', { device: HAND, position: at, orientation: POSE });
await wait(300);
xr('set-select-value', { device: HAND, value: 1 });
await wait(400);
check('a pinch on it takes hold', js(`return r.moveHand;`) === 1);
// carry it 12 cm right, in steps
for (let i = 1; i <= 6; i++) {
  xr('set-transform', { device: HAND, position: { x: at.x + 0.02 * i, y: at.y, z: at.z }, orientation: POSE });
  await wait(120);
}
await wait(300);
xr('set-select-value', { device: HAND, value: 0 });
await wait(800);
s = state();
const k1 = s.debug.kitOrigin;
check('the instruments moved with the hand (about 12 cm right)', Math.abs(k1[0] - k0[0] - 0.12) < 0.03 && Math.abs(k1[2] - k0[2]) < 0.03 && Math.abs(k1[1] - k0[1]) < 0.005, `${k0} -> ${k1}`);
const nudge = js(`return r.settings.kitNudge ?? null;`);
check('the move is saved', !!nudge && Math.hypot(nudge.a, nudge.l) > 0.08, JSON.stringify(nudge));
check('let go: nothing held', js(`return r.moveHand;`) === -1);

// the drums play where they stand now
const hits = s.debug.hits;
xr('set-transform', { device: HAND, position: { x: 0.6, y: 1.3, z: 0.2 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(300);
await slap(await measureHand(), [k1[0] + 0.06, DESK_Y, k1[2]]);
await wait(500);
s = state();
check('the drums play in their new place', s.debug.hits > hits, JSON.stringify(s.debug.lastHit));
done('E2E move');

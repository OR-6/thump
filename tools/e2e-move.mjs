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
const yaw0 = js(`return r.kit.root.rotation.y;`);
// carry it 12 cm right, in steps
for (let i = 1; i <= 6; i++) {
  xr('set-transform', { device: HAND, position: { x: at.x + 0.02 * i, y: at.y, z: at.z }, orientation: POSE });
  await wait(120);
}
await wait(300);
const yaw1 = js(`return r.kit.root.rotation.y;`);
const face = js(`const o = r.kit.root.getWorldPosition(r.kit.root.position.clone()); return Math.atan2(-(o.x - r.head.x), -(o.z - r.head.z));`);
check('carried, it turns to face you (and only about the vertical)', Math.abs(Math.atan2(Math.sin(yaw1 - face), Math.cos(yaw1 - face))) < 0.04 && Math.abs(yaw1 - yaw0) > 0.05, `${yaw0} -> ${yaw1}, facing ${face}`);
const level = js(`const q = r.kit.root.rotation; return Math.abs(q.x) + Math.abs(q.z);`);
check('and stays level', level < 1e-3, String(level));

xr('set-select-value', { device: HAND, value: 0 });
await wait(800);
s = state();
const k1 = s.debug.kitOrigin;
check('the instruments moved as far as the hand (12 cm right, the desk\'s height kept)', Math.abs(k1[0] - k0[0] - 0.12) < 0.02 && Math.abs(k1[2] - k0[2]) < 0.02 && Math.abs(k1[1] - k0[1]) < 0.005, `${k0} -> ${k1}`);
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

// up as well: pinch the handle again and lift it 6 cm; the instruments rise with it and the height is kept
const puck2 = js(`const p = r.movePuck; return p.getWorldPosition(p.position.clone()).toArray();`);
xr('set-transform', { device: HAND, position: { x: puck2[0], y: puck2[1] + 0.06, z: puck2[2] + 0.05 }, orientation: POSE });
await wait(300);
xr('set-select-value', { device: HAND, value: 1 });
await wait(300);
const pp2 = state().right.pinchPoint;
xr('set-select-value', { device: HAND, value: 0 });
await wait(300);
const at2 = { x: puck2[0] + (puck2[0] - pp2[0]), y: puck2[1] + 0.06 + (puck2[1] - pp2[1]), z: puck2[2] + 0.05 + (puck2[2] - pp2[2]) };
xr('set-transform', { device: HAND, position: at2, orientation: POSE });
await wait(300);
xr('set-select-value', { device: HAND, value: 1 });
await wait(400);
for (let i = 1; i <= 6; i++) {
  xr('set-transform', { device: HAND, position: { x: at2.x, y: at2.y + 0.01 * i, z: at2.z }, orientation: POSE });
  await wait(120);
}
await wait(300);
xr('set-select-value', { device: HAND, value: 0 });
await wait(800);
const k2 = state().debug.kitOrigin;
check('lifted 6 cm, the instruments rise with it', Math.abs(k2[1] - k1[1] - 0.06) < 0.012, `${k1} -> ${k2}`);
const nudge2 = js(`return r.settings.kitNudge ?? null;`);
check('and the height is kept', !!nudge2 && Math.abs((nudge2.h ?? 0) - 0.06) < 0.012, JSON.stringify(nudge2));
done('E2E move');

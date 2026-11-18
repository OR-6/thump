#!/usr/bin/env node
/**
 * The instruments come out at once, in front of you, and stay where you can play them: a palm on the desk sets the
 * height, a recentre or a return to the headset brings them back in front of you, so does wandering off, and Start
 * over puts them out fresh where you're looking.
 *   node tools/e2e-spawn.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { xr, goto, wait, run, state, check, done, DESK_Y, HAND, FLAT } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.spawn-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.spawn-js.mjs');
  rmSync('tools/.spawn-js.mjs', { force: true });
  return o;
};
const kit = () => js(`const o = r.kit.root.getWorldPosition(r.kit.root.position.clone()); return { x: o.x, y: o.y, z: o.z, yaw: r.kit.root.rotation.y, rx: r.kit.root.rotation.x, rz: r.kit.root.rotation.z, visible: r.kit.root.visible, phase: r.placement.phase, source: r.placement.source };`);
const facing = (k, head) => {
  const f = Math.atan2(-(k.x - head.x), -(k.z - head.z));
  return Math.abs(Math.atan2(Math.sin(k.yaw - f), Math.cos(k.yaw - f)));
};

await goto('', { clear: true });
await wait(900);
let k = kit();
check('out within a second of entering, no palm needed', k.phase === 'placed' && k.visible, JSON.stringify(k));
check('straight ahead of you, facing you, level', Math.abs(k.x) < 0.03 && k.z < -0.2 && k.z > -0.5 && facing(k, { x: 0, z: 0 }) < 0.05 && Math.abs(k.rx) + Math.abs(k.rz) < 1e-4, JSON.stringify(k));
check('at a desk height below the eyes', 1.2 - k.y > 0.25 && 1.2 - k.y < 0.65, String(k.y));

// a palm flat on the desk: it glides onto the desk's height (and only the height)
xr('set-transform', { device: HAND, position: { x: 0.05, y: DESK_Y + 0.02, z: -0.34 }, orientation: FLAT });
await wait(2300);
xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
await wait(300);
const k2 = kit();
check('a palm on the desk sets its height', Math.abs(k2.y - DESK_Y) < 0.04 && Math.abs(k2.x - k.x) < 0.005 && Math.abs(k2.z - k.z) < 0.005, `${k.y} -> ${k2.y}`);
check('and the height is kept for next time', Math.abs(js(`return r.settings.deskDrop ?? 0;`) - (1.2 - k2.y)) < 0.03);

// Quest recentres: you're now looking to your right; the world moved under the kit, so it comes back where you look
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: -90, roll: 0 } });
await wait(300);
js(`r.onRefReset(); return 1;`);
await wait(900);
const k3 = kit();
const head = js(`return { x: r.head.x, z: r.head.z };`);
check('after a recentre it comes back in front of you, facing you', k3.x > 0.2 && Math.abs(k3.z) < 0.05 && facing(k3, head) < 0.05, JSON.stringify(k3));
check('at the desk height it had', Math.abs(k3.y - k2.y) < 0.01, `${k2.y} -> ${k3.y}`);

// back in the headset with it still where it was: it stays put
js(`r.recallCheckAt = r.clock.t; return 1;`);
await wait(500);
const k4 = kit();
check('a return with nothing moved leaves it be', Math.hypot(k4.x - k3.x, k4.z - k3.z) < 0.005, `${JSON.stringify(k3)} -> ${JSON.stringify(k4)}`);

// wander 2 m off: after a few seconds it comes to you
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 2 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(5200);
const k5 = kit();
check('out of reach for a few seconds, it comes back to you', Math.hypot(k5.x - 0, k5.z - 2) < 0.6 && k5.z < 2, JSON.stringify(k5));
check('still level', Math.abs(k5.rx) + Math.abs(k5.rz) < 1e-4);

// Start over: out fresh where you look now (a move you'd made forgotten)
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 45, roll: 0 } });
await wait(300);
js(`r.settings = { ...r.settings, kitNudge: { a: 0.2, l: 0.3 } }; window.dispatchEvent(new Event('thump:reset')); return 1;`);
await wait(700);
const k6 = kit();
check('Start over puts it out in front of where you look', k6.x < -0.15 && k6.z < -0.15 && facing(k6, { x: 0, z: 0 }) < 0.05 && Math.hypot(k6.x, k6.z) < 0.45, JSON.stringify(k6));
check('and forgets the move', !js(`return r.settings.kitNudge ?? null;`));
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
done('E2E spawn');

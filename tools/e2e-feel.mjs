#!/usr/bin/env node
/**
 * Hands making sounds of their own: palms meeting clap (also when the tracking loses a hand at the moment of contact),
 * two sticks knocked together click (a real wood click), fists meeting don't clap, open hands don't click; and the
 * stick sits in the hand where a stick is held (the grip at the thumb, reaching 28 cm, across the palm toward the
 * thumb). The emulator can't make a fist, so the hands' curl is read as a fist for the stick part.
 *   node tools/e2e-feel.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { xr, state, wait, check, done, goto, placeKit, slap, measureHand, DESK_Y, run } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.feel-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; const H = window.__thump.hands; ${body} }); }\n`);
  const o = run('tools/.feel-js.mjs');
  rmSync('tools/.feel-js.mjs', { force: true });
  return o;
};
const dbg = () => js(`return { claps: r.debug.claps ?? 0, clicks: r.debug.clicks ?? 0, fists: [r.fist[0], r.fist[1]], errors: r.debug.errors };`);
const FWD = { pitch: 0, yaw: 0, roll: 0 };
const put = (side, p, o = FWD) => xr('set-transform', { device: side, position: { x: p[0], y: p[1], z: p[2] }, orientation: o });
const go = (side, p, ms, o = FWD) => xr('animate-to', { device: side, position: { x: p[0], y: p[1], z: p[2] }, orientation: o, duration: ms / 1000 });

await goto('debug=1');
const k = (await placeKit()).debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(800);

// ---- a clap: palms (facing each other) together fast
const LP = { pitch: 0, yaw: 0, roll: -90 };
const RP = { pitch: 0, yaw: 0, roll: 90 };
let s = dbg();
put('hand-left', [-0.25, 1.25, -0.35], LP);
put('hand-right', [0.25, 1.25, -0.35], RP);
await wait(400);
go('hand-left', [-0.02, 1.25, -0.35], 150, LP);
go('hand-right', [0.02, 1.25, -0.35], 150, RP);
await wait(500);
let n = dbg();
check('palms meeting: a clap', n.claps === s.claps + 1, `${s.claps} -> ${n.claps}`);

// ---- a clap the tracking loses at contact: closing fast, then one hand gone
put('hand-left', [-0.3, 1.25, -0.35], LP);
put('hand-right', [0.3, 1.25, -0.35], RP);
await wait(500);
s = dbg();
go('hand-left', [-0.04, 1.25, -0.35], 200, LP);
go('hand-right', [0.04, 1.25, -0.35], 200, RP);
await wait(150);
xr('set-connected', { device: 'hand-left', connected: false });
await wait(400);
n = dbg();
xr('set-connected', { device: 'hand-left', connected: true });
check('lost by the tracking as they meet: still a clap', n.claps === s.claps + 1, `${s.claps} -> ${n.claps}`);
await wait(500);

// ---- open hands brought together slowly: nothing
put('hand-left', [-0.25, 1.25, -0.35], LP);
put('hand-right', [0.25, 1.25, -0.35], RP);
await wait(400);
s = dbg();
go('hand-left', [-0.02, 1.25, -0.35], 1500, LP);
go('hand-right', [0.02, 1.25, -0.35], 1500, RP);
await wait(1800);
n = dbg();
check('hands brought together slowly: no clap, no click', n.claps === s.claps && n.clicks === s.clicks, JSON.stringify([s, n]));

// ---- sticks: both hands fists (the curl read as closed), held in front, then knocked together
js(`r.curl = () => 0; return 1;`);
// (held apart, the left a little higher: the sticks, angled in as a grip holds them, pass over each other)
put('hand-left', [-0.26, 1.17, -0.3]);
put('hand-right', [0.26, 1.1, -0.3]);
await wait(600);
n = dbg();
check('both hands are fists: sticks', n.fists[0] && n.fists[1], JSON.stringify(n.fists));
// where the stick sits in the right hand
const g = js(`const i = 1, h = H.right; const tip = r.stickTip[i], grip = r.stickGrip[i], dir = r.stickDir[i];
  const fwd = h.knuckleMiddle.clone().sub(h.wrist).normalize(); const across = h.knuckleIndex.clone().sub(h.knucklePinky).normalize();
  return { reach: tip.distanceTo(grip), toThumb: grip.distanceTo(h.thumbTip), angle: Math.acos(Math.max(-1, Math.min(1, dir.dot(fwd)))) * 180 / Math.PI, towardThumb: dir.dot(across) };`);
check('the stick reaches 28 cm past the grip', Math.abs(g.reach - 0.28) < 0.005, `${g.reach}`);
check('the grip is where the thumb holds it (within 3 cm of the thumb tip)', g.toThumb < 0.03, `${g.toThumb}`);
check('it runs forward and across the palm toward the thumb (20–70 degrees off the hand)', g.angle > 20 && g.angle < 70 && g.towardThumb > 0.2, JSON.stringify(g));
// knock: the left stick's middle onto the right stick's middle, fast
const mids = js(`const m = (i) => r.stickButt[i].clone().lerp(r.stickTip[i], 0.55); const a = m(0), b = m(1); return { d: [b.x - a.x, b.y - a.y, b.z - a.z] };`);
const L0 = [-0.26, 1.17, -0.3];
s = dbg();
go('hand-left', [L0[0] + mids.d[0], L0[1] + mids.d[1] + 0.004, L0[2] + mids.d[2]], 110);
await wait(500);
n = dbg();
check('two sticks knocked together: a wood click', n.clicks === s.clicks + 1, `${s.clicks} -> ${n.clicks}`);
check('and fists meeting are not a clap', n.claps === s.claps, `${s.claps} -> ${n.claps}`);
go('hand-left', L0, 300);
await wait(500);
s = dbg();
go('hand-left', [L0[0] + mids.d[0], L0[1] + mids.d[1] + 0.004, L0[2] + mids.d[2]], 110);
await wait(500);
n = dbg();
check('and again: one click per knock', n.clicks === s.clicks + 1, `${s.clicks} -> ${n.clicks}`);
check('no frame errors', n.errors === 0, `errors=${n.errors}`);
done('E2E feel');

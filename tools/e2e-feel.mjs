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
const dbg2 = () => js(`return { taps: r.debug.taps ?? 0 };`);
const FWD = { pitch: 0, yaw: 0, roll: 0 };
/** A drummer's fist: pitched down at the drums (the emulator's own hand points a little up). */
const GRIP = { pitch: -35, yaw: 0, roll: 0 };
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
put('hand-left', [-0.26, 1.17, -0.3], GRIP);
put('hand-right', [0.26, 1.1, -0.3], GRIP);
await wait(600);
n = dbg();
check('both hands are fists: sticks', n.fists[0] && n.fists[1], JSON.stringify(n.fists));
// where the stick sits in the right hand
const g = js(`const i = 1, h = H.right; const tip = r.stickTip[i], grip = r.stickGrip[i], dir = r.stickDir[i];
  const fwd = h.knuckleMiddle.clone().sub(h.wrist).normalize(); const across = h.knuckleIndex.clone().sub(h.knucklePinky).normalize();
  return { reach: tip.distanceTo(grip), toThumb: grip.distanceTo(h.thumbTip), toPalm: grip.distanceTo(h.palm), toKnuckles: grip.distanceTo(h.knuckleIndex.clone().add(h.knucklePinky).multiplyScalar(0.5)), angle: Math.acos(Math.max(-1, Math.min(1, dir.dot(fwd)))) * 180 / Math.PI, towardThumb: dir.dot(across) };`);
check('the stick reaches 28 cm past the grip', Math.abs(g.reach - 0.28) < 0.005, `${g.reach}`);
// (in the hollow of the fist, not on the thumb, which moves about on its own: within 7 cm of the palm's middle and of
// the knuckles' line on the emulator's open hand read as a fist; nearer in a real fist, its fingers curled in)
check('the grip is in the hollow of the hand, between the palm and the knuckles', g.toPalm < 0.07 && g.toKnuckles < 0.07, JSON.stringify(g));
check('it runs forward and across the palm toward the thumb (20–70 degrees off the hand)', g.angle > 20 && g.angle < 70 && g.towardThumb > 0.2, JSON.stringify(g));
// knock: the left stick's middle onto the right stick's middle, fast
const mids = js(`const m = (i) => r.stickButt[i].clone().lerp(r.stickTip[i], 0.55); const a = m(0), b = m(1); return { d: [b.x - a.x, b.y - a.y, b.z - a.z] };`);
const L0 = [-0.26, 1.17, -0.3];
s = dbg();
go('hand-left', [L0[0] + mids.d[0], L0[1] + mids.d[1] + 0.004, L0[2] + mids.d[2]], 110, GRIP);
await wait(500);
n = dbg();
check('two sticks knocked together: a wood click', n.clicks === s.clicks + 1, `${s.clicks} -> ${n.clicks}`);
check('and fists meeting are not a clap', n.claps === s.claps, `${s.claps} -> ${n.claps}`);
go('hand-left', L0, 300, GRIP);
await wait(500);
s = dbg();
go('hand-left', [L0[0] + mids.d[0], L0[1] + mids.d[1] + 0.004, L0[2] + mids.d[2]], 110, GRIP);
await wait(500);
n = dbg();
check('and again: one click per knock', n.clicks === s.clicks + 1, `${s.clicks} -> ${n.clicks}`);
// ---- a stick doesn't sink through a head: pushed 2 cm into the snare, it's drawn resting on it; pushed 10 cm, it
// goes with the hand
const into = async (deep) => {
  const p = js(`const t = r.stickTip[1].clone(), sn = r.kit.pad('snare'); const w = r.kit.root.localToWorld(r.head.clone().set(sn.x, sn.topY, sn.z)); return { tip: t.toArray(), at: w.toArray() };`);
  const h = js(`return H.right.wrist.toArray();`);
  // (the hand device sits a little off the wrist; move it by how far the tip has to go)
  const dev = js(`return 0;`);
  void dev;
  const R0 = [0.26, 1.1, -0.3];
  const target = [R0[0] + p.at[0] - p.tip[0], R0[1] + p.at[1] - p.tip[1] - deep, R0[2] + p.at[2] - p.tip[2]];
  void h;
  put('hand-right', target, GRIP);
  await wait(500);
  return js(`const inv = r.kit.root.matrixWorld.clone().invert(); const d = r.malletTip[1].clone().applyMatrix4(inv), real = r.stickTip[1].clone().applyMatrix4(inv), sn = r.kit.pad('snare');
    return { drawnAbove: d.y - sn.topY, realAbove: real.y - sn.topY, len: r.malletTip[1].distanceTo(r.stickGrip[1]), moved: r.malletTip[1].distanceTo(r.stickTip[1]) };`);
};
put('hand-left', [-0.4, 1.3, -0.2]);
put('hand-right', [0.26, 1.1, -0.3], GRIP);
await wait(500);
let rest = await into(0.02);
check('a stick pushed 2 cm into the snare is drawn resting on its head', Math.abs(rest.drawnAbove - 0.006) < 0.004 && rest.realAbove < -0.01 && Math.abs(rest.len - 0.28) < 0.005, JSON.stringify(rest));
put('hand-right', [0.26, 1.1, -0.3], GRIP);
await wait(400);
rest = await into(0.1);
check('pushed 10 cm through, it goes with the hand', rest.moved < 0.002, JSON.stringify(rest));
// ---- where you're about to hit: a stick 3 cm over the snare shows a ring on it; 15 cm up, nothing
put('hand-right', [0.26, 1.1, -0.3], GRIP);
await wait(400);
await into(-0.03);
let aim = js(`const m = r.aimMarks?.rings?.[1]; return { on: !!m?.visible, s: m?.scale.x ?? 0 };`);
check('a stick 3 cm over the snare: a ring on the head under it', aim.on && aim.s > 0.004 && aim.s < 0.015, JSON.stringify(aim));
put('hand-right', [0.26, 1.1, -0.3], GRIP);
await wait(400);
await into(-0.15);
aim = js(`const m = r.aimMarks?.rings?.[1]; return { on: !!m?.visible };`);
check('15 cm up: no ring', !aim.on, JSON.stringify(aim));
// ---- the guitar in your lap: pinch its headstock and carry it; it stays where you let go, and is kept
js(`r.curl = () => 1; r.putOut('guitar'); return 1;`);
await wait(1500);
put('hand-left', [-0.5, 1.4, -0.1]);
put('hand-right', [0.5, 1.4, -0.1]);
await wait(400);
const g0 = js(`const V = r.head.constructor; return { lap: r.guitarLap, head: r.heldWorld(-0.45 - 0.1 * Math.cos(0.23), 0.007 - 0.1 * Math.sin(0.23), 0, new V()).toArray(), hole: r.heldWorld(0.052, 0, 0, new V()).toArray() };`);
check('the guitar comes out in your lap', g0.lap === true, JSON.stringify(g0));
// (the right hand's pinch point onto the headstock: the hand moved by how far its pinch is from it)
// (the pinch point as it is while pinching: the fingers closing move it)
xr('set-select-value', { device: 'hand-right', value: 1 });
await wait(400);
const pp = js(`return H.right.pinchPoint.toArray();`);
xr('set-select-value', { device: 'hand-right', value: 0 });
await wait(300);
const R1 = [0.5 + g0.head[0] - pp[0], 1.4 + g0.head[1] - pp[1], -0.1 + g0.head[2] - pp[2]];
put('hand-right', R1);
await wait(300);
xr('set-select-value', { device: 'hand-right', value: 1 });
await wait(400);
go('hand-right', [R1[0], R1[1] + 0.1, R1[2]], 400);
await wait(700);
xr('set-select-value', { device: 'hand-right', value: 0 });
await wait(400);
const g1 = js(`const V = r.head.constructor; return { hole: r.heldWorld(0.052, 0, 0, new V()).toArray(), saved: r.settings.guitarAt ?? null };`);
check('pinched by its headstock and lifted 10 cm, the guitar comes with the hand', Math.abs(g1.hole[1] - g0.hole[1] - 0.1) < 0.02, JSON.stringify([g0.hole, g1.hole]));
check('and where you put it is kept', !!g1.saved, JSON.stringify(g1.saved));
js(`const s = { ...r.settings }; delete s.guitarAt; r.settings = s; return 1;`);

// ---- a pick: pinch with the strumming hand and one is between thumb and finger; its tip strums
const st0 = state();
const at = st0.targets.strum;
const dn = st0.targets.strumDown;
const nrm = st0.targets.guitarNormal;
const PP = [at[0] + nrm[0] * 0.2, at[1] + nrm[1] * 0.2, at[2] + nrm[2] * 0.2];
const PO = { pitch: -40, yaw: 0, roll: 0 };
put('hand-right', PP, PO);
await wait(300);
xr('set-select-value', { device: 'hand-right', value: 1 });
await wait(400);
const pk = js(`return { on: r.pickOn[1], shown: !!r.pickMesh[1]?.visible, tip: r.pickTip[1].toArray() };`);
check('a pinch with the strumming hand holds a pick', pk.on && pk.shown, JSON.stringify(pk));
const po = [PP[0] - pk.tip[0], PP[1] - pk.tip[1], PP[2] - pk.tip[2]];
const pp2 = (k) => [at[0] + dn[0] * k + po[0] - nrm[0] * 0.004, at[1] + dn[1] * k + po[1] - nrm[1] * 0.004, at[2] + dn[2] * k + po[2] - nrm[2] * 0.004];
put('hand-right', pp2(-0.06), PO);
await wait(300);
let h0 = state().debug.hits;
go('hand-right', pp2(0.06), 120, PO);
await wait(500);
let sx = state();
check('swept across the strings, the pick strums', sx.debug.lastHit?.family === 'strum' && sx.debug.hits > h0, JSON.stringify(sx.debug.lastHit));
xr('set-select-value', { device: 'hand-right', value: 0 });
await wait(400);
check('open the hand and the pick is gone', js(`return !r.pickOn[1] && !r.pickMesh[1]?.visible;`), '');

// ---- a knock on the guitar's body: a fingertip striking its top off the strings, out on the lower bout
const kn = js(`const V = r.head.constructor; return r.heldWorld(0.26, 0, 0.07, new V()).toArray();`);
const KP = [kn[0] + nrm[0] * 0.2, kn[1] + nrm[1] * 0.2, kn[2] + nrm[2] * 0.2];
put('hand-right', KP, PO);
await wait(300);
const ti = state().right.indexTip;
const ko = [KP[0] - ti[0], KP[1] - ti[1], KP[2] - ti[2]];
const kp = (d) => [kn[0] + nrm[0] * d + ko[0], kn[1] + nrm[1] * d + ko[1], kn[2] + nrm[2] * d + ko[2]];
put('hand-right', kp(0.06), PO);
await wait(300);
const t0 = dbg2();
go('hand-right', kp(-0.012), 80, PO);
await wait(400);
const t1 = dbg2();
check('a fingertip knocked on the body, off the strings: a knock', t1.taps === t0.taps + 1, `${t0.taps} -> ${t1.taps}`);
n = dbg();
check('no frame errors', n.errors === 0, `errors=${n.errors}`);
done('E2E feel');

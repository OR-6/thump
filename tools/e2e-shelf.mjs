#!/usr/bin/env node
/**
 * The instrument shelf, in the emulator: the kit comes out on the first slap; ▶ on the module (the > key) puts a
 * piano on the desk, then a guitar, then a handpan, then the drums again. Each one plays where you hit it: a piano key
 * sounds its note, a guitar chord pad then the strum band strum, a handpan note rings. NOTES changes the scale.
 */
import { xr, state, wait, check, done, shot, goto, placeKit, until, run, HAND, DESK_Y } from './e2e-lib.mjs';
import { writeFileSync } from 'node:fs';

const FLAT = { pitch: 0, yaw: 0, roll: 0 };
async function slapAt(at, n = [0, 1, 0], { speed = 1.0, from = 0.08, pose = FLAT } = {}) {
  const P = [at[0] + n[0] * 0.3, at[1] + n[1] * 0.3, at[2] + n[2] * 0.3];
  xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: pose });
  await wait(300);
  const h = state().right;
  const pts = [[h.palm, h.palmRadius], [h.indexTip, h.tipRadius], [h.middleTip, h.tipRadius], [h.ringTip, h.tipRadius], [h.knuckleIndex, 0.011], [h.knucklePinky, 0.011]];
  let low = Infinity;
  let lowPt = null;
  for (const [p, r] of pts) {
    const d = (p[0] - P[0]) * n[0] + (p[1] - P[1]) * n[1] + (p[2] - P[2]) * n[2] - r;
    if (d < low) {
      low = d;
      lowPt = p;
    }
  }
  const side = [lowPt[0] - P[0], lowPt[1] - P[1], lowPt[2] - P[2]];
  const along = side[0] * n[0] + side[1] * n[1] + side[2] * n[2];
  const lat = [side[0] - n[0] * along, side[1] - n[1] * along, side[2] - n[2] * along];
  const base = (d) => ({ x: at[0] - lat[0] + n[0] * (d - low), y: at[1] - lat[1] + n[1] * (d - low), z: at[2] - lat[2] + n[2] * (d - low) });
  xr('set-transform', { device: HAND, position: base(from), orientation: pose });
  await wait(250);
  xr('animate-to', { device: HAND, position: base(-0.003), duration: from / speed });
  await wait((from / speed) * 1000 + 200);
  xr('animate-to', { device: HAND, position: base(0.12), duration: 0.15 });
  await wait(250);
}
// a poke on the panel: a button, or an instrument's tab
const poke = async (name) => {
  const st = state();
  await slapAt(st.targets[name], st.targets.panelNormal, { speed: 0.5, from: 0.05 });
  await wait(500);
};
// the menu: from free play, Instruments, then the instrument's card
const ui = (id) => poke(`ui:${id}`);
const tab = async (id) => {
  if (!state().targets[`ui:inst:${id}`]) await ui('nav:instruments');
  await ui(`inst:${id}`);
};

await goto('debug=1');
let s = await placeKit();
await slapAt([s.targets.table[0] + 0.06, DESK_Y, s.targets.table[2]]);
s = await until((x) => x.game.found.includes('kit'), 3000);
check('the drums come out on the first slap', s.game.found.includes('kit') && s.targets.inst?.[0] === 0, JSON.stringify(s.targets.inst));
shot('shelf-kit', [s.debug.kitOrigin[0], DESK_Y + 0.1, s.debug.kitOrigin[2]]);
check('and the panel shows free play', s.game.display.page?.id === 'free' && s.game.display.page?.title === 'Drums', `${s.game.display.page?.id} ${s.game.display.page?.title}`);
await wait(5500);
const look = [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05];

// the drums stand up off the desk, every head facing up: a hand coming down through the snare's head plays it, and
// the same on the bass drum lying flat and on the crash out to the left
s = state();
let hits0 = s.debug.hits;
await slapAt(s.targets.snare, [0, 1, 0], { from: 0.1 });
s = state();
check('a hand down through the snare head (13 cm up) plays the snare', s.debug.hits > hits0 && s.debug.lastHit?.family === 'snare', JSON.stringify(s.debug.lastHit));
hits0 = s.debug.hits;
// (a real hit goes through the head: the helper stops at first contact, so aim past it)
await slapAt(s.targets.kick.map((v, i) => v - (i === 1 ? 0.02 : 0)), [0, 1, 0], { from: 0.1 });
s = state();
check('a hand down on the bass drum (flat, 10 cm up) plays the kick', s.debug.hits > hits0 && s.debug.lastHit?.family === 'kick', JSON.stringify(s.debug.lastHit));
// (no table in the emulator: it's a tray, so the small kit comes out; ask for the full one, as the Kit page does)
writeFileSync('tools/.full.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { window.__thump.game.setShelf('pieces', 'full'); return true; }); }\n`);
run('tools/.full.mjs');
await wait(600);
s = state();
check('the Kit page asks for the full kit: the crash comes out', !!s.targets.crash, Object.keys(s.targets).join(','));
hits0 = s.debug.hits;
await slapAt(s.targets.crash.map((v, i) => v - (i === 1 ? 0.02 : 0)), [0, 1, 0], { from: 0.1 });
s = state();
check('and on the crash, out to the left', s.debug.hits > hits0 && s.debug.lastHit?.family === 'crash', JSON.stringify(s.debug.lastHit));

await tab('piano');
s = state();
check('Instruments, then the piano card, puts a piano on the desk', s.targets.inst?.[0] === 1 && s.game.display.page?.title === 'Piano', `${s.game.display.page?.id} ${s.game.display.page?.title} inst=${s.targets.inst}`);
let before = s.debug.hits;
// (fingertips press the keys, 6 cm up in the case: aim the hand so its fingers, not its palm, land on the key)
// (fingertips first: the hand pitched down, as on a keyboard; the press goes 1 cm on)
await slapAt(s.targets.inst2.map((v, i) => v - (i === 1 ? 0.01 : 0)), [0, 1, 0], { from: 0.06, pose: { pitch: -50, yaw: 0, roll: 0 } });
s = state();
check('fingertips pressing the piano play its keys', s.debug.hits > before && /piano/.test(s.debug.lastHit?.family ?? ''), JSON.stringify(s.debug.lastHit));
shot('shelf-piano', look);
await ui('nav:inst');
s = state();
check("the piano's settings page: its notes and sounds", s.game.display.page?.id === 'inst' && !!s.targets['ui:scale:sad'], `${s.game.display.page?.id}`);
await ui('scale:sad');
s = state();
check('Sad puts it in the sad notes', s.game.display.page?.items?.find((i) => i.id === 'scale:sad')?.on === true, JSON.stringify(s.game.display.page?.items?.filter((i) => i.on).map((i) => i.id)));
await ui('nav:free');

await tab('marimba');
s = state();
check('then a marimba', s.targets.inst?.[0] === 2 && s.game.display.page?.title === 'Marimba', `${s.game.display.line} inst=${s.targets.inst}`);
// (fingertips on the bar, a centimetre and a half through it as a real tap goes: hand heights over keys and bars are smoothed, so a 3 mm graze is too slight)
await slapAt(s.targets.inst0.map((v, i) => v - (i === 1 ? 0.015 : 0)), [0, 1, 0], { from: 0.08, pose: { pitch: -50, yaw: 0, roll: 0 } });
s = state();
check('its low bar plays', s.debug.lastHit?.family === 'marimba' && s.debug.lastHit?.zone === 0, JSON.stringify(s.debug.lastHit));
shot('shelf-marimba', look);

await tab('guitar');
s = state();
check('then a guitar', s.targets.inst?.[0] === 3 && s.game.display.page?.title === 'Guitar', `${s.game.display.line} inst=${s.targets.inst}`);
// the guitar you hold: a fingertip onto the fretboard's middle chord place, then a fingertip swept down across the
// strings over the soundhole, then back up
await slapAt(s.targets.inst1, s.targets.guitarNormal, { from: 0.05, pose: { pitch: -50, yaw: 0, roll: 0 } });
s = state();
check('a fingertip on the neck picks that chord place', s.debug.lastHit?.family === 'chord' && s.debug.lastHit?.zone === 1, JSON.stringify(s.debug.lastHit));
const sweepStrings = async (dir) => {
  const st = state();
  const at = st.targets.strum;
  const d = st.targets.strumDown.map((v) => v * dir);
  const nrm = st.targets.guitarNormal;
  // (the index fingertip, not the wrist, is what crosses the strings: put the hand where its tip lands on the line)
  const P = [at[0] + nrm[0] * 0.2, at[1] + nrm[1] * 0.2, at[2] + nrm[2] * 0.2];
  const pose = { pitch: -40, yaw: 0, roll: 0 };
  xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: pose });
  await wait(300);
  const tip = state().right.indexTip;
  const off = [P[0] - tip[0], P[1] - tip[1], P[2] - tip[2]];
  const p = (k) => ({ x: at[0] + d[0] * k + off[0] - nrm[0] * 0.004, y: at[1] + d[1] * k + off[1] - nrm[1] * 0.004, z: at[2] + d[2] * k + off[2] - nrm[2] * 0.004 });
  xr('set-transform', { device: HAND, position: p(-0.06), orientation: pose });
  await wait(300);
  xr('animate-to', { device: HAND, position: p(0.06), duration: 0.12 });
  await wait(500);
};
const g0 = state().debug.hits;
await sweepStrings(1);
s = state();
check('a fingertip swept down across the strings strums it', s.debug.lastHit?.family === 'strum' && s.debug.hits > g0, JSON.stringify(s.debug.lastHit));
const hits1 = s.debug.hits;
await sweepStrings(-1);
s = state();
check('and swept back up strums it again (an up-strum)', s.debug.lastHit?.family === 'strum' && s.debug.hits > hits1, `${hits1} → ${s.debug.hits}`);
shot('shelf-guitar', look);

await tab('handpan');
s = state();
check('then a handpan', s.targets.inst?.[0] === 5 && s.game.display.page?.title === 'Handpan', `${s.game.display.line} inst=${s.targets.inst}`);
await slapAt(s.targets.inst0);
s = state();
check('its middle rings', s.debug.lastHit?.family === 'handpan' && s.debug.lastHit?.zone === 0, JSON.stringify(s.debug.lastHit));
shot('shelf-handpan', look);

await tab('congas');
s = state();
check('then congas', s.targets.inst?.[0] === 4 && s.game.display.page?.title === 'Congas', `${s.game.display.page?.title} inst=${s.targets.inst}`);
// (the congas stand 12 cm tall: a hand down through the high drum's head, in its middle)
await slapAt(s.targets.inst2.map((v, i) => v - (i === 1 ? 0.015 : 0)), [0, 1, 0], { from: 0.08 });
s = state();
check('the high drum plays an open tone in its middle', s.debug.lastHit?.family === 'congas' && s.debug.lastHit?.zone === 2, JSON.stringify(s.debug.lastHit));
shot('shelf-congas', look);

// the stand: a pinch on a tile puts that instrument out
{
  const pinchAt = async (at) => {
    // put the hand there, pinch, see where the pinch point landed, and move so it lands on the tile
    xr('set-transform', { device: HAND, position: { x: at[0], y: at[1] + 0.06, z: at[2] + 0.05 }, orientation: { pitch: -30, yaw: 0, roll: 0 } });
    await wait(300);
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(300);
    let st = state();
    const pp = st.right.pinchPoint;
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    const pos = { x: at[0] + (at[0] - pp[0]), y: at[1] + 0.06 + (at[1] - pp[1]), z: at[2] + 0.05 + (at[2] - pp[2]) };
    xr('set-transform', { device: HAND, position: pos, orientation: { pitch: -30, yaw: 0, roll: 0 } });
    await wait(300);
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(400);
    st = state();
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    return st;
  };
  await ui('nav:instruments');
  const tile = state().targets['ui:inst:piano'];
  check('the instruments page has a card each', !!tile && !!state().targets['ui:inst:guitar'], Object.keys(state().targets).filter((k) => k.startsWith('ui:inst')).join(','));
  if (tile) {
    const st = await pinchAt(tile);
    s = state();
    check('a pinch on the piano card puts the piano out', s.targets.inst?.[0] === 1 && s.game.display.page?.title === 'Piano', `inst=${s.targets.inst} pinching=${st.right.pinching} page=${s.game.display.page?.title}`);
  }
}

// the menu: settings, and back
await ui('nav:main');
s = state();
check('MENU shows the main menu', s.game.display.page?.id === 'main', s.game.display.page?.id);
await ui('nav:settings');
s = state();
check('SETTINGS opens the settings page', s.game.display.page?.id === 'settings', s.game.display.page?.id);
await ui('back');
s = state();
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);
done('E2E shelf');

#!/usr/bin/env node
/**
 * The instrument shelf, in the emulator: the kit comes out on the first slap; ▶ on the module (the > key) puts a
 * piano on the desk, then a guitar, then a handpan, then the drums again. Each one plays where you hit it: a piano key
 * sounds its note, a guitar chord pad then the strum band strum, a handpan note rings. NOTES changes the scale.
 */
import { xr, state, wait, check, done, shot, goto, placeKit, until, HAND, DESK_Y } from './e2e-lib.mjs';

const FLAT = { pitch: 0, yaw: 0, roll: 0 };
async function slapAt(at, n = [0, 1, 0], { speed = 1.0, from = 0.08 } = {}) {
  const P = [at[0] + n[0] * 0.3, at[1] + n[1] * 0.3, at[2] + n[2] * 0.3];
  xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: FLAT });
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
  xr('set-transform', { device: HAND, position: base(from), orientation: FLAT });
  await wait(250);
  xr('animate-to', { device: HAND, position: base(-0.003), duration: from / speed });
  await wait((from / speed) * 1000 + 200);
  xr('animate-to', { device: HAND, position: base(0.12), duration: 0.15 });
  await wait(250);
}
const key = async (k) => {
  const p = state().targets[`key-${k}`];
  await slapAt(p, [0, 1, 0], { speed: 0.6, from: 0.05 });
  await wait(250);
};

await goto('debug=1');
let s = await placeKit();
await slapAt([s.targets.table[0] + 0.06, DESK_Y, s.targets.table[2]]);
s = await until((x) => x.game.found.includes('kit'), 3000);
check('the drums come out on the first slap', s.game.found.includes('kit') && s.targets.inst?.[0] === 0, JSON.stringify(s.targets.inst));
await wait(5500);
const look = [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05];

await key('next');
s = state();
check('> on the box puts a piano on the desk', s.targets.inst?.[0] === 1 && s.game.display.line === 'Piano', `${s.game.display.line} / ${s.game.display.sub} inst=${s.targets.inst}`);
check('its last two keys say NOTES and SOUND', JSON.stringify(s.game.display.keyLabels) === JSON.stringify(['', '', '', 'NOTES', 'SOUND']), JSON.stringify(s.game.display.keyLabels));
let before = s.debug.hits;
await slapAt(s.targets.inst2);
s = state();
check('a piano key plays its note', s.debug.hits > before && s.debug.lastHit?.family === 'piano' && s.debug.lastHit?.zone === 2, JSON.stringify(s.debug.lastHit));
shot('shelf-piano', look);
await key('jam');
s = state();
check('NOTES changes the scale', /^Notes: (Sad|Bluesy|Dreamy|Happy)$/.test(s.game.display.sub), s.game.display.sub);

await key('next');
s = state();
check('then a guitar', s.targets.inst?.[0] === 2 && s.game.display.line === 'Guitar', `${s.game.display.line} inst=${s.targets.inst}`);
await slapAt(s.targets.inst1);
s = state();
check('a chord pad picks a chord (and strums it softly)', s.debug.lastHit?.family === 'chord' && s.debug.lastHit?.zone === 1, JSON.stringify(s.debug.lastHit));
await slapAt(s.targets.strum);
s = state();
check('the strum band strums it', s.debug.lastHit?.family === 'strum', JSON.stringify(s.debug.lastHit));
shot('shelf-guitar', look);

await key('next');
s = state();
check('then a handpan', s.targets.inst?.[0] === 3 && s.game.display.line === 'Handpan', `${s.game.display.line} inst=${s.targets.inst}`);
await slapAt(s.targets.inst0);
s = state();
check('its middle rings', s.debug.lastHit?.family === 'handpan' && s.debug.lastHit?.zone === 0, JSON.stringify(s.debug.lastHit));
shot('shelf-handpan', look);

await key('next');
s = state();
check('and round to the drums', s.targets.inst?.[0] === 0 && !!s.targets.kick, `inst=${s.targets.inst}`);
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);
done('E2E shelf');

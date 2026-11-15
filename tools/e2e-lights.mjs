#!/usr/bin/env node
/**
 * Lights Out (src/room/lights-out.ts), at a real table of the emulated living room: firing the Spotlight in a song
 * darkens the room, strikes the follow spot with the room's own surfaces and the hands' shadow casters in it, sweeps
 * a second light, closes in on the hands, and ends cleanly (darkness back to 0, nothing drawn, no shadow passes); a
 * newcomer's taste and an S's curtain call end cleanly too.
 * With --shots, the moment held still at each step for a screenshot (artifacts/lights-out-*.png): before, the dark
 * coming down, the strike, the hands' shadows on the wall, a hit's colour, the sweep, the beams closing in, the
 * return, and after.
 *   node tools/e2e-lights.mjs [--shots]
 */
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { goto, wait, run, check, done, xr, cli } from './e2e-lib.mjs';

const SHOTS = process.argv.includes('--shots');
const js = (body) => {
  writeFileSync('tools/.lights-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; const L = r.lightsOut; ${body} }); }\n`);
  const o = run('tools/.lights-js.mjs');
  rmSync('tools/.lights-js.mjs', { force: true });
  return o;
};
const lo = () => js(`return { ...L.stats, phase: L.phase, kind: L.kind, mode: r.game.mode, beat: r.game.beatNow, left: r.game.spotLeft, visible: L.root.visible, errors: r.debug.errors };`);
const shot = (name) => {
  if (!SHOTS) return;
  mkdirSync('artifacts', { recursive: true });
  cli('browser', 'screenshot', '--output-file', `artifacts/lights-out-${name}.png`);
  const s = lo();
  console.log(`  shot ${name}: phase=${s.phase} dark=${s.dark.toFixed(2)} key=${s.key.toFixed(2)} sweep=${s.sweep.toFixed(2)}`);
};

// seated at the living room's table (its top 0.78 m up), facing the wall 2 m beyond it (the room's -x)
const SEAT = { x: -0.9, y: 1.2, z: -1.15 };
const DESK = 0.78;
/** A point `f` metres ahead and `r` to the right of the seat (world x, z). */
const at = (f, r) => [SEAT.x - f, SEAT.z - r];
const AHEAD = { pitch: 0, yaw: 90, roll: 0 };
const hand = (side, f, y, r, o = AHEAD) => {
  const p = at(f, r);
  xr('set-transform', { device: side === 'left' ? 'hand-left' : 'hand-right', position: { x: p[0], y, z: p[1] }, orientation: o });
};
const drum = (k) => {
  hand('left', 0.43, k % 2 ? 1.1 : 0.98, -0.18);
  hand('right', 0.43, k % 2 ? 0.98 : 1.1, 0.21);
};
const handsUp = () => {
  hand('left', 0.35, 1.28, -0.2);
  hand('right', 0.35, 1.32, 0.22);
};

await goto('degrade=0');
xr('set-transform', { device: 'headset', position: SEAT, orientation: { pitch: -5, yaw: 90, roll: 0 } });
hand('left', 0.25, 1.45, -0.35, { pitch: 0, yaw: 90, roll: 90 });
// the right palm flat on the table: the kit goes there
hand('right', 0.55, DESK + 0.02, 0.02);
await wait(1800);
hand('right', 0.4, DESK + 0.3, 0.2);
await wait(400);
let s = js(`return { placed: r.placement.phase, kit: r.kit.root.getWorldPosition(r.head.clone()).toArray() };`);
check('kit placed on the table', s.placed === 'placed', JSON.stringify(s));

js(`r.putOut('drums'); r.game.level = 'easy'; const i = r.game.tracks.findIndex((t) => !t.score?.tune.lesson); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play'); return i;`);
for (let i = 0; i < 50 && lo().mode !== 'play'; i++) await wait(300);
await wait(1200);
check('a song is playing', lo().mode === 'play');
drum(0);
await wait(300);
shot('0-before');

s = lo();
check('nothing drawn before the Spotlight', !s.visible && s.dark === 0 && s.passes === 0, JSON.stringify(s));
// both hands up, simulated: the game's own fire path (the room's spotFire hook starts Lights Out); held still at once
// for the pictures (the song's clock and the moment's own hold while paused)
const fired = js(`r.game.spotMeter = 1; const ok = r.game.fireSpotlight(); ${SHOTS ? 'r.userPaused = true; r.game.spotUntil += 60;' : ''} return ok;`);
check('the Spotlight fires', fired === true);
s = lo();
check('Lights Out starts with it', s.phase === 'on' && s.kind === 'song' && s.fired === 1, JSON.stringify(s));
if (SHOTS) {
  handsUp();
  js(`L.t = 0.22; return 1`);
  shot('1-going-dark');
  js(`L.t = 0.8; return 1`);
  shot('2-strike');
  drum(1);
  shot('3-hands');
  drum(0);
  js(`L.lastTint = -9; L.hit(0x3fb6ff, 1); return 1`);
  shot('4-hit-colour');
  js(`L.tint = 0; L.fireBeat = r.game.beatNow - 2 - 4 * 0.3; return 1`);
  shot('5-sweep');
  js(`L.fireBeat = r.game.beatNow - 2 - 4 * 0.75; return 1`);
  shot('6-sweep');
  js(`r.game.spotUntil = r.game.beatNow + 4 * 0.35; return 1`);
  handsUp();
  shot('7-converge');
  js(`L.end(); L.backT = L.backDur * 0.45; return 1`);
  shot('8-return');
  js(`r.userPaused = false; return 1`);
  await wait(1500);
  shot('9-after');
} else {
  await wait(700);
  s = lo();
  check('the room is dark and the spot is on', s.dark > 0.8 && s.key > 0.5, `dark=${s.dark} key=${s.key}`);
  check("the room's own surfaces are drawn (planes or mesh)", s.receivers > 0 && s.source !== 'none' && s.tris <= 20000, `${s.source} receivers=${s.receivers} tris=${s.tris}`);
  check('the tracked hands cast (capsules on their bones)', s.casters > 20, `casters=${s.casters}`);
  check('the key light renders its shadow pass', s.passes >= 1, `passes=${s.passes}`);
  // the sweep: two beats after the strike, for four beats, every four bars
  js(`L.fireBeat = r.game.beatNow - 2 - 4 * 0.5; return 1`);
  await wait(200);
  s = lo();
  check('a second light sweeps across the room', s.sweep > 0.3 && s.passes === 2, `sweep=${s.sweep} passes=${s.passes}`);
  // the last bar: both beams close in
  js(`r.game.spotUntil = r.game.beatNow + 2; return 1`);
  await wait(200);
  s = lo();
  check('the last bar: the beams close onto the hands', s.phase === 'on' && s.sweep > 0.2, `left=${s.left} sweep=${s.sweep}`);
}
for (let i = 0; i < 40 && lo().phase !== 'off'; i++) await wait(250);
s = lo();
check('it ends cleanly: darkness back to 0, nothing drawn, no passes', s.phase === 'off' && s.dark === 0 && !s.visible && s.passes === 0 && s.ended === 1, JSON.stringify(s));
check('the song plays on after it', s.mode === 'play', s.mode);

// a newcomer's first taste (free play) and an S's curtain call: each runs and ends by itself
js(`r.game.stop(); return 1`);
await wait(800);
check('free play again', lo().mode === 'discover', lo().mode);
js(`L.fire('taste'); return 1`);
await wait(300);
check('the taste starts', lo().phase === 'on' && lo().kind === 'taste');
for (let i = 0; i < 40 && lo().phase !== 'off'; i++) await wait(250);
s = lo();
check('the taste ends by itself within ~4 s, darkness back to 0', s.phase === 'off' && s.dark === 0 && !s.visible, JSON.stringify(s));
// (the results' S stamp, through the room's own hook; out of the results it closes early)
js(`r.game.stage.gradeStamp('S', false); return 1`);
check('an S on the results starts the curtain call', lo().kind === 'curtain' && lo().fired === 3, JSON.stringify(lo()));
for (let i = 0; i < 50 && lo().phase !== 'off'; i++) await wait(250);
s = lo();
check('the curtain call ends by itself, darkness back to 0', s.phase === 'off' && s.dark === 0 && !s.visible, JSON.stringify(s));
check('no frame errors', lo().errors === 0, `errors=${lo().errors}`);
done('E2E lights');

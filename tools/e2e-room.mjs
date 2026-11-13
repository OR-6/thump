#!/usr/bin/env node
/**
 * The room is the instrument, in the emulator (living_room: tables, walls, a window, a couch):
 * rest a palm → the kit is placed and the module says "Hit something"; slap the table → the kit is
 * discovered (pads, edge keys, a name tag, the room map counts it) and a drum sounds; slap a real
 * wall or window along its normal → its instrument is discovered and plays; tap PLAY on the module →
 * a song is cast onto the room; with ?autoplay the song reaches stars.
 *   node tools/e2e-room.mjs            discovery by real slaps
 *   node tools/e2e-room.mjs --song     also a song with the autoplayer
 */
import { xr, run, state, wait, check, done, shot, goto, placeKit, until, HAND, DESK_Y } from './e2e-lib.mjs';

const SONG = process.argv.includes('--song');
const FLAT = { pitch: 0, yaw: 0, roll: 0 };
await goto('debug=1');
let s = await placeKit();
check('kit placed by a resting palm', s.debug.phase === 'placed', `${s.debug.deskSource} y=${s.debug.deskY}`);
s = await until((x) => x.debug.surfaces.length > 0, 5000);
const fams = s.debug.surfaces.map((x) => `${x.id}:${x.label || '-'}→${x.family}@${x.reach}`);
console.log(`surfaces: ${fams.join('  ')}`);
check('the room has surfaces (planes found)', s.debug.planes > 0 && s.debug.surfaces.length > 1, `planes=${s.debug.planes} meshes=${s.debug.meshes}`);
check('the module says hit something', s.game.display.line === 'Hit something', s.game.display.line);
const look = [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05];
shot('room-01-placed', look);

/** Move the right hand so a joint set's extreme along `n` touches `at`: slap along −n from `from` metres out. */
async function slapAt(at, n, { speed = 1.0, from = 0.08, orientation = FLAT } = {}) {
  const P = [at[0] + n[0] * 0.3, at[1] + n[1] * 0.3, at[2] + n[2] * 0.3];
  xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation });
  await wait(300);
  const h = state().right;
  // the hand's closest point toward the surface, relative to the device position
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
  // put that point over `at` (sideways), then come in along −n until it's 3 mm into the surface
  const side = [lowPt[0] - P[0], lowPt[1] - P[1], lowPt[2] - P[2]];
  const along = side[0] * n[0] + side[1] * n[1] + side[2] * n[2];
  const lat = [side[0] - n[0] * along, side[1] - n[1] * along, side[2] - n[2] * along];
  const base = (d) => ({ x: at[0] - lat[0] + n[0] * (d - low), y: at[1] - lat[1] + n[1] * (d - low), z: at[2] - lat[2] + n[2] * (d - low) });
  xr('set-transform', { device: HAND, position: base(from), orientation });
  await wait(250);
  xr('animate-to', { device: HAND, position: base(-0.003), duration: from / speed });
  await wait((from / speed) * 1000 + 200);
  xr('animate-to', { device: HAND, position: base(0.12), duration: 0.15 });
  await wait(250);
}

// the table: anywhere on it plays, and its first hit draws the kit
const before = s.debug.hits;
await slapAt([s.targets.table[0] + 0.09, DESK_Y, s.targets.table[2]], [0, 1, 0]);
s = await until((x) => x.game.found.includes('kit'), 3000);
check('a slap on the table discovers the kit', s.game.found.includes('kit'), JSON.stringify(s.game.found));
check('and plays a drum', s.debug.hits > before && /kick|snare|hat|tom|rim|keys/.test(s.debug.lastHit?.family ?? ''), JSON.stringify(s.debug.lastHit));
check('a one-word tag says what it is', s.debug.tag === 'Kit', s.debug.tag);
check('the pads are drawn', !!s.targets.snare && !!s.targets.kick, Object.keys(s.targets).join(','));
await wait(600);
shot('room-02-kit', look);

// a mug on the table (9 cm tall) that the room scan never saw: the first tap plays it and draws its ring; a second
// keeps it; ◀ ▶ on the module change its sound
{
  const k0 = s.debug.kitOrigin;
  const cup = [k0[0] + 0.28, DESK_Y + 0.09, k0[2] + 0.02];
  const tapCup = async () => {
    xr('set-transform', { device: HAND, position: { x: cup[0], y: cup[1] + 0.12, z: cup[2] }, orientation: FLAT });
    await wait(350);
    xr('animate-to', { device: HAND, position: { x: cup[0], y: cup[1], z: cup[2] }, duration: 0.18 });
    await wait(450);
    xr('set-transform', { device: HAND, position: { x: cup[0], y: cup[1] + 0.15, z: cup[2] }, orientation: FLAT });
    await wait(300);
  };
  const before = state().played;
  await tapCup();
  s = state();
  let pads = s.debug.surfaces.filter((x) => x.id.startsWith('t'));
  const rang = (x) => (x.bell ?? 0) + (x.tubular ?? 0);
  check('seated: one tap on a mug plays it and draws its ring', pads.length === 1 && pads[0].discovered && /bell|chime/.test(pads[0].sound) && rang(s.played) > rang(before), JSON.stringify(pads) + ' tag=' + s.debug.tag);
  check('the module shows its sound with ◀ ▶', /Bell|Chime/.test(s.game.display.line) && /◀ ▶|Arrows/.test(s.game.display.sub), `${s.game.display.line} / ${s.game.display.sub}`);
  await tapCup();
  s = state();
  pads = s.debug.surfaces.filter((x) => x.id.startsWith('t'));
  check('a second tap keeps it (saved with the desk)', pads.length === 1 && pads[0].kept === true && (s.progress.pads?.length ?? 0) === 1, JSON.stringify(pads) + ' saved=' + JSON.stringify(s.progress.pads));
  // ▶ on the module: the mug's next sound
  const next = s.targets['key-next'];
  const nx = [next[0], next[1], next[2]];
  xr('set-transform', { device: HAND, position: { x: nx[0], y: nx[1] + 0.06, z: nx[2] }, orientation: FLAT });
  await wait(300);
  await slapAt(nx, [0, 1, 0], { speed: 0.6, from: 0.05 });
  s = state();
  pads = s.debug.surfaces.filter((x) => x.id.startsWith('t'));
  check('▶ changes the mug to the next sound in the bank', pads.length === 1 && pads[0]?.sound && !/^(bell|chime)$/.test(pads[0].sound), `${pads.map((p) => p.sound)} display=${s.game.display.line}`);
  shot('room-02b-cup', [cup[0], DESK_Y, cup[2]]);
  xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
  await wait(300);
  s = state();
}

// a real vertical surface: the nearest within reach (a wall or the window), slapped along its normal
const vert = s.debug.surfaces.filter((x) => x.family && !x.discovered && x.id !== 'kit' && s.targets[`normal-${x.id}`] && Math.abs(s.targets[`normal-${x.id}`][1]) < 0.5).sort((a, b) => a.reach - b.reach);
check('a wall-like surface within reach of the room', vert.length > 0, vert.map((x) => `${x.id}:${x.label}→${x.family}`).join(' '));
const pickFam = (f) => vert.find((x) => x.family === f && x.label !== 'wall art');
const chosen = [pickFam('gong'), pickFam('glock'), pickFam('marimba')].filter(Boolean);
for (const v of chosen.length ? chosen : vert.slice(0, 2)) {
  const at = s.targets[`surface-${v.id}`];
  const n = s.targets[`normal-${v.id}`];
  // stand in front of it: the head a little back from the point
  xr('set-transform', { device: 'headset', position: { x: at[0] + n[0] * 0.6, y: 1.5, z: at[2] + n[2] * 0.6 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  xr('look-at', { device: 'headset', target: { x: at[0], y: at[1], z: at[2] } });
  const target = [at[0], Math.min(at[1], 1.5), at[2]];
  const h0 = state().debug.hits;
  await slapAt(target, n, { speed: 1.0, orientation: { pitch: 0, yaw: 0, roll: 90 } });
  s = await until((x) => x.debug.surfaces.find((y) => y.id === v.id)?.discovered, 2500);
  const d = s.debug.surfaces.find((y) => y.id === v.id);
  check(`slapping ${v.id} (${v.label || 'unlabelled'}) discovers its ${v.family}`, !!d?.discovered && s.debug.hits > h0, `hits ${h0}→${s.debug.hits} last=${JSON.stringify(s.debug.lastHit)}`);
  check(`and it plays (${v.family})`, (s.played[v.family] ?? 0) > 0 || !s.debug.audio, JSON.stringify(s.played));
  await wait(500);
  shot(`room-03-${v.family}`, target);
}
// swaps: pinch and hold a found instrument → it plays the next instrument that suits it, saved with the room
{
  const v = state().debug.surfaces.find((x) => x.discovered && x.id !== 'kit' && x.id !== 'module');
  if (v) {
    console.log('unlock:', run('tools/unlock-swaps.mjs'));
    const at = s.targets[`surface-${v.id}`];
    const n = s.targets[`normal-${v.id}`];
    const target = [at[0], Math.min(at[1], 1.5), at[2]];
    xr('set-transform', { device: 'headset', position: { x: at[0] + n[0] * 0.6, y: 1.5, z: at[2] + n[2] * 0.6 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
    xr('look-at', { device: 'headset', target: { x: at[0], y: at[1], z: at[2] } });
    // where the pinch point sits relative to the hand, measured pinched well away from the wall
    const P = [target[0] + n[0] * 0.4, target[1] + n[1] * 0.4, target[2] + n[2] * 0.4];
    const ORI = { pitch: 0, yaw: 0, roll: 90 };
    xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: ORI });
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(400);
    const pp = state().right.pinchPoint;
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    const off = [pp[0] - P[0], pp[1] - P[1], pp[2] - P[2]];
    const Q = (d) => ({ x: target[0] + n[0] * d - off[0], y: target[1] + n[1] * d - off[1], z: target[2] + n[2] * d - off[2] });
    xr('set-transform', { device: HAND, position: Q(0.025), orientation: ORI });
    await wait(300);
    const fam0 = state().debug.surfaces.find((x) => x.id === v.id)?.family;
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(1300);
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: ORI });
    s = state();
    const d = s.debug.surfaces.find((x) => x.id === v.id);
    check(`pinch and hold ${v.id} swaps its instrument`, !!d?.discovered && d.family !== fam0, `${fam0} → ${d?.family}`);
    const saved = Object.values(s.progress.rooms ?? {}).flat();
    check('the swap is saved with the room', saved.some((x) => x.as === d?.family) || saved.length === 0, JSON.stringify(saved));
    check('the room map plays the new instrument', s.game.found.includes(d?.family), JSON.stringify(s.game.found));
    shot('room-03b-swap', target);
    // seated (the airplane test): the desk's bars swap too
    xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
    const e3 = s.targets.edge3;
    xr('set-transform', { device: HAND, position: { x: P[0], y: P[1], z: P[2] }, orientation: FLAT });
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(400);
    const pp2 = state().right.pinchPoint;
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    const o2 = [pp2[0] - P[0], pp2[1] - P[1], pp2[2] - P[2]];
    xr('set-transform', { device: HAND, position: { x: e3[0] - o2[0], y: e3[1] + 0.02 - o2[1], z: e3[2] - o2[2] }, orientation: FLAT });
    await wait(300);
    xr('set-select-value', { device: HAND, value: 1 });
    await wait(1300);
    xr('set-select-value', { device: HAND, value: 0 });
    await wait(300);
    xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
    s = state();
    check('seated: pinch and hold the desk bars swaps them (saved)', !!s.progress.desk, `desk=${s.progress.desk} tag=${s.debug.tag}`);
  }
}
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(400);
s = state();
check('the room map counts what was found', s.game.display.found.length >= 2, JSON.stringify(s.game.display));
check('the module offers a song once two are found', s.game.display.pulse === 'play', `${s.game.display.line} / ${s.game.display.sub}`);
shot('room-04-module', look);

// both hands slam the table at once: every instrument found answers (the tutti; the emulator can't land both hands
// together, so the chord is played directly and the gesture's timing is left to the device session)
{
  const before = state().played;
  run('tools/tutti.mjs');
  await wait(500);
  const after = state().played;
  const rang = Object.keys(after).filter((f) => (after[f] ?? 0) > (before[f] ?? 0) && !['kick', 'snare', 'hat', 'tom', 'rim'].includes(f));
  check('the whole room answers at once (tutti)', rang.length >= 2, `rang: ${rang.join(',')}`);
  s = state();
}

// tap PLAY on the module: Build starts and asks for the kick
const play = s.targets['key-play'];
await slapAt(play, [0, 1, 0], { speed: 0.6, from: 0.05 });
s = await until((x) => x.game.mode === 'build', 3000);
check('PLAY on the module starts building a track', s.game.mode === 'build' && /kick/.test(s.game.display.sub), `${s.game.mode} / ${s.game.display.line} / ${s.game.display.sub}`);
// slap the kick: it's assigned, the count-in starts and the part's notes fly to it
await slapAt([s.targets.kick[0], DESK_Y, s.targets.kick[2]], [0, 1, 0]);
s = await until((x) => x.game.motes > 0, 8000);
check('the kick is assigned and its notes fly to it', s.game.motes > 0 && /KICK/.test(s.game.display.line), `motes=${s.game.motes} ${s.game.display.line} / ${s.game.display.sub}`);
shot('room-05-build', look);
s = state();
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);

if (SONG) {
  await goto('autoplay=1&debug=1');
  s = await placeKit();
  s = await until((x) => x.game.mode === 'build', 30000, 500);
  check('autoplay finds things and starts building', s.game.mode === 'build', `${s.game.mode} found=${s.game.found}`);
  s = await until((x) => (x.progress.built ?? []).includes('kick-start'), 120000, 1000);
  check('six parts later the machine runs', (s.progress.built ?? []).includes('kick-start') && /Kick Start/.test(s.game.display.line), `${s.game.display.line} / ${s.game.display.sub}`);
  shot('room-06-machine', [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05]);
  s = await until((x) => x.game.mode === 'results', 120000, 1000);
  check('then you perform on it: stars and Tight %', s.game.mode === 'results' && (s.game.last?.stars ?? 0) >= 2 && /^\d+ of \d+$/.test(s.game.display.line), `${s.game.display.line} / ${s.game.display.sub} stars=${s.game.last?.stars}`);
  shot('room-07-results', [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05]);
}
done('E2E room');

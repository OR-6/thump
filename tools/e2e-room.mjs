#!/usr/bin/env node
/**
 * The room is the instrument, in the emulator (living_room: tables, walls, a window, a couch):
 * rest a palm → the kit is placed and the module says "Hit anything"; slap the table → the kit is
 * discovered (pads, edge keys, a name tag, the room map counts it) and a drum sounds; slap a real
 * wall or window along its normal → its instrument is discovered and plays; tap PLAY on the module →
 * a song is cast onto the room; with ?autoplay the song reaches stars.
 *   node tools/e2e-room.mjs            discovery by real slaps
 *   node tools/e2e-room.mjs --song     also a song with the autoplayer
 */
import { xr, state, wait, check, done, shot, goto, placeKit, until, HAND, DESK_Y } from './e2e-lib.mjs';

const SONG = process.argv.includes('--song');
const FLAT = { pitch: 0, yaw: 0, roll: 0 };
await goto('debug=1');
let s = await placeKit();
check('kit placed by a resting palm', s.debug.phase === 'placed', `${s.debug.deskSource} y=${s.debug.deskY}`);
s = await until((x) => x.debug.surfaces.length > 0, 5000);
const fams = s.debug.surfaces.map((x) => `${x.id}:${x.label || '-'}→${x.family}@${x.reach}`);
console.log(`surfaces: ${fams.join('  ')}`);
check('the room has surfaces (planes found)', s.debug.planes > 0 && s.debug.surfaces.length > 1, `planes=${s.debug.planes} meshes=${s.debug.meshes}`);
check('the module says hit anything', s.game.display.line === 'Hit anything', s.game.display.line);
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
check('a name tag says what it is', /drum kit/.test(s.debug.tag), s.debug.tag);
check('the pads are drawn', !!s.targets.snare && !!s.targets.kick, Object.keys(s.targets).join(','));
await wait(600);
shot('room-02-kit', look);

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
xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
await wait(400);
s = state();
check('the room map counts what was found', s.game.display.found.length >= 2, JSON.stringify(s.game.display));
check('the module offers a song once two are found', s.game.display.pulse === 'play', `${s.game.display.line} / ${s.game.display.sub}`);
shot('room-04-module', look);

// tap PLAY on the module
const play = s.targets['key-play'];
await slapAt(play, [0, 1, 0], { speed: 0.6, from: 0.05 });
s = await until((x) => x.game.mode === 'count' || x.game.mode === 'play', 3000);
check('PLAY on the module starts a song', s.game.mode === 'count' || s.game.mode === 'play', `${s.game.mode} ${JSON.stringify(s.debug.lastHit)}`);
check('the song is cast onto the room', !!s.game.cast?.melody, JSON.stringify(s.game.cast));
s = await until((x) => x.game.motes > 1, 6000);
check('notes travel to their targets', s.game.motes > 1, `motes=${s.game.motes}`);
shot('room-05-song', look);
s = state();
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);

if (SONG) {
  await goto('autoplay=1&debug=1');
  s = await placeKit();
  s = await until((x) => x.game.mode === 'play', 30000, 500);
  check('autoplay discovers the room and starts a song', s.game.mode === 'play', `${s.game.mode} found=${s.game.found}`);
  s = await until((x) => x.game.mode === 'results', 90000, 1000);
  check('the song ends in stars', s.game.last?.stars === 3, JSON.stringify(s.game.last));
  shot('room-06-results', [s.debug.kitOrigin[0], DESK_Y, s.debug.kitOrigin[2] - 0.05]);
}
done('E2E room');

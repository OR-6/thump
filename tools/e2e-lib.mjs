/** Shared helpers for emulator E2E scripts (IWSDK CLI + IWER, hands only). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

export const cli = (...args) =>
  JSON.parse(execFileSync('npx', ['@iwsdk/cli', ...args, '--raw'], { encoding: 'utf8' }));
export const xr = (action, input) => cli('xr', action, '--input-json', JSON.stringify(input ?? {}));
export const run = (script) =>
  JSON.parse(execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', script], { encoding: 'utf8' })).data.result;
export const state = () => run('tools/state.mjs');
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
export const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};
export const done = (label) => {
  console.log(failures === 0 ? `\n${label}: ALL PASS` : `\n${label}: ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
};

export const HAND = 'hand-right';
export const FLAT = { pitch: 0, yaw: 0, roll: 0 };

export function shot(name, look) {
  mkdirSync('artifacts', { recursive: true });
  if (look) xr('look-at', { device: 'headset', target: { x: look[0], y: look[1], z: look[2] } });
  cli('browser', 'screenshot', '--output-file', `artifacts/${name}.png`);
}

/** Fresh page (optionally with cleared storage), XR entered, hands only. */
export async function freshSession({ clear = true } = {}) {
  // hands up first: the emulator keeps its session through a reload, and a palm left flat at desk
  // height would place the loom during the reload wait
  try {
    if (xr('status').sessionActive) {
      xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
      xr('set-transform', { device: 'hand-left', position: { x: -0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: 90 } });
    }
  } catch {
    /* no session yet */
  }
  if (clear) run('tools/clear-storage.mjs');
  cli('browser', 'reload');
  await wait(2500);
  // a reload that didn't really happen would leave saving blocked (and a later reload would lose progress)
  if (run('tools/unblock-storage.mjs') === 'unblocked') console.log('note: the reload did not reset the page; saving unblocked');
  if (!xr('status').sessionActive) xr('enter');
  xr('set-input-mode', { mode: 'hand' });
  // Seated player: eyes 1.2 m above the floor (desk ~0.4 m below the eyes).
  xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  xr('set-transform', { device: 'hand-left', position: { x: -0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: 90 } });
  // the right hand up and on its side too: a flat palm left at desk height would place the kit at once
  xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
  xr('set-select-value', { device: HAND, value: 0 });
}

/** The table in every test: 0.4 m below the seated eyes (head at 1.2 m). */
export const DESK_Y = 0.8;

/** Rest the right palm flat on the table until the kit is placed. */
export async function placeKit() {
  // the palm's centre sits its radius above the table
  xr('set-transform', { device: HAND, position: { x: 0.05, y: DESK_Y + 0.02, z: -0.34 }, orientation: FLAT });
  await wait(1700);
  const s = state();
  // lift the hand clear (a resting hand does nothing, but tests start from a raised hand)
  xr('set-transform', { device: HAND, position: { x: 0.05, y: DESK_Y + 0.25, z: -0.3 }, orientation: FLAT });
  await wait(400);
  return s;
}

/** Offsets from the hand device's position to its joints (palm centre, index tip), measured once per session. */
export async function measureHand(side = HAND) {
  const P = [0.05, 1.0, -0.33];
  xr('set-transform', { device: side, position: { x: P[0], y: P[1], z: P[2] }, orientation: FLAT });
  await wait(300);
  const s = state();
  const h = side === HAND ? s.right : s.left;
  const palm = h.palm.map((v, i) => v - P[i]);
  const index = h.indexTip.map((v, i) => v - P[i]);
  // the lowest point of the hand below its device position (palm bottom or a fingertip, whichever is lower)
  const low = Math.min(h.palm[1] - h.palmRadius, h.indexTip[1] - h.tipRadius, h.middleTip[1] - h.tipRadius) - P[1];
  return { palm, index, low };
}

/**
 * Slap: the palm centre comes down over `at` (world x/z) from 8 cm up, at `speed` m/s, until the hand's lowest
 * point is 3 mm into the table (nothing stops an emulated hand), then lifts away.
 */
export async function slap(hand, at, { speed = 1.0, side = HAND, from = 0.08 } = {}) {
  const x = at[0] - hand.palm[0];
  const z = at[2] - hand.palm[2];
  const yLow = DESK_Y - hand.low - 0.003;
  xr('set-transform', { device: side, position: { x, y: yLow + from, z }, orientation: FLAT });
  await wait(250);
  xr('animate-to', { device: side, position: { x, y: yLow, z }, duration: from / speed });
  await wait((from / speed) * 1000 + 180);
  xr('animate-to', { device: side, position: { x, y: yLow + 0.1, z }, duration: 0.15 });
  await wait(220);
}

/** Wait until state() satisfies `ok` (polling), up to `ms`. */
export async function until(ok, ms = 8000, step = 250) {
  const t0 = Date.now();
  let s = state();
  while (!ok(s) && Date.now() - t0 < ms) {
    await wait(step);
    s = state();
  }
  return s;
}

/** Load the app with a query string (e.g. 'autoplay=1&debug=1'), storage cleared first if asked. */
export async function goto(query = '', { clear = true } = {}) {
  try {
    if (xr('status').sessionActive) {
      xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
      xr('set-transform', { device: 'hand-left', position: { x: -0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: 90 } });
    }
  } catch {
    /* no session yet */
  }
  if (clear) run('tools/clear-storage.mjs');
  // the app runs in a frame of the managed window: navigate the frame itself
  writeFileSync('tools/.goto.mjs', `export default async function run({ page, frame }) { const f = frame ?? page; return await f.evaluate((q) => { const u = new URL(location.href); u.search = q; u.hash = ''; setTimeout(() => (location.href = u.toString()), 50); return u.toString(); }, ${JSON.stringify(query)}); }\n`);
  run('tools/.goto.mjs');
  await wait(3000);
  if (run('tools/unblock-storage.mjs') === 'unblocked') console.log('note: storage unblocked after goto');
  if (!xr('status').sessionActive) xr('enter');
  xr('set-input-mode', { mode: 'hand' });
  xr('set-transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  xr('set-transform', { device: 'hand-left', position: { x: -0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: 90 } });
  xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
  xr('set-select-value', { device: HAND, value: 0 });
}

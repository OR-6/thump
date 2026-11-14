#!/usr/bin/env node
/**
 * The website's captures, from the game as it is (the autoplayer playing a song on Normal), drawn over the site's plum
 * instead of the emulator's grey room (tools/shot-dark.mjs): each instrument from the seat mid-song, the guitar on
 * your lap, the panel mid-song, and the results. Writes artifacts/site-cap/*.png (several frames of each, to pick
 * from), then: node tools/site-shots.mjs && ls artifacts/site-cap
 *   SHOTS=piano,congas node tools/site-shots.mjs   (only some)
 */
import { mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { xr, goto, placeKit, wait, run, until, HAND } from './e2e-lib.mjs';

mkdirSync('artifacts/site-cap', { recursive: true });
const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
const want = (k) => !only || only.includes(k);
const js = (body) => {
  writeFileSync('tools/.site-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.site-js.mjs');
  rmSync('tools/.site-js.mjs', { force: true });
  return o;
};
const shot = (name) => {
  execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/shot-dark.mjs']);
  copyFileSync('artifacts/shot-dark.png', `artifacts/site-cap/${name}.png`);
};
const away = () => {
  xr('set-transform', { device: HAND, position: { x: 0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
  xr('set-transform', { device: 'hand-left', position: { x: -0.6, y: 0.3, z: 0.4 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
};
/** Start the shortest classic on Normal with `inst` out. */
const play = (inst) =>
  js(`r.putOut('${inst}'); r.game.level = 'normal'; let i = -1, best = 1e9; r.game.tracks.forEach((t, k) => { const b = t.score?.tune.lesson ? 1e9 : (t.song?.bars ?? t.bars ?? 99); if (b < best) { best = b; i = k; } }); if (i < 0) i = r.game.tracks.findIndex((t) => !t.score?.tune.lesson); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play'); return r.game.tracks[i]?.name;`);

for (const inst of ['drums', 'piano', 'marimba', 'congas', 'handpan', 'guitar']) {
  if (!want(inst) && !(inst === 'drums' && (want('hud') || want('results')))) continue;
  await goto('autoplay=1', { clear: true });
  const s = await placeKit();
  const k = s.debug.kitOrigin;
  console.log(inst, play(inst));
  away();
  // (the guitar is on your lap: look down at it from the seat; the rest from just above the desk's edge)
  if (inst === 'guitar') {
    await wait(2500);
    const g = js(`const m = r.kit.models.get('guitar'); const v = m.root.getWorldPosition(m.root.position.clone()); return v.toArray();`);
    xr('set-transform', { device: 'headset', position: { x: g[0] - 0.12, y: g[1] + 0.32, z: g[2] + 0.3 } });
    xr('look-at', { device: 'headset', target: { x: g[0] - 0.02, y: g[1], z: g[2] } });
  } else if (inst === 'drums') {
    xr('set-transform', { device: 'headset', position: { x: k[0], y: k[1] + 0.34, z: k[2] + 0.36 } });
    xr('look-at', { device: 'headset', target: { x: k[0], y: k[1] + 0.01, z: k[2] - 0.05 } });
  } else if (inst === 'congas') {
    // (tall: from higher and further back, aimed at the heads)
    xr('set-transform', { device: 'headset', position: { x: k[0], y: k[1] + 0.42, z: k[2] + 0.24 } });
    xr('look-at', { device: 'headset', target: { x: k[0], y: k[1] + 0.1, z: k[2] - 0.12 } });
  } else {
    // (the others are smaller: closer, and aimed a little further back)
    xr('set-transform', { device: 'headset', position: { x: k[0], y: k[1] + 0.24, z: k[2] + 0.18 } });
    xr('look-at', { device: 'headset', target: { x: k[0], y: k[1] + 0.03, z: k[2] - 0.12 } });
  }
  await wait(12000);
  if (want(inst)) for (let n = 0; n < 5; n++) shot(`${inst}-${n}`);
  if (inst === 'guitar') shot('guitar-wide');
  if (inst !== 'drums') continue;
  // the panel mid-song, from the seat and close
  const p = js(`const v = r.kit.module.root.getWorldPosition(r.kit.module.root.position.clone()); return v.toArray();`);
  if (want('hud')) {
    xr('set-transform', { device: 'headset', position: { x: k[0], y: k[1] + 0.3, z: k[2] + 0.42 } });
    xr('look-at', { device: 'headset', target: { x: p[0], y: p[1] - 0.05, z: p[2] } });
    for (let n = 0; n < 3; n++) shot(`hud-live-${n}`);
    xr('set-transform', { device: 'headset', position: { x: p[0], y: p[1] + 0.03, z: p[2] + 0.2 } });
    xr('look-at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });
    for (let n = 0; n < 3; n++) shot(`hud-${n}`);
  }
  if (want('results')) {
    // (after your best bars play back, the grade lands)
    await until((x) => x.game.mode === 'results', 300000, 1000);
    await until((x) => x.game.mode !== 'results' || x.game.display.line !== 'That was you', 120000, 1000).catch(() => {});
    xr('set-transform', { device: 'headset', position: { x: p[0], y: p[1] + 0.03, z: p[2] + 0.22 } });
    xr('look-at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } });
    await wait(4000);
    for (let n = 0; n < 3; n++) shot(`results-${n}`);
  }
}
console.log('done');

#!/usr/bin/env node
/**
 * The song list scrolls under a fingertip: on the Songs page, a fingertip lands on the list, drags it up the panel
 * (the list follows), flicks it (it carries on after the finger lifts), and a tap on a row without moving picks that
 * song. A screenshot of the scrolled list: artifacts/songs-scrolled.png.
 *   node tools/e2e-scroll.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, wait, run, check, done, xr, cli, measureHand, HAND, FLAT } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.scroll-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.scroll-js.mjs');
  rmSync('tools/.scroll-js.mjs', { force: true });
  return o;
};
// a point on the panel (x right, z up it, m; `out` in front of its face) in the world
const onPanel = (x, z, out) =>
  js(`const m = r.kit.module; const v = m.root.position.clone().set(${x}, ${z}, ${out}); m.root.updateMatrixWorld(true); m.root.localToWorld(v); return [v.x, v.y, v.z];`);
const list = () => js(`const m = r.kit.module; const L = m.page?.list; if (!L) return null; const W = 1360, H = 907, PW = 0.38, PH = 0.2533; return { x: ((L.x + L.w / 2) / W - 0.5) * PW, z: (0.5 - (L.y + L.h / 2) / H) * PH, h: (L.h / H) * PH, offset: m.scroll.offset, max: m.scroll.max, sel: r.game.songSel };`);

await goto('');
await placeKit();
const hand = await measureHand();
// (the fingertip where `p` is: the hand device sits that far back from its index tip)
const tipTo = (p) => ({ x: p[0] - hand.index[0], y: p[1] - hand.index[1], z: p[2] - hand.index[2] });
js(`r.putOut('drums'); r.game.menu = 'main'; r.game.act('nav:songs'); r.game.refreshDisplay();`);
await wait(1200);
const L = list();
check('the songs page has a list that scrolls', !!L && L.max > 0, JSON.stringify(L));
if (!L) done('E2E scroll');
xr('look-at', { device: 'headset', target: (() => { const p = onPanel(0, 0, 0); return { x: p[0], y: p[1], z: p[2] }; })() });

// a drag: land low on the list, slide 6 cm up the panel slowly, lift
const z0 = L.z - L.h * 0.3;
xr('set-transform', { device: HAND, position: tipTo(onPanel(L.x, z0, 0.03)), orientation: FLAT });
await wait(300);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0, -0.003)), duration: 0.15 });
await wait(350);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0 + 0.06, -0.003)), duration: 0.8 });
await wait(1000);
const mid = list();
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0 + 0.06, 0.04)), duration: 0.12 });
await wait(600);
const dragged = list();
check('a drag up the panel scrolls the list with the finger', mid.offset > 120, `offset ${mid.offset.toFixed(0)} px`);
check('a slow drag stops where it was left', Math.abs(dragged.offset - mid.offset) < 40, `${mid.offset.toFixed(0)} → ${dragged.offset.toFixed(0)}`);
check('dragging picks no song', dragged.sel === L.sel, `sel ${L.sel} → ${dragged.sel}`);

// a flick: a quick 5 cm swipe, lifting as it goes; the list runs on after the finger's off it
xr('set-transform', { device: HAND, position: tipTo(onPanel(L.x, z0, 0.03)), orientation: FLAT });
await wait(300);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0, -0.003)), duration: 0.1 });
await wait(250);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0 + 0.05, -0.002)), duration: 0.12 });
await wait(130);
const lifted = list();
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, z0 + 0.06, 0.05)), duration: 0.06 });
await wait(900);
const flung = list();
check('a flick carries the list on after the finger lifts', flung.offset > lifted.offset + 40, `${lifted.offset.toFixed(0)} → ${flung.offset.toFixed(0)}`);
check('it stays inside the list', flung.offset >= 0 && flung.offset <= flung.max + 0.5, `${flung.offset.toFixed(0)} of ${flung.max.toFixed(0)}`);
xr('set-transform', { device: HAND, position: tipTo(onPanel(L.x, 0, 0.15)), orientation: FLAT });
await wait(500);
cli('browser', 'screenshot', '--output-file', 'artifacts/songs-scrolled.png');

// a tap: the row in the middle of the window, touched and lifted without moving, is the song picked
const want = js(`const m = r.kit.module; const off = m.scroll.offset; const L = m.page.list; const y = L.y + L.h / 2 + off; const it = m.page.items.find((i) => i.scroll && y >= i.y && y < i.y + i.h + 6); return it ? Number(it.id.slice(5)) : -1;`);
xr('set-transform', { device: HAND, position: tipTo(onPanel(L.x, L.z, 0.03)), orientation: FLAT });
await wait(300);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, L.z, -0.003)), duration: 0.15 });
await wait(350);
xr('animate-to', { device: HAND, position: tipTo(onPanel(L.x, L.z, 0.04)), duration: 0.12 });
await wait(700);
const tapped = list();
check('a tap on a row picks that song', want >= 0 && tapped.sel === want, `wanted ${want}, picked ${tapped.sel}`);
check('the picked song stays in view', (() => { const y = js(`const m = r.kit.module; const it = m.page.items.find((i) => i.id === 'song:${tapped.sel}'); return it ? it.y - m.page.list.y - m.scroll.offset : -999;`); return y >= -1 && y <= 480 - 74 + 1; })());
xr('set-transform', { device: HAND, position: { x: 0.35, y: 1.45, z: -0.25 }, orientation: { pitch: 0, yaw: 0, roll: -90 } });
done('E2E scroll');

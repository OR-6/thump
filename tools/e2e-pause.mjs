#!/usr/bin/env node
/**
 * Pause mid-song through the panel's own press path (the debounce and page guards included): the song holds still, the
 * Pause page's buttons answer (Restart, then Resume), and the song carries on counting you back in.
 *   node tools/e2e-pause.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, wait, run, check, done, until } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.pause-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.pause-js.mjs');
  rmSync('tools/.pause-js.mjs', { force: true });
  return o;
};
/** Press the panel item `id` the way a fingertip does (pressPanel: timing guards and all). */
const press = (id) => js(`const items = r.kit.module.page?.items ?? []; const k = items.findIndex((it) => it.id === '${id}'); if (k < 0) return 'missing:' + items.map((i) => i.id).join(','); r.pressPanel(k); return 'ok';`);
const st = () => js(`return { mode: r.game.mode, paused: r.game.paused, page: r.kit.module.page?.id, t: r.clock.t };`);

await goto('');
await placeKit();
js(`r.putOut('drums'); r.game.level = 'easy'; const i = r.game.tracks.findIndex((t) => !t.score?.tune.lesson); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play');`);
await until((x) => x.game.mode === 'play', 15000, 300);
await wait(1500);
check('a song is playing', st().mode === 'play');

check('Pause (pressed on the panel) pauses', press('pause') === 'ok');
await wait(800);
let a = st();
check('the Pause page shows', a.paused && a.page === 'pause', JSON.stringify(a));
await wait(1000);
const b = st();
check('the song holds still while paused', Math.abs(b.t - a.t) < 0.01, `${a.t.toFixed(3)} -> ${b.t.toFixed(3)}`);

check('Restart answers on the Pause page', press('pause:restart') === 'ok');
await wait(800);
a = st();
check('restarted and playing again', !a.paused && (a.mode === 'play' || a.mode === 'count'), JSON.stringify(a));

await wait(1200);
press('pause');
await wait(900);
check('paused again', st().paused);
check('Resume answers on the Pause page', press('resume') === 'ok');
await wait(800);
a = st();
await wait(1000);
const c = st();
check('resumed: the song moves on', !c.paused && (c.mode === 'play' || c.mode === 'count') && c.t > a.t + 0.5, `${JSON.stringify(a)} -> ${JSON.stringify(c)}`);
done('E2E pause');

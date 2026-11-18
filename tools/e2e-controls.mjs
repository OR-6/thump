#!/usr/bin/env node
/**
 * Every control on every page of the screen, pressed the way a fingertip presses (the panel's own press path, timing
 * guards and all): each must change something you can see (the page, what it says, a setting, the instrument out, a
 * song chosen or started). A control that does nothing is a dead button, and fails. Pages: main, free, instruments,
 * each instrument's own page, songs, band, settings.
 *   node tools/e2e-controls.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, wait, run, check, done, slap, measureHand, DESK_Y } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.ctl-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.ctl-js.mjs');
  rmSync('tools/.ctl-js.mjs', { force: true });
  return o;
};
// what a press can change: the page and its words, the items' labels and states, the settings, what's out, the mode
const snap = () =>
  js(`const p = r.kit.module.page; const d = r.game.display; return JSON.stringify({ page: p?.id, title: p?.title, line: p?.line, items: (p?.items ?? []).map((i) => [i.id, i.label, i.sub, i.on, i.off]), set: r.settings, inst: r.kit.inst, mode: r.game.mode, menu: r.game.menu, sel: r.game.songSel, open: r.game.settingsOpen, level: r.game.level, focus: d.focus });`);
const press = (id) => js(`const items = r.kit.module.page?.items ?? []; const k = items.findIndex((it) => it.id === ${JSON.stringify(id)}); if (k < 0) return false; r.pressPanel(k); return true;`);
const items = () => js(`return (r.kit.module.page?.items ?? []).map((i) => ({ id: i.id, off: !!i.off, on: !!i.on, kind: i.kind }));`);
const goPage = async (setup) => {
  js(`r.game.stop?.(); r.game.settingsOpen = false; ${setup}; r.game.refreshDisplay();`);
  await wait(700);
};

await goto('');
const k = (await placeKit()).debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(800);

// (labels and dimmed controls aren't buttons; play / again / next start songs: checked by the mode changing)
const pages = [
  ['main', `r.putOut('drums'); r.game.menu = 'main'`],
  ['free', `r.game.menu = 'free'`],
  ['instruments', `r.game.menu = 'instruments'`],
  ['inst drums', `r.putOut('drums'); r.game.menu = 'inst'`],
  ['inst piano', `r.putOut('piano'); r.game.menu = 'inst'`],
  ['inst guitar', `r.putOut('guitar'); r.game.menu = 'inst'`],
  ['inst handpan', `r.putOut('handpan'); r.game.menu = 'inst'`],
  ['songs', `r.putOut('drums'); r.game.menu = 'songs'`],
  ['band', `r.game.menu = 'band'`],
  ['settings', `r.game.menu = 'main'; r.game.act('nav:settings')`],
];
const dead = [];
let pressed = 0;
for (const [name, setup] of pages) {
  await goPage(setup);
  // (already chosen: pressing it again rightly changes nothing)
  const list = items().filter((i) => !i.off && !i.on && !i.id.startsWith('label:') && i.kind !== 'label' && i.kind !== 'text' && !(i.id === 'songs:filter:all' || i.id === 'level:easy'));
  for (const it of list) {
    await goPage(setup);
    // (selected by an earlier press on this page: pressing it again rightly changes nothing)
    if (items().find((x) => x.id === it.id)?.on) continue;
    const before = snap();
    if (!press(it.id)) continue;
    await wait(600);
    const after = snap();
    pressed++;
    if (after === before) dead.push(`${name}: ${it.id}`);
  }
}
check(`every control does something (${pressed} pressed)`, dead.length === 0, dead.join(', '));
done('E2E controls');

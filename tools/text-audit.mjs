// Every page for every instrument, every songs page and filter: the text that doesn't fit its room at 48 px.
// Run with the dev server up and the kit placed: node tools/text-audit.mjs
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, measureHand, slap, wait, run, DESK_Y } from './e2e-lib.mjs';
await goto('debug=1&shots=1');
const s = await placeKit();
const k = s.debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(1500);
const js = (body) => { writeFileSync('tools/.ta.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(async () => { const r = window.__thump.game; ${body} }); }\n`); const o = run('tools/.ta.mjs'); rmSync('tools/.ta.mjs', { force: true }); return o; };
const out = js(`
  const seen = globalThis.__thumpOverflow; seen.clear();
  const tick = () => new Promise((f) => setTimeout(f, 120));
  const pages = ['main', 'free', 'instruments', 'inst', 'songs', 'band'];
  const found = [];
  const grab = (where) => { for (const v of seen.values()) found.push({ where, ...v }); seen.clear(); };
  for (const inst of ['drums', 'piano', 'marimba', 'guitar', 'handpan', 'congas']) {
    r.putOut(inst);
    for (const p of pages) { r.game.menu = p; r.game.refreshDisplay(); await tick(); grab(inst + ':' + p); }
  }
  r.game.settingsOpen = true; r.game.refreshDisplay(); await tick(); grab('settings'); r.game.settingsOpen = false;
  r.game.menu = 'songs';
  for (const f of ['all', 'classics', 'originals', 'lessons']) {
    r.game.act('songs:filter:' + f);
    for (let pg = 0; pg < 8; pg++) {
      for (let i = 0; i < r.game.tracks.length; i += 1) { if (pg === 0) { r.game.songSel = i; r.game.refreshDisplay(); await tick(); grab('songs-card:' + r.game.tracks[i].name); } }
      r.game.act('songs:more'); await tick(); grab('songs:' + f + ':' + pg);
    }
  }
  return found;
`);
const uniq = new Map();
for (const f of out ?? []) uniq.set(f.text + '|' + f.room, f);
console.log(JSON.stringify([...uniq.values()], null, 1));

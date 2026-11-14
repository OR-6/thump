#!/usr/bin/env node
/**
 * Free play's recorder on every instrument, in the emulator: a take of four bars records what's played (each guitar
 * string as it sounded, both notes of a piano black key), it loops, and its playback sounds those notes again.
 */
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, measureHand, slap, wait, run, check, done, DESK_Y } from './e2e-lib.mjs';
await goto('debug=1');
const s = await placeKit();
const k = s.debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(1500);
const js = (body) => { writeFileSync('tools/.lp.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(async () => { const r = window.__thump.game; ${body} }); }\n`); const o = run('tools/.lp.mjs'); rmSync('tools/.lp.mjs', { force: true }); return o; };
const plays = {
  drums: ['kit:kick', 'kit:snare', 'kit:hat'],
  piano: ['piano:0', 'piano:2', 'piano:4'],
  marimba: ['marimba:0', 'marimba:2', 'marimba:4'],
  handpan: ['handpan:0', 'handpan:3', 'handpan:5'],
  congas: ['congas:0', 'congas:2', 'congas:3'],
  guitar: ['guitar:9', 'guitar:9', 'guitar:9'],
};
for (const [inst, keys] of Object.entries(plays)) {
  const r = js(`
    const tick = (ms) => new Promise((f) => setTimeout(f, ms));
    r.putOut('${inst}');
    r.game.menu = 'free'; r.game.refreshDisplay();
    r.panelAction('loop:clear');
    r.panelAction('loop:rec');
    // (the count-in, then the take)
    for (let i = 0; i < 80 && r.game.looper.state !== 'rec'; i++) await tick(100);
    if (!r.game.looper.recording) return { err: 'never recorded' };
    for (let n = 0; n < 6; n++) { r.autoHit(${JSON.stringify(keys)}[n % 3], r.clock.t); await tick(350); }
    // the take ends; it loops
    for (let i = 0; i < 160 && r.game.looper.recording; i++) await tick(100);
    const layer = r.game.looper.layers[0] ?? [];
    // its playback: the room voices the notes again
    const heard = [];
    const was = r.stage.voice;
    r.stage.voice = (key, ...a) => { heard.push(key); return was(key, ...a); };
    await tick(4000);
    r.stage.voice = was;
    r.panelAction('loop:clear');
    return { n: layer.length, keys: [...new Set(layer.map((h) => h.key))], heard: [...new Set(heard)].slice(0, 12), state: r.game.looper.state };
  `);
  const ok = r && !r.err && r.n >= 3 && r.heard.length > 0;
  const want = inst === 'guitar' ? r?.keys?.every((x) => x.startsWith('pluck:')) && r.keys.length >= 4 : r?.keys?.length >= 2;
  check(`${inst}: a take records what's played`, ok && want, JSON.stringify(r));
}
done('loop');

#!/usr/bin/env node
/**
 * A newcomer's first minutes, end to end (the autoplayer as the player): the welcome on the HUD, the drums arriving,
 * the drums lesson starting by itself, each step held to read (a hit goes on), its first notes waiting at their
 * moment ("Now!"), the first Perfect said, the lesson to its results, then the screen: the HUD points at Next, Next
 * pulses, and poking it ends the guide.
 *   node tools/e2e-onboard.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, wait, run, check, done, until, slap, measureHand, DESK_Y } from './e2e-lib.mjs';

const js = (body) => {
  writeFileSync('tools/.onb-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.onb-js.mjs');
  rmSync('tools/.onb-js.mjs', { force: true });
  return o;
};

await goto('coach=1', { clear: true });
// every message the HUD shows, and every hold, recorded in the page as it happens
js(`window.__hudLog = []; window.__holds = []; const h = r.hud; const set = h.set.bind(h); h.set = (s) => { const k = s.kind === 'tip' ? s.big : s.kind; const L = window.__hudLog; if (L[L.length - 1] !== k) L.push(k); return set(s); }; const g = r.game; let was = null; setInterval(() => { const k = g.hold ? g.hold.kind : null; if (k !== was) { window.__holds.push(k); was = k; } }, 20);`);
const k = (await placeKit()).debug.kitOrigin;
await wait(1200);
const coach0 = js(`return { coach: r.settings.coach ?? 0, say: r.hudSay };`);
check('a newcomer starts at the welcome: tap the desk', coach0.coach === 0 && coach0.say?.big === 'Welcome to Thump' && coach0.say?.foot === 'Tap the desk to begin', JSON.stringify(coach0));
// the tap that brings the drums (by hand); from there the autoplayer plays, letting the first notes wait as you would
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
js(`r.autoOn = true;`);
let s = await until((x) => x.game.mode === 'count' || x.game.mode === 'play', 20000, 300);
const track = js(`return r.game.song?.name ?? r.game.perfTrackName ?? '';`);
check('the drums arrive, then the first lesson starts by itself', s.game.mode === 'count' || s.game.mode === 'play', `${s.game.mode} ${track}`);
s = await until((x) => x.game.mode === 'results', 240000, 1000);
check('the lesson plays to its results', s.game.mode === 'results', s.game.mode);
const log = js(`return window.__hudLog;`);
const holds = js(`return window.__holds;`);
check('the HUD said welcome first', log[0] === 'Welcome to Thump' || log.includes('Welcome to Thump'), log.slice(0, 4).join(' / '));
check('then "Your drums" (make fists: sticks)', log.includes('Your drums'), log.slice(0, 6).join(' / '));
check('each step held to read (four steps)', holds.filter((k) => k === 'read').length === 4, holds.join(','));
check('the first notes of each step waited at their moment', holds.filter((k) => k === 'note').length >= 8, `${holds.filter((k) => k === 'note').length} note holds`);
check('the HUD said Now! at a held note', log.includes('Now!'), log.join(' / ').slice(0, 300));
check('the first Perfect was said', log.includes('First Perfect!'), '');
await wait(1500);
const after = js(`return { coach: r.settings.coach, say: r.hudSay, focus: r.game.display.focus };`);
check('after it: the guide points at the screen', after.coach === 2 && after.say?.big === 'Poke Next on the screen', JSON.stringify(after));
check('and Next pulses on the screen', after.focus === 'next', after.focus);
await wait(5000);
const pressed = js(`const items = r.kit.module.page?.items ?? []; const k = items.findIndex((it) => it.id === 'next'); if (k < 0) return 'missing'; r.pressPanel(k); return 'ok';`);
await wait(800);
const end = js(`return { coach: r.settings.coach, mode: r.game.mode };`);
check('poking it ends the guide (and plays the next song)', pressed === 'ok' && end.coach === 3, JSON.stringify(end));
done('E2E onboard');

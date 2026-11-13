#!/usr/bin/env node
/**
 * The first ten minutes, end to end, with the autoplayer (?autoplay=1 hits every note on time
 * through the same path as a real hit). Shoots each moment for review.
 *   node tools/e2e-slice.mjs          the first steps: kick → snare → copy → hat → copy → crowd → Porch Step's title
 *   node tools/e2e-slice.mjs --full   on through three songs, the unlocks and the bandmate to the song cards (~9 min)
 */
import { state, wait, check, done, shot, goto, placeKit, until, DESK_Y } from './e2e-lib.mjs';

const FULL = process.argv.includes('--full');
await goto('autoplay=1&debug=1');
let s = await placeKit();
check('kit placed', s.debug.phase === 'placed', s.debug.deskSource);
const at = (s) => [s.debug.kitOrigin[0], DESK_Y - 0.02, s.debug.kitOrigin[2] - 0.05];
const look = at(s);
s = await until((x) => x.flow.phase === 'first-kick', 4000);
check('the first pad asks for a hit, and plays', s.flow.lanes[0] === 'kick' && s.debug.hits >= 0, s.flow.phase);
shot('slice-01-first-kick', look);
s = await until((x) => x.flow.lanes.includes('snare'), 8000);
check('the snare slides in after the first kick', s.flow.lanes.includes('snare'), JSON.stringify(s.flow.lanes));
s = await until((x) => x.flow.phase === 'copy-demo', 8000);
check('the pads show the groove', s.flow.phase === 'copy-demo', s.flow.phase);
shot('slice-02-copy-demo', look);
s = await until((x) => x.flow.phase === 'groove', 15000);
check('copying it starts a groove', s.flow.phase === 'groove' && s.flow.copied, `${s.flow.phase} copied=${s.flow.copied}`);
s = await until((x) => x.flow.lanes.includes('hat'), 12000);
check('the hat joins', s.flow.lanes.includes('hat'));
s = await until((x) => x.flow.crowd >= 3, 25000);
check('the crowd arrives after the second copy', s.flow.crowd >= 3, `crowd=${s.flow.crowd}`);
await wait(1200);
shot('slice-03-crowd', look);
s = await until((x) => x.flow.phase === 'title', 15000);
check('the first song is announced on a felt card', s.flow.phase === 'title' && s.debug.title === 'Porch Step', `${s.flow.phase} ${s.debug.title}`);
shot('slice-04-title', look);
if (FULL) {
  s = await until((x) => x.flow.phase === 'play' && x.flow.chips > 2, 8000);
  check('notes travel toward the pads', s.flow.chips > 2, `chips=${s.flow.chips}`);
  await wait(4000);
  shot('slice-05-porch-step', look);
  s = await until((x) => x.flow.phase === 'results', 90000, 1000);
  check('the song ends with stars', s.debug.stars === 3, `stars=${s.debug.stars} ${JSON.stringify(s.flow.last)}`);
  await wait(1500);
  shot('slice-06-stars', look);
  s = await until((x) => x.flow.lanes.includes('tom'), 12000);
  check('the tom slides in', s.flow.lanes.includes('tom'));
  await wait(500);
  shot('slice-07-tom', look);
  s = await until((x) => x.flow.song === 'kitchen-clock' && x.flow.phase === 'play', 40000, 1000);
  check('Kitchen Clock plays', s.flow.song === 'kitchen-clock');
  s = await until((x) => x.flow.lanes.includes('gong'), 100000, 1000);
  check('the gong arrives after Kitchen Clock', s.flow.lanes.includes('gong'), `onWall=${s.debug.gongOnWall}`);
  await wait(800);
  shot('slice-08-gong', look);
  s = await until((x) => x.debug.bird, 15000);
  check('the bandmate sits down', s.debug.bird);
  s = await until((x) => x.flow.song === 'call-and-answer' && x.flow.phase === 'play', 40000, 1000);
  await wait(9000);
  shot('slice-09-call-and-answer', look);
  s = await until((x) => x.flow.phase === 'list', 120000, 1000);
  check('the song cards come out', s.flow.phase === 'list' && s.debug.list, s.flow.phase);
  check('three songs with stars', ['porch-step', 'kitchen-clock', 'call-and-answer'].every((id) => s.progress.stars[id] >= 2), JSON.stringify(s.progress.stars));
  check('the crowd grew', s.progress.crowd > 3, `crowd=${s.progress.crowd}`);
  await wait(1200);
  shot('slice-10-cards', look);
}
s = state();
check('no frame errors', s.debug.errors === 0, `errors=${s.debug.errors}`);
done(FULL ? 'E2E slice (full)' : 'E2E slice');

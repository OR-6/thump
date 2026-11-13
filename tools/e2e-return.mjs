#!/usr/bin/env node
/** Come back to the same room: what you found is already drawn (the room map is saved under the room anchor). */
import { run, state, wait, check, done, goto, placeKit, until } from './e2e-lib.mjs';

await goto('autoplay=1&debug=1');
let s = await placeKit();
s = await until((x) => x.game.found.length >= 2, 15000, 500);
const first = s.game.found.slice();
check('first visit: instruments found', first.length >= 2, JSON.stringify(first));
check('the room map is saved under the anchor', Object.values(s.progress.rooms ?? {}).some((l) => l.length >= 2), JSON.stringify(s.progress.rooms));
const swapped = run('tools/swap-one.mjs');
check('a found instrument swapped', !!swapped && swapped.family !== swapped.natural, JSON.stringify(swapped));
await wait(500);
const firstNow = state().game.found.slice();
// come back: same storage, no autoplay
await goto('debug=1', { clear: false });
s = await placeKit();
s = await until((x) => firstNow.every((f) => x.game.found.includes(f)), 6000, 500);
check('second visit: they come back already drawn', firstNow.every((f) => s.game.found.includes(f)), `${JSON.stringify(firstNow)} → ${JSON.stringify(s.game.found)} anchored=${s.debug.anchored}`);
const back = s.debug.surfaces.find((x) => x.discovered && x.family === swapped?.family && x.id !== 'kit');
check('the swap comes back too', !!back, JSON.stringify(s.debug.surfaces.filter((x) => x.discovered).map((x) => `${x.id}:${x.family}`)));
check('no frame errors', state().debug.errors === 0);
done('E2E return');

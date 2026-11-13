#!/usr/bin/env node
/** Come back to the same room: what you found is already drawn (the room map is saved under the room anchor). */
import { state, wait, check, done, goto, placeKit, until } from './e2e-lib.mjs';

await goto('autoplay=1&debug=1');
let s = await placeKit();
s = await until((x) => x.game.found.length >= 2, 15000, 500);
const first = s.game.found.slice();
check('first visit: instruments found', first.length >= 2, JSON.stringify(first));
check('the room map is saved under the anchor', Object.values(s.progress.rooms ?? {}).some((l) => l.length >= 2), JSON.stringify(s.progress.rooms));
// come back: same storage, no autoplay
await goto('debug=1', { clear: false });
s = await placeKit();
s = await until((x) => x.game.found.length >= first.length, 6000, 500);
check('second visit: they come back already drawn', first.every((f) => s.game.found.includes(f)), `${JSON.stringify(first)} → ${JSON.stringify(s.game.found)} anchored=${s.debug.anchored}`);
check('no frame errors', state().debug.errors === 0);
done('E2E return');

#!/usr/bin/env node
/**
 * Playing together, for real (PeerJS's public service, two pages of the app in the managed browser): one starts a
 * band and gets a code, the other types it and joins; a pad tapped on each page is heard on the other.
 */
import { run, check, done } from './e2e-lib.mjs';

const r = run('tools/band-pair.mjs');
check('starting a band gives a 4-letter code', /^[A-Z]{4}$/.test(r.code ?? ''), r.host || r.err);
check('typing it joins: both pages say who is in the band', /2 in the band/.test(r.join ?? ''), r.join || r.err);
check("the host hears the friend's notes", r.aHeard >= 2, `heard ${r.aHeard}`);
check("the friend hears the host's", r.bHeard >= 1, `heard ${r.bHeard}`);
check('the friend presses play: the song starts on both', /count|play/.test(r.aMode) && /count|play/.test(r.bMode), `${r.aMode} / ${r.bMode}`);
check('on the same beat (within a sixteenth)', r.beatGap >= 0 && r.beatGap < 0.25, `gap ${r.beatGap?.toFixed?.(3)} beats`);
done('E2E band');

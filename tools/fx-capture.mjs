#!/usr/bin/env node
/**
 * The game's effects, measured in the emulator: every sound and light the game adds on top of the music, counted per
 * minute, and what you hear recorded (the engine's master, tapped into a MediaRecorder in the page), with a few
 * frames. Three takes:
 *   --song   60 s of the first song with the autoplayer (it misses one note in ten, seeded, so misses and lost runs
 *            happen as they do for a person; the Spotlight is fired when it's ready)
 *   --free   60 s of free play on the drums (a beat on kick, snare and hat at 100 bpm, every hit through the game's
 *            own hit path)
 *   --board  each of the game's own sounds alone, 1.4 s apart, after a snare at a normal hit for scale
 * Writes <out>/<take>.webm (+ .wav, .mp3 with ffmpeg), <out>/<take>-events.json and <out>/<take>-NN.png.
 *   node tools/fx-capture.mjs --out artifacts/fx/after --song [--secs 60]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { goto, placeKit, wait, xr, state, until, cli } from './e2e-lib.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const OUT = arg('--out', 'artifacts/fx/now');
const SECS = Number(arg('--secs', 60));
const TAKE = process.argv.includes('--free') ? 'free' : process.argv.includes('--board') ? 'board' : process.argv.includes('--lesson') ? 'lesson' : 'song';
mkdirSync(`${OUT}/.js`, { recursive: true });

let n = 0;
/** Run `body` in the app's frame (r: the room system, A: the audio engine, S: the effect sounds if there are any). */
const js = (body, arg = null) => {
  const f = `${OUT}/.js/s${n++}.mjs`;
  writeFileSync(f, `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(async (arg) => { const T = window.__thump; const r = T.game; const A = T.audio; const S = T.sfx; ${body} }, ${JSON.stringify(arg)}); }\n`);
  const out = execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', f], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  rmSync(f, { force: true });
  return JSON.parse(out).data?.result;
};

// what's counted: every call to these, by name, with its time (ms from the start)
const PROBE = `
  const fx = (window.__fx = { ev: [], t0: performance.now() });
  const log = (k) => fx.ev.push([Math.round(performance.now() - fx.t0), k]);
  const wrap = (o, name, label, when) => {
    if (!o || typeof o[name] !== 'function' || o[name].__fx) return;
    const f = o[name];
    o[name] = function (...a) {
      const k = typeof label === 'function' ? label(a, this) : label;
      if (k && (!when || when(a, this))) log(k);
      return f.apply(this, a);
    };
    o[name].__fx = true;
  };
  // sounds
  wrap(A, 'ui', (a) => 'snd:ui:' + a[0]);
  for (const m of ['missKnock', 'perfectTick', 'cheer', 'crash', 'tick', 'whoosh', 'chime', 'riser', 'powerDown', 'kaChunk', 'chirp']) wrap(A, m, 'snd:' + m);
  if (S) for (const m of ['hover', 'press', 'open', 'back', 'toggle', 'tick', 'denied', 'set', 'lift', 'count', 'whoosh', 'mult', 'milestone', 'runLost', 'miss', 'spotGain', 'overtake', 'lessonStep', 'firstPerfect', 'stamp', 'record', 'fullCombo', 'powerDown', 'strike', 'bloom', 'applause']) wrap(S, m, 'sfx:' + m, m === 'runLost' ? (a) => a[0] >= 25 : null);
  wrap(A, 'drum', (a) => 'play:drum');
  wrap(A, 'modal', (a) => 'play:modal');
  // lights
  wrap(r.hitFx, 'flash', (a) => 'vfx:ring:' + a[0]);
  // (a word counts when it's drawn: the game may say a grade without its word)
  wrap(r.hitWords, 'show', (a, w) => (['perfect', 'good', 'early', 'late'].includes(a[0]) && (!w.wants || w.wants(a[0])) ? 'vfx:word:' + a[0] : null));
  wrap(r.kit.module, 'burst', (a) => 'vfx:panel-burst:' + a[0]);
  wrap(r.kit.module, 'edgeFlash', 'vfx:panel-edge');
  wrap(r.kit.module, 'say', 'vfx:panel-say');
  wrap(r.dimmer, 'hit', 'vfx:dimmer-hit', (a, d) => d.dark >= 0.1 && !d.calm);
  wrap(r.waterfall, 'emit', 'vfx:free-light');
  wrap(r.lightsOut, 'fire', (a) => 'vfx:lights-out:' + a[0]);
  // draw calls per frame (the renderer's count for the last frame, read each animation frame)
  fx.draws = { n: 0, sum: 0, max: 0 };
  const ren = r.world.renderer;
  const sample = () => {
    if (!window.__fx || window.__fx !== fx) return;
    const c = ren.info.render.calls;
    if (c > 0) {
      fx.draws.n++;
      fx.draws.sum += c;
      fx.draws.max = Math.max(fx.draws.max, c);
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  // moments (the game's hooks)
  for (const h of ['multUp', 'milestone', 'comboBroke', 'missed', 'spotGain', 'spotFire', 'spotEnd', 'overtake', 'lessonStep', 'holdSong', 'riser', 'drop', 'gradeStamp', 'newBest', 'fullCombo', 'celebrate']) wrap(r.stage, h, 'hook:' + h);
`;

const REC = `
  const ctx = A.ctx;
  if (!ctx) return 'no audio';
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  const dest = ctx.createMediaStreamDestination();
  // (what reaches the speaker is the master a quarter as loud, through a soft knee that's flat below 0.6)
  const g = ctx.createGain();
  g.gain.value = 0.25;
  A.master.connect(g).connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start(500);
  window.__rec = { rec, chunks, g, state: ctx.state };
  return ctx.state;
`;
const STOP = `
  const R = window.__rec;
  await new Promise((res) => { R.rec.onstop = res; R.rec.stop(); });
  R.g.disconnect();
  const b = new Blob(R.chunks, { type: 'audio/webm' });
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  window.__recB64 = btoa(s);
  return window.__recB64.length;
`;
/** The recording, fetched in pieces (a browser run returns at most 1 MB). */
function fetchRec() {
  const len = js(STOP);
  let b64 = '';
  for (let i = 0; i < len; i += 700000) b64 += js(`return window.__recB64.slice(arg, arg + 700000);`, i);
  return b64;
}

function save(b64) {
  const f = `${OUT}/${TAKE}.webm`;
  writeFileSync(f, Buffer.from(b64, 'base64'));
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-ar', '48000', `${OUT}/${TAKE}.wav`]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-b:a', '192k', `${OUT}/${TAKE}.mp3`]);
  } catch (e) {
    console.log('ffmpeg:', e.message);
  }
}
const shot = (i) => cli('browser', 'screenshot', '--output-file', `${OUT}/${TAKE}-${String(i).padStart(2, '0')}.png`);

function summarise(ev, secs) {
  const c = {};
  for (const [, k] of ev) c[k] = (c[k] ?? 0) + 1;
  const per = {};
  for (const [k, v] of Object.entries(c).sort()) per[k] = { count: v, perMin: Math.round((v / secs) * 60 * 10) / 10 };
  return per;
}

if (TAKE === 'board') {
  await goto('debug=1');
  await placeKit();
  await wait(1500);
  console.log('recorder:', js(REC));
  js(PROBE);
  // the snare for scale, then each of the game's own sounds alone
  const list = js(`
    const out = [];
    const play = (name, f) => { out.push(name); f(); };
    const seq = [];
    seq.push(['snare (reference, a normal hit)', () => A.drum('snare', 0.75, 0, 0, 1)]);
    if (S && S.board) for (const [name, f] of S.board()) seq.push([name, f]);
    else {
      for (const u of ['hover', 'press', 'back', 'open', 'toggle', 'tick', 'drop', 'multup', 'milestone', 'stamp-soft', 'stamp', 'record', 'fullcombo', 'spotlight']) seq.push(['ui:' + u, () => A.ui(u)]);
      seq.push(['perfectTick', () => A.perfectTick(0)], ['missKnock', () => A.missKnock(0)], ['tick (setting)', () => A.tick()], ['tick (hover level)', () => A.tick(0.1)], ['cheer (small)', () => A.cheer(0.5, false)], ['cheer (big)', () => A.cheer(1, true)], ['crash', () => A.crash(0.6)], ['whoosh', () => A.whoosh(0)], ['powerDown + kaChunk', () => { A.powerDown(); A.kaChunk(0.4); }]);
    }
    for (let i = 0; i < seq.length; i++) {
      const [name, f] = seq[i];
      setTimeout(() => play(name, f), 300 + i * 1400);
    }
    window.__boardN = seq.length;
    return seq.map((x) => x[0]);
  `);
  await wait(300 + list.length * 1400 + 1500);
  save(fetchRec());
  writeFileSync(`${OUT}/board-order.json`, JSON.stringify(list.map((name, i) => ({ at: 0.3 + i * 1.4, name })), null, 1));
  console.log(list.map((x, i) => `${(0.3 + i * 1.4).toFixed(1)} s  ${x}`).join('\n'));
  process.exit(0);
}

if (TAKE === 'lesson') {
  // the autoplayer's first song: the drums lesson, as a newcomer meets it
  await goto('autoplay=1&debug=1');
  const s = await until((x) => x && (x.game.mode === 'count' || x.game.mode === 'play'), 40000, 500);
  console.log('song:', s.game.song, s.game.mode);
} else if (TAKE === 'song') {
  // the first song that isn't a lesson, on the drums, the autoplayer playing it
  await goto('debug=1');
  await placeKit();
  await wait(800);
  console.log('track', js(`r.putOut('drums'); const i = r.game.tracks.findIndex((t) => !t.score?.tune.lesson); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play'); r.autoOn = true; return i;`));
  const s = await until((x) => x && (x.game.mode === 'count' || x.game.mode === 'play'), 20000, 300);
  console.log('song:', s.game.song, s.game.mode);
} else {
  await goto('debug=1');
  let s = await placeKit();
  await wait(800);
  // the drums out (a hit on the desk), then a beat
  js(`r.autoHit('kit:snare', r.clock.t); return 1;`);
  await wait(2500);
}
// look down at the instrument, as you would playing it
{
  const k = state().debug.kitOrigin;
  if (k) xr('look-at', { device: 'headset', target: { x: k[0], y: k[1] + 0.05, z: k[2] - 0.05 } });
}
console.log('recorder:', js(REC));
js(PROBE);
if (TAKE !== 'free') {
  // a person misses now and then: one note in ten (seeded, the same every take); the Spotlight fired when it's ready
  js(`
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const hit = r.autoHit.bind(r);
    r.autoHit = (k, t) => { if (r.game.mode === 'play' && rnd() < 0.1) return; hit(k, t); };
    window.__spotIv = setInterval(() => { const d = r.game.display.spot; if (d && d.ready) r.game.fireSpotlight(); }, 500);
    return 1;
  `);
} else {
  js(`
    // 100 bpm eighths: kick on 1 and 3 (and the and of 3), snare on 2 and 4, hat on every eighth
    const spb = 0.6;
    let i = 0;
    window.__beatIv = setInterval(() => {
      const e = i % 8;
      const t = r.clock.t;
      r.autoHit('kit:hat', t);
      if (e === 0 || e === 4 || e === 5) r.autoHit('kit:kick', t);
      if (e === 2 || e === 6) r.autoHit('kit:snare', t);
      i++;
    }, (spb / 2) * 1000);
    return 1;
  `);
}
const t0 = Date.now();
const shots = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56].filter((x) => x < SECS);
for (let i = 0; i < shots.length; i++) {
  await wait(Math.max(0, shots[i] * 1000 - (Date.now() - t0)));
  shot(i);
}
await wait(Math.max(0, SECS * 1000 - (Date.now() - t0)));
const ev = js(`clearInterval(window.__spotIv); clearInterval(window.__beatIv); return window.__fx.ev;`);
const dr = js(`const d = window.__fx.draws; return { mean: Math.round((d.sum / Math.max(1, d.n)) * 10) / 10, max: d.max, frames: d.n };`);
const end = state();
save(fetchRec());
const summary = summarise(ev, SECS);
writeFileSync(`${OUT}/${TAKE}-events.json`, JSON.stringify({ take: TAKE, secs: SECS, song: end.game.song, mode: end.game.mode, graded: end.game.graded, draws: dr, summary, events: ev }, null, 1));
console.log(`${TAKE}: ${SECS} s, ${ev.length} events (mode now ${end.game.mode}, graded ${JSON.stringify(end.game.graded)}), draw calls per frame ${JSON.stringify(dr)}`);
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(34)} ${String(v.count).padStart(4)}  ${String(v.perMin).padStart(6)}/min`);

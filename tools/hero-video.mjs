#!/usr/bin/env node
/**
 * The website's hero loop (public/site/hero.mp4, hero.webm and hero.jpg, the poster). docs/SITE-DESIGN.md, "The hero
 * video", says what it must be.
 *
 * From real headset footage (what it's for; the recording from the Quest, any size):
 *   node tools/hero-video.mjs --from path/to/quest-clip.mp4 --in 12.5 [--len 10] [--poster 3.2]
 *
 * Placeholder from the emulator (the dev server up, `npx @iwsdk/cli dev status` ready): the autoplayer plays a song on
 * the drums on Hard while the emulator's two outline hands come down on each piece in time, seen from the seat, with the emulated
 * room behind it darkened; the page is filmed with the browser's own screencast.
 *   node tools/hero-video.mjs [--song "Mango Season"] [--len 10]
 *
 * Either way it cuts a 10 s loop whose end dissolves into its start, 1280x720 at 30 fps, no sound, H.264 (and VP9
 * WebM), and checks the sizes against the budget (mp4 ≤ 2 MB).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const LEN = Number(arg('len', 10));
const FADE = 0.5;
const OUT = 'public/site';
const TMP = 'artifacts/hero-rec';
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

/** The loop from one source clip: [start, start + LEN + FADE), its last FADE seconds dissolving into its first. */
function encode(src, start, posterAt) {
  const fit = 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,format=yuv420p';
  const loop = `[0:v]trim=start=${start}:duration=${LEN + FADE},setpts=PTS-STARTPTS,${fit},split[a][b];` +
    `[a]trim=start=${FADE},setpts=PTS-STARTPTS[main];[b]trim=duration=${FADE},setpts=PTS-STARTPTS[head];` +
    `[main][head]xfade=transition=fade:duration=${FADE}:offset=${LEN - FADE},format=yuv420p[v]`;
  mkdirSync(TMP, { recursive: true });
  ff(['-i', src, '-filter_complex', loop, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'high', '-movflags', '+faststart', `${OUT}/hero.mp4`]);
  // (a WebM beside it only when it's the smaller of the two: every browser plays the H.264)
  ff(['-i', `${OUT}/hero.mp4`, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '44', '-row-mt', '1', '-deadline', 'good', `${OUT}/hero.webm`]);
  if (statSync(`${OUT}/hero.webm`).size >= statSync(`${OUT}/hero.mp4`).size) rmSync(`${OUT}/hero.webm`);
  // the poster: one frame of the loop, for reduced motion, slow connections and before it plays
  ff(['-ss', String(posterAt), '-i', `${OUT}/hero.mp4`, '-frames:v', '1', '-q:v', '4', `${OUT}/hero.jpg`]);
  for (const f of ['hero.mp4', 'hero.webm', 'hero.jpg']) if (existsSync(`${OUT}/${f}`)) console.log(`${OUT}/${f}  ${(statSync(`${OUT}/${f}`).size / 1024).toFixed(0)} KB`);
  if (statSync(`${OUT}/hero.mp4`).size > 2 * 1024 * 1024) console.log('over budget: raise -crf or shorten --len');
}

const from = arg('from');
if (from) {
  if (!existsSync(from)) throw new Error(`no such clip: ${from}`);
  encode(from, Number(arg('in', 0)), Number(arg('poster', 2)));
  process.exit(0);
}

// ---- the emulator placeholder ----
const { xr, goto, placeKit, measureHand, wait, run, HAND } = await import('./e2e-lib.mjs');
const SONG = arg('song', 'Mango Season');
const js = (body) => {
  writeFileSync('tools/.site-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(() => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.site-js.mjs');
  rmSync('tools/.site-js.mjs', { force: true });
  return o;
};

await goto('autoplay=1', { clear: true });
// (each hand's palm and lowest point from its device position, measured before there's a kit to hit)
const right = await measureHand(HAND);
const left = await measureHand('hand-left');
const s = await placeKit();
const k = s.debug.kitOrigin;
console.log('kit', k, 'song', js(`r.putOut('drums'); r.game.level = 'hard'; const i = r.game.tracks.findIndex((t) => t.name === ${JSON.stringify(SONG)}); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play'); return r.game.tracks[i]?.name;`));
for (const [device, side] of [[HAND, 1], ['hand-left', -1]]) xr('set-transform', { device, position: { x: k[0] + side * 0.25, y: k[1] + 0.2, z: k[2] + 0.15 }, orientation: { pitch: 0, yaw: 0, roll: 0 } });
// from the seat: a little above and behind the kit's front edge, looking down onto it and the screen behind
xr('set-transform', { device: 'headset', position: { x: k[0] - 0.2, y: k[1] + 0.38, z: k[2] + 0.5 } });
xr('look-at', { device: 'headset', target: { x: k[0] - 0.2, y: k[1] + 0.07, z: k[2] - 0.12 } });

/** In the page: two palms come down on each piece as its note falls due (2.5 cm short of the head, so the autoplayer's hits stay the only ones). */
function drive({ left, right }) {
  const r = window.__thump.game;
  const dev = window.IWER_DEVICE;
  const off = { left, right };
  const CLEAR = 0.025;
  let assign = null;
  let notesRef = null;
  const at = (lane) => {
    const p = r.kit.pads.get(lane);
    if (!p) return null;
    const v = p.group.position.clone().set(0, p.headY, 0);
    p.group.localToWorld(v);
    return [v.x, v.y, v.z];
  };
  const put = (hand, side, x, y, z) => {
    const o = off[side];
    const px = x - o.palm[0], py = y - o.low, pz = z - o.palm[2];
    if (hand.position.set) hand.position.set(px, py, pz);
    else Object.assign(hand.position, { x: px, y: py, z: pz });
    if (hand.quaternion.set) hand.quaternion.set(0, 0, 0, 1);
  };
  const ease = (u) => u * u * (3 - 2 * u);
  // (the emulator's own outline hands, which the game takes off every layer: on a headset you see your real ones)
  const ad = r.input.xr.visualAdapters.hand;
  for (const a of [ad.left, ad.right]) a.visual?.model?.traverse((o) => o.layers.enable(0));
  window.__heroDrive = true;
  const tick = () => {
    if (!window.__heroDrive) return;
    requestAnimationFrame(tick);
    const g = r.game;
    if (!g.judge) return;
    const notes = g.judge.notes;
    if (notes !== notesRef) {
      // each note to a hand: hi-hat left, bass drum and tom right, the snare left unless the hat is struck with it
      notesRef = notes;
      assign = notes.map((n) => {
        const lane = n.lane.replace('kit:', '');
        if (lane === 'hat' || lane === 'crash') return 'left';
        if (lane === 'snare') return notes.some((m) => m.lane === 'kit:hat' && Math.abs(m.t - n.t) < 0.03) ? 'right' : 'left';
        return 'right';
      });
    }
    const t = r.clock.t - g.clock.start - g.opts.offset;
    for (const side of ['left', 'right']) {
      let prev = null, next = null;
      for (let i = 0; i < notes.length; i++) {
        if (assign[i] !== side) continue;
        if (notes[i].t <= t) prev = notes[i];
        else if (!next || notes[i].t < next.t) next = notes[i];
      }
      const home = at(side === 'left' ? 'hat' : 'kick') ?? [0, 1, -0.3];
      const P = prev ? at(prev.lane.replace('kit:', '')) ?? home : home;
      const N = next && next.t - t < 1.2 ? at(next.lane.replace('kit:', '')) ?? home : null;
      const hand = dev.hands[side];
      if (!N) {
        // nothing coming: back up over the last one
        const u = Math.min(1, prev ? (t - prev.t) / 0.4 : 1);
        put(hand, side, P[0], P[1] + CLEAR + 0.09 * Math.sin((u * Math.PI) / 2), P[2] + 0.03);
        continue;
      }
      const tp = prev ? prev.t : next.t - 0.6;
      const span = Math.max(0.05, next.t - tp);
      const u = Math.min(1, Math.max(0, (t - tp) / span));
      const lift = Math.min(0.11, Math.max(0.035, 0.3 * span));
      const e = ease(u);
      const y = P[1] + (N[1] - P[1]) * e + CLEAR + lift * Math.pow(Math.sin(Math.PI * u), 0.6);
      put(hand, side, P[0] + (N[0] - P[0]) * e, y, P[2] + (N[2] - P[2]) * e + 0.02);
    }
  };
  requestAnimationFrame(tick);
  return 'driving';
}

/** In the page: the emulated room darkened (a grade, as footage would get) and the emulator's badges hidden, then the browser's screencast for `secs`. */
async function record({ page, frame }, { secs, dir }) {
  const fs = await import('node:fs');
  const f = frame ?? page;
  const hide = () => {
    for (const el of document.querySelectorAll('body *')) {
      const st = getComputedStyle(el);
      if ((st.position === 'fixed' || st.position === 'absolute') && el.tagName !== 'CANVAS' && el.tagName !== 'IFRAME' && !el.querySelector('canvas, iframe')) el.style.visibility = 'hidden';
    }
  };
  await page.evaluate(hide);
  if (frame) await frame.evaluate(hide);
  await f.evaluate(() => {
    for (const c of document.querySelectorAll('canvas'))
      if (getComputedStyle(c).position === 'fixed' && getComputedStyle(c).zIndex === '1') c.style.filter = 'brightness(0.42) sepia(0.35) hue-rotate(230deg) saturate(1.3)';
  });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (e) => {
    frames.push({ ts: e.metadata.timestamp, data: e.data });
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await new Promise((r) => setTimeout(r, secs * 1000));
  await cdp.send('Page.stopScreencast');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let list = '';
  frames.forEach((fr, i) => {
    const name = `${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${dir}/${name}`, Buffer.from(fr.data, 'base64'));
    const next = frames[i + 1];
    list += `file '${name}'\nduration ${next ? (next.ts - fr.ts).toFixed(4) : 0.033}\n`;
  });
  fs.writeFileSync(`${dir}/list.txt`, list);
  await f.evaluate(() => {
    window.__heroDrive = false;
    for (const c of document.querySelectorAll('canvas')) c.style.filter = '';
  });
  return { frames: frames.length, secs: frames.length ? frames[frames.length - 1].ts - frames[0].ts : 0 };
}

writeFileSync('tools/.hero-rec.mjs', `export default async ({ page, frame }) => (frame ?? page).evaluate(${drive.toString()}, ${JSON.stringify({ left, right })});\n`);
console.log(run('tools/.hero-rec.mjs'));
// (past the count-in and into the groove)
await wait(9000);
const SECS = LEN + FADE + 2.5;
writeFileSync('tools/.hero-rec.mjs', `const record = ${record.toString()};\nexport default (c) => record(c, ${JSON.stringify({ secs: SECS, dir: TMP })});\n`);
const rec = JSON.parse(execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/.hero-rec.mjs', '--timeout', String((SECS + 60) * 1000)], { encoding: 'utf8', maxBuffer: 1 << 28 })).data.result;
rmSync('tools/.hero-rec.mjs', { force: true });
console.log('recorded', rec, `(${(rec.frames / rec.secs).toFixed(1)} fps)`);
// the frames at their own times, to a steady clip, then the loop from 1 s in
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', `${TMP}/raw.mp4`]);
encode(`${TMP}/raw.mp4`, 1, Number(arg('poster', 2)));

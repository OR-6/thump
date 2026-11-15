#!/usr/bin/env node
/**
 * The website's hero loop (public/site/hero.mp4, hero.webm and hero.jpg, the poster). docs/SITE-DESIGN.md, "The hero
 * video", says what it must be.
 *
 * From real headset footage (what it's for; the recording from the Quest, any size):
 *   node tools/hero-video.mjs --from path/to/quest-clip.mp4 --in 12.5 [--len 10] [--poster 3.2]
 *
 * Placeholder from the emulator (the dev server up, `npx @iwsdk/cli dev status` ready): three takes cut together on the
 * beat, the drums with sticks, the piano, the marimba with mallets, each a song the autoplayer plays while the
 * emulator's hands play it as hands do: fists round the sticks (a fist pose made from the emulator's own), the wrist
 * cocked back as the hand lifts and flicking through the stroke, a quick rebound, a hang, an accelerating fall onto
 * the next note, a little different each time, swaying a touch while they wait; the stick tip (or the fingertip) aimed
 * at the note's own drum, key or bar. Seen from the seat, the emulated room darkened.
 *   node tools/hero-video.mjs [--len 10]
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
const { goto, placeKit, slap, measureHand, DESK_Y, wait, run, xr } = await import('./e2e-lib.mjs');
const js = (body) => {
  writeFileSync('tools/.site-js.mjs', `export default async function run({ page, frame }) { return await (frame ?? page).evaluate(async () => { const r = window.__thump.game; ${body} }); }\n`);
  const o = run('tools/.site-js.mjs');
  rmSync('tools/.site-js.mjs', { force: true });
  return o;
};

/**
 * In the page: both hands play the song's notes as they fall due. `o.inst`: what's out; `o.stick`: fists round sticks
 * (or mallets); `o.cock`: how far the wrist cocks back as the hand lifts (degrees); `o.clear`: how far short of the
 * surface the tip stops (the autoplayer's hits stay the only ones).
 */
async function drive(o) {
  const r = window.__thump.game;
  const H = window.__thump.hands;
  const dev = window.IWER_DEVICE;
  const V = r.head.constructor;
  const Q = r.kit.root.quaternion.constructor;
  const C = r.partCol.constructor;
  // a fist: the emulator's point pose with the index curled as the middle finger is (moved over to its knuckle)
  for (const side of ['left', 'right']) {
    const h = dev.hands[side];
    let st = null;
    for (const s of Object.getOwnPropertySymbols(h)) if (h[s] && h[s].poses) st = h[s];
    if (st && !st.poses.fist) {
      const point = st.poses.point.jointTransforms;
      const fist = { jointTransforms: {} };
      for (const [k, v] of Object.entries(point)) fist.jointTransforms[k] = { offsetMatrix: Float32Array.from(v.offsetMatrix), radius: v.radius };
      const im = point['index-finger-metacarpal'].offsetMatrix;
      const mm = point['middle-finger-metacarpal'].offsetMatrix;
      for (const j of ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']) {
        const m = Float32Array.from(point[`middle-finger-${j}`].offsetMatrix);
        m[12] += im[12] - mm[12];
        m[13] += im[13] - mm[13];
        m[14] += im[14] - mm[14];
        fist.jointTransforms[`index-finger-${j}`] = { offsetMatrix: m, radius: point[`middle-finger-${j}`].radius };
      }
      st.poses.fist = fist;
    }
    if (st) st.poseId = o.stick ? 'fist' : 'default';
  }
  // (the hands seen are the game's own smooth hands, see-through for filming: ?hands=ghost; the emulator's outlines stay off)
  const DEG = Math.PI / 180;
  const quat = (out, pitch, yaw, roll) => {
    // (as three.js's YXZ Euler)
    const cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2), cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cz = Math.cos(roll / 2), sz = Math.sin(roll / 2);
    out[0] = sx * cy * cz + cx * sy * sz;
    out[1] = cx * sy * cz - sx * cy * sz;
    out[2] = cx * cy * sz - sx * sy * cz;
    out[3] = cx * cy * cz + sx * sy * sz;
    return out;
  };
  const q4 = [0, 0, 0, 1];
  const setHand = (side, x, y, z, pitch, yaw, roll) => {
    const hd = dev.hands[side];
    quat(q4, pitch, yaw, roll);
    if (hd.position.set) hd.position.set(x, y, z);
    else Object.assign(hd.position, { x, y, z });
    if (hd.quaternion.set) hd.quaternion.set(q4[0], q4[1], q4[2], q4[3]);
    else Object.assign(hd.quaternion, { x: q4[0], y: q4[1], z: q4[2], w: q4[3] });
  };
  const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const IMPACT = o.stick ? -65 * DEG : -38 * DEG;
  const YAW = { left: 12 * DEG, right: -12 * DEG };
  // where the striking point is from the hand, at the angle it strikes at: measured, not guessed
  const off = {};
  for (const side of ['left', 'right']) {
    const P = [side === 'left' ? -0.3 : 0.3, 1.3, 0.1];
    setHand(side, P[0], P[1], P[2], IMPACT, YAW[side], 0);
    await frames(12);
    const i = side === 'left' ? 0 : 1;
    const tip = o.stick ? r.stickTip[i] : H[side].indexTip;
    off[side] = [tip.x - P[0], tip.y - P[1], tip.z - P[2]];
  }
  const shape = { at: new V(), q: new Q(), w: 0, d: 0, round: true };
  const col = new C();
  const where = new Map();
  const at = (lane) => {
    if (!where.has(lane)) {
      if (!r.shapeOf(lane, shape, col)) return null;
      // (the struck surface: a drum's head, a key's or a bar's top; a little toward you on a key, where a finger lands)
      where.set(lane, [shape.at.x, shape.at.y, shape.at.z + (o.inst === 'piano' ? 0.03 : 0)]);
    }
    return where.get(lane);
  };
  // a little different every time (from the note's own number: the same take twice is the same)
  const rand = (i, k) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  let assign = null;
  let notesRef = null;
  window.__heroDrive = true;
  const tick = () => {
    if (!window.__heroDrive) return;
    requestAnimationFrame(tick);
    const g = r.game;
    if (!g.judge) return;
    const notes = g.judge.notes;
    if (notes !== notesRef) {
      notesRef = notes;
      // which hand: the drums as a drummer plays them; keys and bars by which side of the instrument they're on
      assign = notes.map((n) => {
        if (o.inst === 'drums') {
          const lane = n.lane.replace('kit:', '');
          if (lane === 'hat' || lane === 'crash') return 'left';
          if (lane === 'snare') return notes.some((m) => m.lane === 'kit:hat' && Math.abs(m.t - n.t) < 0.03) ? 'right' : 'left';
          return 'right';
        }
        const p = at(n.lane);
        return p && p[0] < r.kit.root.position.x ? 'left' : 'right';
      });
    }
    const t = r.clock.t - g.clock.start - g.opts.offset;
    for (const side of ['left', 'right']) {
      let pi = -1, ni = -1;
      for (let i = 0; i < notes.length; i++) {
        if (assign[i] !== side) continue;
        if (notes[i].t <= t) pi = i;
        else if (ni < 0 || notes[i].t < notes[ni].t) ni = i;
      }
      const home = at(notes[pi >= 0 ? pi : ni >= 0 ? ni : 0]?.lane ?? '') ?? [r.kit.root.position.x + (side === 'left' ? -0.12 : 0.12), DESK_Y + 0.1, r.kit.root.position.z];
      const P = pi >= 0 ? at(notes[pi].lane) ?? home : home;
      const nextSoon = ni >= 0 && notes[ni].t - t < 1.3;
      const N = nextSoon ? at(notes[ni].lane) ?? home : P;
      const tp = pi >= 0 ? notes[pi].t : (ni >= 0 ? notes[ni].t : t) - 0.7;
      const tn = nextSoon ? notes[ni].t + (rand(ni, 1) - 0.5) * 0.016 : tp + 1.3;
      const span = Math.max(0.08, tn - tp);
      const u = Math.min(1, Math.max(0, (t - tp) / span));
      const jit = ni >= 0 ? ni : pi;
      // (a stick stroke is mostly the wrist: the hand lifts a few centimetres while the wrist turns the stick up and back)
      const lift = Math.min(o.stick ? 0.05 : 0.05, Math.max(o.stick ? 0.015 : 0.012, (o.stick ? 0.12 : 0.12) * span)) * (0.88 + 0.24 * rand(jit, 2));
      // up fast off the hit, a hang, then falling faster and faster onto the next (nothing coming: drift up and sway)
      let h;
      if (!nextSoon) h = Math.min(1, u / 0.35) * 0.7 + 0.03 * Math.sin(t * 1.9 + (side === 'left' ? 0 : 1.3));
      else if (u < 0.32) h = Math.sin((u / 0.32) * (Math.PI / 2));
      else if (u < 0.68) h = 1;
      else {
        const v = (u - 0.68) / 0.32;
        h = 1 - v * v;
      }
      const m = !nextSoon ? 0 : Math.min(1, Math.max(0, (u - 0.18) / 0.6));
      const e = m * m * (3 - 2 * m);
      const jx = (rand(jit, 3) - 0.5) * 0.006, jz = (rand(jit, 4) - 0.5) * 0.006;
      const tx = P[0] + (N[0] - P[0]) * e + jx;
      const ty = P[1] + (N[1] - P[1]) * e + o.clear + lift * h;
      const tz = P[2] + (N[2] - P[2]) * e + jz;
      // the wrist: cocked back up high, flicking through the stroke
      const pitch = IMPACT + o.cock * DEG * h;
      const f = off[side];
      setHand(side, tx - f[0], ty - f[1], tz - f[2], pitch, YAW[side] + (side === 'left' ? 1 : -1) * 4 * DEG * h, 0);
    }
  };
  requestAnimationFrame(tick);
  return { driving: o.inst, off };
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

// the takes: what's out, which song, how it's held, and where you look from (the seat, down onto it)
const TAKES = [
  { inst: 'drums', song: 'rooftop', level: 'hard', stick: true, cock: 85, clear: 0.008, look: [-0.02, 0.46, 0.66], at: [-0.02, 0.06, -0.06] },
  { inst: 'piano', song: 'fur-elise', level: 'normal', stick: false, cock: 9, clear: 0.006, look: [0, 0.38, 0.5], at: [0, 0.03, -0.04] },
  { inst: 'marimba', song: 'mango-season', level: 'normal', stick: true, cock: 70, clear: 0.006, look: [0, 0.42, 0.6], at: [0, 0.04, -0.04] },
];
const PER = LEN / TAKES.length;
const XF = 0.35;
mkdirSync(TMP, { recursive: true });
await goto('autoplay=1&hands=ghost', { clear: true });
const s0 = await placeKit();
const k = s0.debug.kitOrigin;
await slap(await measureHand(), [k[0] + 0.06, DESK_Y, k[2]]);
await wait(800);
const clips = [];
for (const [n, tk] of TAKES.entries()) {
  console.log('take', tk.inst, js(`r.game.stop?.(); r.putOut(${JSON.stringify(tk.inst)}); r.game.level = ${JSON.stringify(tk.level)}; const i = r.game.tracks.findIndex((t) => t.id === ${JSON.stringify(tk.song)}); r.game.menu = 'songs'; r.game.refreshDisplay(); r.panelAction('song:' + i); r.panelAction('play'); return r.game.tracks[i]?.name;`));
  xr('set-transform', { device: 'headset', position: { x: k[0] + tk.look[0], y: k[1] + tk.look[1], z: k[2] + tk.look[2] } });
  xr('look-at', { device: 'headset', target: { x: k[0] + tk.at[0], y: k[1] + tk.at[1], z: k[2] + tk.at[2] } });
  writeFileSync('tools/.hero-rec.mjs', `const drive = ${drive.toString()};\nexport default async ({ page, frame }) => (frame ?? page).evaluate(drive, ${JSON.stringify({ inst: tk.inst, stick: tk.stick, cock: tk.cock, clear: tk.clear })});\n`);
  console.log(JSON.stringify(run('tools/.hero-rec.mjs')));
  // (into the song: past the count-in, the notes coming)
  for (let i = 0; i < 60 && js(`return r.game.mode;`) !== 'play'; i++) await wait(300);
  await wait(5000);
  const dir = `${TMP}/take${n}`;
  const secs = PER + XF + 1.5;
  writeFileSync('tools/.hero-rec.mjs', `const record = ${record.toString()};\nexport default (c) => record(c, ${JSON.stringify({ secs, dir })});\n`);
  const rec = JSON.parse(execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/.hero-rec.mjs', '--timeout', String((secs + 60) * 1000)], { encoding: 'utf8', maxBuffer: 1 << 28 })).data.result;
  rmSync('tools/.hero-rec.mjs', { force: true });
  console.log('recorded', tk.inst, rec, `(${(rec.frames / rec.secs).toFixed(1)} fps)`);
  ff(['-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', `${TMP}/take${n}.mp4`]);
  clips.push(`${TMP}/take${n}.mp4`);
}
js(`r.game.stop?.(); return 1;`);
// the takes cut together, each crossing into the next over a third of a second; the loop's own seam is encode()'s
const ins = clips.flatMap((c) => ['-i', c]);
let fc = '';
clips.forEach((_, i) => (fc += `[${i}:v]trim=start=1:duration=${PER + XF + 0.1},setpts=PTS-STARTPTS,fps=30,format=yuv420p[c${i}];`));
let last = 'c0';
for (let i = 1; i < clips.length; i++) {
  fc += `[${last}][c${i}]xfade=transition=fade:duration=${XF}:offset=${(PER * i).toFixed(3)}[x${i}];`;
  last = `x${i}`;
}
ff([...ins, '-filter_complex', fc.replace(/;$/, ''), '-map', `[${last}]`, '-c:v', 'libx264', '-crf', '14', `${TMP}/raw.mp4`]);
encode(`${TMP}/raw.mp4`, 0, Number(arg('poster', 1.6)));

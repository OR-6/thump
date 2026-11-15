#!/usr/bin/env node
/**
 * Hear a song's band without a headset: renders it offline in the running dev page through the real engine (the
 * clips, the mix, the reverb, the limiter), scheduled as the game schedules it, to WAV and MP3, and measures it.
 *
 *   node tools/render-song.mjs cold-brew low-tide [--out artifacts/audio/after] [--seconds 60]
 *        [--player drums|piano|marimba|congas|none] [--as guitar] [--level easy|normal|hard] [--energy 0.8]
 *        [--only KICK,BASS,bed:chord] [--tag name]
 *
 * Without --player the band plays everything but what a lesson's instrument (or the piano) plays; with one, that
 * part is played too, on time. Measures: integrated loudness (BS.1770 K-weighted, gated), sample peak, RMS, crest,
 * loudness range, spectral balance by band, the kick's and the snare's punch (how far each hit rises over what's
 * just before it), and notes a bar. Needs the dev server up (npx @iwsdk/cli dev up) and ffmpeg for the MP3.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const songs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const out = opt('out', 'artifacts/audio/render');
const seconds = Number(opt('seconds', '200'));
const player = opt('player', 'none');
const level = opt('level', 'normal');
const energy = Number(opt('energy', '0.8'));
const tag = opt('tag', '');
const as = opt('as', undefined);
const only = opt('only', '') ? opt('only', '').split(',') : undefined;
mkdirSync(out, { recursive: true });

function main() {
const results = [];
for (const song of songs) {
  const name = `${song}${player !== 'none' ? `+${player}` : ''}${tag ? `-${tag}` : ''}`;
  const raw = `artifacts/.render-${name}.pcm`;
  const metaPath = `artifacts/.render-${name}.json`;
  writeFileSync('artifacts/.render.json', JSON.stringify({ song, seconds, player, level, energy, raw, meta: metaPath, only, as }));
  const res = JSON.parse(execFileSync('npx', ['@iwsdk/cli', 'browser', 'run', 'tools/render-page.mjs'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  const r = res.data?.result;
  if (!r || r.error || !existsSync(raw)) {
    console.log(`${song}: ${r?.error ?? JSON.stringify(res).slice(0, 300)}`);
    continue;
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const pcm = new Int16Array(readFileSync(raw).buffer.slice(0));
  const wav = `${out}/${name}.wav`;
  writeFileSync(wav, wavFile(pcm, meta.rate));
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', `${out}/${name}.mp3`]);
  } catch {
    /* no ffmpeg: the WAV is there */
  }
  const m = measure(pcm, meta);
  writeFileSync(`${out}/${name}.json`, JSON.stringify({ ...m, count: meta.count, song, style: meta.style, bpm: meta.bpm, inst: meta.inst }, null, 1));
  unlinkSync(raw);
  unlinkSync(metaPath);
  results.push({ name, style: meta.style, ...m });
  console.log(`${name.padEnd(26)} ${meta.style.padEnd(10)} LUFS ${m.lufs.toFixed(1)}  peak ${m.peak.toFixed(1)}  rms ${m.rms.toFixed(1)}  crest ${m.crest.toFixed(1)}  LRA ${m.lra.toFixed(1)}  kick ${m.kickPunch.toFixed(1)} dB  snare ${m.snarePunch.toFixed(1)} dB  notes/bar ${m.perBar.toFixed(1)}`);
  console.log(`${''.padEnd(26)} bands % ${Object.entries(m.bands).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}  centroid ${Math.round(m.centroid)} Hz`);
}
writeFileSync(`${out}/summary${tag ? `-${tag}` : ''}.json`, JSON.stringify(results, null, 1));
}

function wavFile(pcm, rate) {
  const h = Buffer.alloc(44);
  const bytes = pcm.length * 2;
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, bytes)]);
}

/** A biquad over a signal (RBJ coefficients, normalised). */
function biquad(x, [b0, b1, b2, a0, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
const shelf = (fs, fc, G, Q) => {
  const A = Math.pow(10, G / 40), w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), sA = Math.sqrt(A);
  return [A * (A + 1 + (A - 1) * c + 2 * sA * al), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - 2 * sA * al), A + 1 - (A - 1) * c + 2 * sA * al, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - 2 * sA * al];
};
const hp = (fs, fc, Q) => {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q);
  return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
};
const lp = (fs, fc, Q) => {
  const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q);
  return [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al];
};
const db = (p) => 10 * Math.log10(Math.max(1e-12, p));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function measure(pcm, meta) {
  const fs = meta.rate;
  const n = pcm.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n), M = new Float32Array(n);
  let peak = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    L[i] = pcm[2 * i] / 32768;
    R[i] = pcm[2 * i + 1] / 32768;
    M[i] = (L[i] + R[i]) / 2;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sq += L[i] * L[i] + R[i] * R[i];
  }
  // loudness: K-weighting, 400 ms blocks every 100 ms, gated at −70 LUFS and 10 LU under the ungated mean
  const kw = (x) => biquad(biquad(x, shelf(fs, 1681.974450955533, 3.999843853973347, 0.7071752369554196)), hp(fs, 38.13547087602444, 0.5003270373238773));
  const kL = kw(L), kR = kw(R);
  const blk = Math.floor(0.4 * fs), hop = Math.floor(0.1 * fs);
  const z = [];
  for (let a = 0; a + blk <= n; a += hop) {
    let s = 0;
    for (let i = a; i < a + blk; i++) s += kL[i] * kL[i] + kR[i] * kR[i];
    z.push(s / blk);
  }
  const lk = (p) => -0.691 + db(p);
  const abs = z.filter((p) => lk(p) > -70);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = lk(mean(abs)) - 10;
  const lufs = lk(mean(abs.filter((p) => lk(p) > rel)));
  // loudness range: short-term (3 s) loudness, 10th to 95th percentile of what's gated in
  const st = [];
  const sb = 30;
  for (let k = 0; k + sb <= z.length; k += 10) st.push(lk(mean(z.slice(k, k + sb))));
  const stg = st.filter((v) => v > -70 && v > lk(mean(abs)) - 20).sort((a, b) => a - b);
  const pc = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))] ?? 0;
  const lra = pc(stg, 0.95) - pc(stg, 0.1);
  // spectral balance: the average power spectrum (4096-point Hann frames), summed by band
  const N = 4096;
  const pow = new Float64Array(N / 2);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  let frames = 0;
  for (let a = 0; a + N <= n; a += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = M[a + i] * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const BANDS = { sub: [20, 60], bass: [60, 250], lowmid: [250, 500], mid: [500, 2000], highmid: [2000, 6000], air: [6000, 20000] };
  const e = {};
  let tot = 0, cen = 0;
  for (const [k, [lo, hi]] of Object.entries(BANDS)) {
    let s = 0;
    for (let i = Math.ceil((lo * N) / fs); i < Math.min(N / 2, (hi * N) / fs); i++) s += pow[i];
    e[k] = s;
    tot += s;
  }
  for (let i = 1; i < N / 2; i++) cen += pow[i] * ((i * fs) / N);
  let ptot = 0;
  for (let i = 1; i < N / 2; i++) ptot += pow[i];
  const bands = Object.fromEntries(Object.entries(e).map(([k, v]) => [k, (100 * v) / tot]));
  // punch: each hit's peak level (in its band, 5 ms windows, the first 40 ms) over the level just before it
  const env = (x) => {
    const w = Math.floor(0.005 * fs);
    const out = new Float32Array(Math.ceil(x.length / w));
    for (let k = 0; k < out.length; k++) {
      let s = 0;
      for (let i = k * w; i < Math.min(x.length, (k + 1) * w); i++) s += x[i] * x[i];
      out[k] = s / w;
    }
    return out;
  };
  const kickE = env(biquad(M, lp(fs, 150, 0.707)));
  const snareE = env(biquad(biquad(M, hp(fs, 1000, 0.707)), lp(fs, 5000, 0.707)));
  const punch = (E, key) => {
    const hits = meta.played.filter((p) => p[1] === key).map((p) => p[0]);
    const out = [];
    for (const t of hits) {
      const k = Math.round(t / 0.005);
      if (k < 14 || k + 8 >= E.length) continue;
      let mx = 0;
      for (let j = k; j < k + 8; j++) mx = Math.max(mx, E[j]);
      let pre = 0;
      for (let j = k - 12; j < k - 2; j++) pre += E[j];
      out.push(db(mx) - db(pre / 10));
    }
    return out.length ? out.reduce((a, b) => a + b, 0) / out.length : 0;
  };
  const notes = Object.entries(meta.count).filter(([k]) => !k.startsWith('bed:shaker')).reduce((a, [, v]) => a + v, 0);
  return {
    lufs,
    peak: 20 * Math.log10(Math.max(1e-9, peak)),
    rms: db(sq / (2 * n)),
    crest: 20 * Math.log10(Math.max(1e-9, peak)) - db(sq / (2 * n)),
    lra,
    bands,
    centroid: cen / ptot,
    kickPunch: punch(kickE, 'kit:kick'),
    snarePunch: punch(snareE, 'kit:snare'),
    perBar: notes / Math.max(1, meta.bars),
    seconds: n / fs,
  };
}

main();

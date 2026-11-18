/**
 * Onsets in audio, for tools/songfit/measure.mjs: decode with ffmpeg, a short-time spectrum (1024-sample Hann frames
 * every 128 samples at 22.05 kHz: 5.8 ms), spectral flux on a log-compressed magnitude (by band: all of it, the kick's
 * lows, the snare's mids), and peaks picked against a moving threshold. The detector's own lag (a frame's length and
 * the flux's two-frame difference) is measured on synthetic clicks at known times and taken off every onset it reports.
 */
import { execFileSync } from 'node:child_process';

export const SR = 22050;
export const N = 1024;
export const HOP = 128;
const BIN = SR / N;
/** Bands by bin: all of it; the kick's lows (35–160 Hz); the snare's body and crack (160–5000 Hz). */
export const BANDS = {
  full: [1, N / 2],
  low: [Math.round(35 / BIN), Math.round(160 / BIN)],
  mid: [Math.round(160 / BIN), Math.round(5000 / BIN)],
};

/** A file decoded to mono float samples at SR. */
export function decode(file) {
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ---------------------------------------------------------------- FFT (radix 2, N fixed)
const LOG = Math.log2(N);
const REV = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  let r = 0;
  for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b);
  REV[i] = r;
}
const COS = new Float64Array(N / 2);
const SIN = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / N);
  SIN[i] = -Math.sin((2 * Math.PI * i) / N);
}
const WIN = new Float64Array(N);
for (let i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
const re = new Float64Array(N);
const im = new Float64Array(N);
function fft() {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = N / size;
    for (let i = 0; i < N; i += size)
      for (let k = 0; k < half; k++) {
        const c = COS[k * step];
        const s = SIN[k * step];
        const a = i + k;
        const b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
  }
}

/** Magnitude spectra, frame by frame (Float32Array of frames × N/2+1). */
export function spectra(x) {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const B = N / 2 + 1;
  const mag = new Float32Array(frames * B);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < N; i++) {
      re[i] = x[o + i] * WIN[i];
      im[i] = 0;
    }
    fft();
    for (let k = 0; k < B; k++) mag[f * B + k] = Math.hypot(re[k], im[k]);
  }
  return { mag, frames, B };
}

/** Spectral flux by band, on log(1 + γ·mag) with γ set by the loudest frame (so −60 dB of it is about nothing). */
export function flux(sp, bands = Object.keys(BANDS)) {
  const { mag, frames, B } = sp;
  let peak = 1e-9;
  for (let i = 0; i < mag.length; i++) if (mag[i] > peak) peak = mag[i];
  const g = 1000 / peak;
  const LAG = 2;
  const out = {};
  for (const name of bands) {
    const [a, z] = BANDS[name];
    const f = new Float32Array(frames);
    for (let t = LAG; t < frames; t++) {
      let s = 0;
      for (let k = a; k <= z; k++) {
        const d = Math.log1p(g * mag[t * B + k]) - Math.log1p(g * mag[(t - LAG) * B + k]);
        if (d > 0) s += d;
      }
      f[t] = s / (z - a + 1);
    }
    out[name] = f;
  }
  return out;
}

/** Peaks of a flux curve: the highest for ±3 frames, above the local mean by δ of its 98th percentile; seconds. */
export function peaks(f, delta = 0.06) {
  const sorted = Float32Array.from(f).sort();
  const ref = sorted[Math.floor(sorted.length * 0.98)] || 1e-9;
  const out = [];
  const W = 3;
  for (let t = W; t < f.length - W; t++) {
    const v = f[t];
    let isMax = true;
    for (let k = t - W; k <= t + W; k++) if (f[k] > v || (f[k] === v && k < t)) {
      isMax = false;
      break;
    }
    if (!isMax) continue;
    let m = 0;
    let n = 0;
    for (let k = Math.max(0, t - 20); k <= Math.min(f.length - 1, t + 10); k++) {
      m += f[k];
      n++;
    }
    m /= n;
    if (v < m + delta * ref || v < 0.08 * ref) continue;
    // (sub-frame: a parabola through the peak and its neighbours)
    const a = f[t - 1];
    const c = f[t + 1];
    const den = a - 2 * v + c;
    const dt = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    out.push({ t: ((t + dt) * HOP + N / 2) / SR, s: v / ref });
  }
  return out;
}

/** Onsets of a signal, by band: seconds (lag taken off) and strength. */
export function onsets(x, bias, bands = Object.keys(BANDS)) {
  const fl = flux(spectra(x), bands);
  const out = {};
  for (const b of bands) out[b] = peaks(fl[b]).map((p) => ({ t: p.t - (bias?.[b] ?? 0), s: p.s }));
  return out;
}

/** A synthetic take: clicks (noise bursts, plucked tones and kick-like thumps) at known times, a bed of noise under. */
function clicks(seconds = 30, seed = 7) {
  let r = seed;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const x = new Float32Array(seconds * SR);
  for (let i = 0; i < x.length; i++) x[i] = (rnd() - 0.5) * 0.002;
  const times = [];
  for (let t = 0.5; t < seconds - 0.5; t += 0.18 + rnd() * 0.25) {
    times.push(t);
    const o = Math.round(t * SR);
    const kind = times.length % 3;
    const amp = 0.2 + rnd() * 0.6;
    const f0 = kind === 2 ? 60 + rnd() * 40 : 200 + rnd() * 1500;
    const dec = kind === 0 ? 0.01 : kind === 1 ? 0.15 : 0.12;
    for (let i = 0; i < SR * 0.3 && o + i < x.length; i++) {
      const e = Math.exp(-i / (SR * dec));
      const v = kind === 0 ? (rnd() - 0.5) * 2 : Math.sin((2 * Math.PI * f0 * i) / SR);
      x[o + i] += amp * e * v;
    }
  }
  return { x, times };
}

/** The detector's lag per band (seconds), from synthetic clicks: the median of found − true over matched clicks. */
export function measureBias() {
  const { x, times } = clicks();
  const raw = onsets(x, null);
  const bias = {};
  const report = {};
  for (const b of Object.keys(raw)) {
    const d = [];
    for (const t of times) {
      const m = nearest(raw[b], t);
      if (m && Math.abs(m.t - t) < 0.05) d.push(m.t - t);
    }
    d.sort((a, z) => a - z);
    bias[b] = d.length ? d[Math.floor(d.length / 2)] : 0;
    report[b] = { found: d.length, of: times.length, median: bias[b], spread: d.length ? d[Math.floor(d.length * 0.9)] - d[Math.floor(d.length * 0.1)] : 0 };
  }
  return { bias, report };
}

/** The onset nearest time t in a sorted list (binary search). */
export function nearest(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (list[m].t < t) lo = m;
    else hi = m;
  }
  return Math.abs(list[lo].t - t) <= Math.abs(list[hi].t - t) ? list[lo] : list[hi];
}

#!/usr/bin/env node
/**
 * How well every song's charts fit its recording, measured: for each song x instrument x level, the share of chart
 * notes with something you hear under them (all the stems at full, your own part's stem at its guide level for the
 * level: src/play/game.ts guideLevel), the share with anything in the recording at all (your stem at full), how tight
 * what's under them is, notes a second against the level's band, how many land on the tune or on the kick, snare and
 * bass, the longest stretch without a note, and pairs of notes closer than a hand can play them. Then a score out of
 * 100 per song x instrument (40 heard, 20 tight, 20 density, 20 follows the music), summed over the six instruments,
 * and each song's timing: its recording's offset from the chart's clock and drift through the song, stem by stem.
 *
 *   node tools/songfit/measure.mjs [song-id …] [--no-dump] [--out artifacts/songfit/report.json] [--compare old.json]
 *
 * The chart grid is the game's: beat b plays at (b − start)·60/bpm in the stems' time (public/songs/<id>/stems.json
 * `start`). Charts come from src/songs/score.ts through tools/songfit/dump-charts.ts (vite-node). Onsets are cached
 * by stem file size and time in artifacts/songfit/cache/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { decode, measureBias, nearest, onsets } from './onsets.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = opt('out', 'artifacts/songfit/report.json');
const COMPARE = opt('compare', '');
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--out', '--compare', '--charts'].includes(args[i - 1])));
const CHARTS = opt('charts', 'artifacts/songfit/charts.json');
const CACHE = 'artifacts/songfit/cache';
mkdirSync(CACHE, { recursive: true });
if (!args.includes('--no-dump')) execFileSync('npx', ['vite-node', 'tools/songfit/dump-charts.ts', CHARTS], { stdio: ['ignore', 'ignore', 'inherit'] });
const { songs } = JSON.parse(readFileSync(CHARTS, 'utf8'));

const INSTS = ['drums', 'piano', 'marimba', 'handpan', 'guitar', 'congas'];
const LEVELS = ['easy', 'normal', 'hard'];
/** The stem each instrument's part is (src/play/game.ts STEM_OF), and how loud it plays under you at each level. */
const STEM_OF = { drums: 'drums', congas: 'perc', piano: 'lead', marimba: 'lead', handpan: 'bass', guitar: 'guitar' };
const GUIDE = { easy: 0.35, normal: 0.2, hard: 0.1 };
/** Something "under" a note: an onset within this (s); tight: within TIGHT. */
const WIN = 0.05;
const TIGHT = 0.02;
/** Notes a second, by level, counting moments (two notes together are one move of both hands); drums and congas a
 * little busier (a beat on every beat is a beginner's groove). */
const BAND = (inst, lv) => {
  const groove = inst === 'drums' || inst === 'congas';
  return lv === 'easy' ? [0.9, groove ? 2.2 : 1.7] : lv === 'normal' ? [1.6, groove ? 3.4 : 2.9] : [2.4, groove ? 5.2 : 4.6];
};
/** The closest two notes may come (s): any two (not together), and two on one zone (one hand, again). */
const MIN_ANY = { easy: 0.2, normal: 0.14, hard: 0.09 };
const MIN_SAME = { easy: 0.3, normal: 0.2, hard: 0.12 };
/** A stretch with no note longer than this (s) is flagged. */
const LONG_GAP = 6;

const { bias, report: biasReport } = measureBias();

/** Onsets for a song: each stem alone (by band), and the mixes a player hears (one stem at a level, the rest full). */
function songOnsets(id) {
  const meta = JSON.parse(readFileSync(`public/songs/${id}/stems.json`, 'utf8'));
  const key = meta.stems.map((s) => `${s.id}:${statSync(`public/songs/${id}/${s.file}`).size}:${statSync(`public/songs/${id}/${s.file}`).mtimeMs}`).join('|') + `|${JSON.stringify(bias)}|v2`;
  const file = `${CACHE}/${id}.json`;
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    if (c.key === key) return { meta, ...c };
  }
  const x = {};
  for (const s of meta.stems) x[s.id] = decode(`public/songs/${id}/${s.file}`);
  const len = Math.max(...Object.values(x).map((a) => a.length));
  const mix = (own, lvl) => {
    const m = new Float32Array(len);
    for (const [sid, a] of Object.entries(x)) {
      const g = sid === own ? lvl : 1;
      if (g) for (let i = 0; i < a.length; i++) m[i] += g * a[i];
    }
    return m;
  };
  const alone = {};
  for (const [sid, a] of Object.entries(x)) alone[sid] = onsets(a, bias);
  const mixes = {};
  const strip = (o) => o.full.map((p) => ({ t: +p.t.toFixed(4), s: +p.s.toFixed(3) }));
  mixes['all'] = strip(onsets(mix('', 1), bias, ['full']));
  for (const sid of Object.keys(x)) for (const lv of LEVELS) mixes[`${sid}@${lv}`] = strip(onsets(mix(sid, GUIDE[lv]), bias, ['full']));
  const c = { key, alone, mixes };
  writeFileSync(file, JSON.stringify(c));
  return { meta, ...c };
}

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
};
const pct = (a, q) => {
  if (!a.length) return NaN;
  const s = [...a].sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
/** Least squares slope of y on x. */
const slope = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
};

/** A stem's timing against the grid: its onsets near a whole beat (±0.12 of a beat, ±70 ms), their offset and drift. */
function stemTiming(list, bpm, start, lag = 0) {
  const spb = 60 / bpm;
  const xs = [];
  const ys = [];
  for (const p of list) {
    if (p.s < 0.3) continue;
    const beat = (p.t - lag) / spb + start;
    const d = (beat - Math.round(beat)) * spb;
    if (Math.abs(beat - Math.round(beat)) > 0.12 || Math.abs(d) > 0.07) continue;
    xs.push(p.t);
    ys.push(d);
  }
  return { n: xs.length, offsetMs: median(ys) * 1000, p90Ms: pct(ys.map(Math.abs), 0.9) * 1000, driftMsPerMin: slope(xs, ys) * 1000 * 60 };
}

const results = [];
const timing = [];
for (const song of songs) {
  if (ids.length && !ids.includes(song.id)) continue;
  const o = songOnsets(song.id);
  const { meta } = o;
  const start = meta.start ?? 0;
  const spb = 60 / song.bpm;
  // (the recording's lag, stems.json `lag`: the stems play that much early, src/audio/stems.ts)
  const lag = meta.lag ?? 0;
  const at = (b) => (b - start) * spb + lag;
  const has = new Set(meta.stems.map((s) => s.id));
  // the timing of the recording, stem by stem
  const tStems = {};
  for (const sid of has) tStems[sid] = stemTiming(sid === 'drums' ? [...o.alone[sid].low, ...o.alone[sid].mid].sort((a, b) => a.t - b.t) : o.alone[sid].full, song.bpm, start, lag);
  const allT = stemTiming(o.mixes.all, song.bpm, start, lag);
  // the music's own events: the tune, the bass, the kick and snare (the drums' lows and mids, the strong ones)
  const music = [];
  if (has.has('lead')) music.push(...o.alone.lead.full.filter((p) => p.s >= 0.2));
  if (has.has('bass')) music.push(...o.alone.bass.full.filter((p) => p.s >= 0.2));
  if (has.has('drums')) music.push(...o.alone.drums.low.filter((p) => p.s >= 0.4), ...o.alone.drums.mid.filter((p) => p.s >= 0.4));
  music.sort((a, b) => a.t - b.t);
  const songRow = { id: song.id, name: song.name, bpm: song.bpm, insts: {}, total: 0 };
  const chartDev = [];
  for (const inst of INSTS) {
    const own = has.has(STEM_OF[inst]) ? STEM_OF[inst] : '';
    const lvRows = {};
    for (const lv of LEVELS) {
      const notes = song.charts[inst][lv];
      const heardList = own ? o.mixes[`${own}@${lv}`] : o.mixes.all;
      const recList = o.mixes.all;
      let heard = 0;
      let rec = 0;
      let tight = 0;
      let follows = 0;
      const devs = [];
      const silent = [];
      for (const [b] of notes) {
        const t = at(b);
        const h = nearest(heardList, t);
        if (h && Math.abs(h.t - t) <= WIN) {
          heard++;
          devs.push(h.t - t);
          if (Math.abs(h.t - t) <= TIGHT) tight++;
        } else silent.push(b);
        const r = nearest(recList, t);
        if (r && Math.abs(r.t - t) <= WIN) rec++;
        const m = nearest(music, t);
        if (m && Math.abs(m.t - t) <= WIN) follows++;
      }
      chartDev.push(...devs);
      const n = notes.length || 1;
      const secs = song.end * spb;
      let moments = 0;
      for (let i = 0; i < notes.length; i++) if (i === 0 || (notes[i][0] - notes[i - 1][0]) * spb > 0.03) moments++;
      const nps = moments / secs;
      // too close: any two not together under MIN_ANY, two on one zone under MIN_SAME
      let close = 0;
      const lastOn = new Map();
      let prevT = -Infinity;
      const closeAt = [];
      for (let i = 0; i < notes.length; i++) {
        const [b, k] = notes[i];
        const t = at(b);
        const dt = t - prevT;
        const ls = lastOn.get(k);
        if ((dt > 0.002 && dt < MIN_ANY[lv]) || (ls !== undefined && t - ls < MIN_SAME[lv])) {
          close++;
          if (closeAt.length < 6) closeAt.push(b);
        }
        if (dt > 0.002 || i === 0) prevT = t;
        lastOn.set(k, t);
      }
      // the longest stretch without a note (from the song's first beat to its last note)
      let gap = 0;
      let gapAt = 0;
      let pb = 0;
      for (const [b] of [...notes, [song.end]]) {
        if ((b - pb) * spb > gap) {
          gap = (b - pb) * spb;
          gapAt = pb;
        }
        pb = b;
      }
      lvRows[lv] = { n: notes.length, moments, nps, heard: heard / n, rec: rec / n, tight: heard ? tight / heard : 0, follows: follows / n, offsetMs: median(devs) * 1000, close, closeAt, gap, gapAt, silent: silent.slice(0, 8), silentN: silent.length };
    }
    // the score
    const dens = LEVELS.map((lv) => {
      const [a, z] = BAND(inst, lv);
      const v = lvRows[lv].nps;
      const off = v < a ? (a - v) / a : v > z ? (v - z) / z : 0;
      return Math.max(0, 1 - off / 0.5);
    });
    let dScore = (dens[0] + dens[1] + dens[2]) / 3;
    const [e, nn, h] = LEVELS.map((lv) => lvRows[lv].nps);
    if (nn < e * 1.15) dScore -= 0.15;
    if (h < nn * 1.1) dScore -= 0.15;
    const gapPen = LEVELS.some((lv) => lvRows[lv].gap > LONG_GAP) ? 0.1 : 0;
    const closePen = Math.min(0.3, LEVELS.reduce((a, lv) => a + lvRows[lv].close / Math.max(1, lvRows[lv].n), 0));
    const mean = (k) => LEVELS.reduce((a, lv) => a + lvRows[lv][k], 0) / 3;
    const sc = {
      heard: 40 * mean('heard'),
      tight: 20 * mean('tight'),
      density: 20 * Math.max(0, dScore - gapPen),
      follows: 20 * mean('follows') * (1 - closePen),
    };
    const total = sc.heard + sc.tight + sc.density + sc.follows;
    songRow.insts[inst] = { score: total, parts: sc, levels: lvRows, own };
    songRow.total += total;
  }
  songRow.chartOffsetMs = median(chartDev) * 1000;
  results.push(songRow);
  timing.push({ id: song.id, bpm: song.bpm, start, lagMs: lag * 1000, mix: allT, stems: tStems, chartOffsetMs: songRow.chartOffsetMs });
}

writeFileSync(OUT, JSON.stringify({ bias, biasReport, results, timing }, null, 1));

// ---------------------------------------------------------------- tables
const old = COMPARE && existsSync(COMPARE) ? JSON.parse(readFileSync(COMPARE, 'utf8')) : null;
const oldOf = (id, inst) => old?.results.find((r) => r.id === id)?.insts[inst]?.score;
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : '-');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
const p = (v) => `${Math.round(v * 100)}`;
console.log(`detector lag (ms, taken off): ${Object.entries(bias).map(([k, v]) => `${k} ${(v * 1000).toFixed(1)}`).join(', ')}`);
console.log('\nsong x instrument (score /100; heard% rec% tight% follows% notes/s E/N/H; close; longest gap s)');
for (const r of results) {
  console.log(`\n${r.id}  total ${f0(r.total)}${old ? ` (was ${f0(old.results.find((x) => x.id === r.id)?.total)})` : ''}`);
  for (const inst of INSTS) {
    const x = r.insts[inst];
    const L = x.levels;
    const was = oldOf(r.id, inst);
    console.log(
      `  ${inst.padEnd(8)} ${f0(x.score).padStart(3)}${was !== undefined && Math.round(was) !== Math.round(x.score) ? ` (was ${f0(was)})` : ''}  ` +
        LEVELS.map((lv) => `${lv[0].toUpperCase()} h${p(L[lv].heard)} r${p(L[lv].rec)} t${p(L[lv].tight)} f${p(L[lv].follows)} ${L[lv].nps.toFixed(2)}/s${L[lv].close ? ` c${L[lv].close}` : ''} g${L[lv].gap.toFixed(1)}`).join(' | '),
    );
  }
}
console.log('\ntiming (ms: median offset of on-beat onsets from the grid, + late; drift ms/min; p90 |dev|)');
for (const t of timing) {
  const st = Object.entries(t.stems).map(([k, v]) => `${k} ${f1(v.offsetMs)}/${f1(v.driftMsPerMin)}/${f0(v.p90Ms)} (${v.n})`).join('  ');
  console.log(`  ${t.id.padEnd(17)} mix ${f1(t.mix.offsetMs)}/${f1(t.mix.driftMsPerMin)}/${f0(t.mix.p90Ms)}  chart ${f1(t.chartOffsetMs)}  lag ${f0(t.lagMs)}  ${st}`);
}
console.log('\nranking');
[...results].sort((a, b) => b.total - a.total).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.id.padEnd(17)} ${f0(r.total)}`));

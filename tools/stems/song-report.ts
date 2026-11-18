/**
 * A song's shape at a glance, for writing the originals: its length, its form, the melody's range (in degrees: the
 * piano has −7..7 in a major key), its accidentals, how hard it rates, and how many notes each instrument gets at each
 * level (and a second, at Normal).
 *
 *   npx vite-node tools/stems/song-report.ts [song-id …]
 */
import { SCORES, scoreChart, type Level, type Score } from '../../src/songs/score.js';

const chart = (s: Score, inst: string, level: Level) => scoreChart(s, inst, level, 0, 1e9, s.solos, { tom: true });

const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const s of SCORES) {
  if (ids.length ? !ids.includes(s.tune.id) : !s.tune.original || s.tune.lesson) continue;
  const secs = (s.end * 60) / s.tune.bpm;
  const deg = s.melody.map((n) => n.degree);
  const acc = s.melody.filter((n) => n.acc !== 0).length;
  console.log(`${s.tune.id.padEnd(14)} ${s.tune.style.padEnd(9)} ${s.tune.bpm} bpm ${s.tune.key.padEnd(3)} ${s.bars} bars ${secs.toFixed(0)} s  ${s.difficulty} (${s.rating.toFixed(2)})  melody ${deg.length} notes, degrees ${Math.min(...deg)}..${Math.max(...deg)}, ${acc} accidentals`);
  console.log(`  form: ${(s.sections ?? []).map((x) => `${x.kind}@${x.bar}`).join(' ')}`);
  for (const inst of ['drums', 'piano', 'marimba', 'handpan', 'guitar', 'congas']) {
    const n = ['easy', 'normal', 'hard'].map((lv) => chart(s, inst, lv as Level).notes.length);
    console.log(`  ${inst.padEnd(8)} easy ${String(n[0]).padStart(4)}  normal ${String(n[1]).padStart(4)} (${(n[1] / secs).toFixed(2)}/s)  hard ${String(n[2]).padStart(4)}`);
  }
}

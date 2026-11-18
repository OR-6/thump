/**
 * A listen-check on paper for the produced originals (src/songs/originals.ts): every melody note against the chord
 * under it, flagging a held or accented note a semitone off a chord tone (a minor ninth), or a fourth held over a
 * major chord; every bass note that isn't a tone of its chord (a passing note is fine on a weak sixteenth); and the
 * rhythm part's voicing against the tune (a chord tone a semitone from the tune's note at once).
 *
 *   npx vite-node tools/stems/audit-harmony.ts [song-id …]
 */
import { scaleById, scaleMidi } from '../../src/kit/shelf.js';
import { PRODUCTIONS, prodBass } from '../../src/songs/originals.js';
import { SCORES, chordAt, melodyRoot } from '../../src/songs/score.js';

const NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const s of SCORES) {
  const p = PRODUCTIONS[s.tune.id];
  if (!p || (ids.length && !ids.includes(p.id))) continue;
  const sc = scaleById(s.scale);
  const root = melodyRoot(s.keyPc);
  const flags: string[] = [];
  const tones = (b: number) => {
    const c = chordAt(s, b);
    const r = (s.keyPc + c.semis) % 12;
    return { r, set: [0, c.minor ? 3 : 4, 7, 10, 11].map((x) => (r + x) % 12), triad: [0, c.minor ? 3 : 4, 7].map((x) => (r + x) % 12), minor: c.minor };
  };
  const where = (b: number) => `bar ${Math.floor(b / 4) + 1} beat ${((b % 4) + 1).toFixed(2)}`;
  for (const n of s.melody) {
    if (n.beat >= s.end) continue;
    const pc = (((scaleMidi(root, sc, n.degree) + n.acc) % 12) + 12) % 12;
    const t = tones(n.beat);
    const iv = (pc - t.r + 12) % 12;
    const strong = Math.abs(n.beat - Math.round(n.beat)) < 1e-6 || n.len >= 1;
    // (a semitone over a triad tone, held or on the beat: the rub a listener hears)
    const rub = t.triad.some((x) => (pc - x + 12) % 12 === 1);
    if (strong && rub && n.len >= 0.5) flags.push(`tune ${NAMES[pc]} over ${NAMES[t.r]}${t.minor ? 'm' : ''} at ${where(n.beat)} (${n.len} beats)`);
    if (!t.minor && iv === 5 && n.len >= 1.5) flags.push(`tune holds the fourth ${NAMES[pc]} over ${NAMES[t.r]} at ${where(n.beat)}`);
  }
  const spans = s.starts.flatMap((st) => s.chords.map((c) => ({ beat: st + c.beat, len: c.len, semis: c.semis, minor: c.minor })));
  for (const n of prodBass(p, spans, s.keyPc, s.end)) {
    if (n.ghost) continue;
    const t = tones(n.beat);
    const pc = n.midi % 12;
    const weak = Math.abs(n.beat * 2 - Math.round(n.beat * 2)) > 1e-6 || n.len < 0.3;
    if (!t.set.includes(pc) && !weak) flags.push(`bass ${NAMES[pc]} over ${NAMES[t.r]}${t.minor ? 'm' : ''} at ${where(n.beat)}`);
  }
  console.log(`${p.id} (${p.name}): ${flags.length} to look at`);
  for (const f of flags) console.log(`  ${f}`);
}

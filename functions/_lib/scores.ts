/**
 * The leaderboards' rules, pure (no database, no request): what a board is, what a posted score must look like, and
 * the SQL that keeps one row per player per board (their best). Used by functions/api/scores.ts on Cloudflare and by
 * tests/scores-api.test.ts.
 *
 * A board is a song on an instrument at a level ('cold-brew:drums:normal'; a day's song is 'daily-2026-11-15:…'), or a
 * band's board for a song played together ('cold-brew:band:normal': the band's score, its players' added up).
 * A player is a random id their browser keeps, shown under their band's name: no accounts, nothing personal. The
 * address a score comes from is kept only as a hash that changes every day, to stop floods (20 posts an hour).
 */

export const INSTS = ['drums', 'piano', 'marimba', 'guitar', 'handpan', 'congas'] as const;
export const LEVELS = ['easy', 'normal', 'hard'] as const;
/** The most one note can score: a Perfect (100) at ×4, doubled by the Spotlight. */
export const MAX_PER_NOTE = 800;
export const MAX_NOTES = 4000;
/** Posts allowed from one address in an hour. */
export const RATE = 20;

const BOARD = new RegExp(`^[a-z0-9-]{1,40}:(${INSTS.join('|')}|band):(${LEVELS.join('|')})$`);
const PLAYER = /^[a-z0-9]{8,32}$/;

export interface Post {
  board: string;
  name: string;
  player: string;
  score: number;
  acc: number;
  grade: string;
  fc: boolean;
  notes: number;
}

/** A board's id, or null if it isn't one. */
export function board(v: unknown): string | null {
  return typeof v === 'string' && BOARD.test(v) ? v : null;
}

/** A name to show: letters, digits, spaces, apostrophes and hyphens, 2 to 32 of them, else "A player". */
export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return /^[A-Za-z0-9' -]{2,32}$/.test(s) ? s : 'A player';
}

/** A posted score checked, or why not. */
export function checkPost(v: unknown): { ok: true; post: Post } | { ok: false; why: string } {
  if (!v || typeof v !== 'object') return { ok: false, why: 'not a score' };
  const o = v as Record<string, unknown>;
  const b = board(o.board);
  if (!b) return { ok: false, why: 'no such board' };
  if (typeof o.player !== 'string' || !PLAYER.test(o.player)) return { ok: false, why: 'no player' };
  const notes = o.notes;
  if (typeof notes !== 'number' || !Number.isInteger(notes) || notes < 1 || notes > MAX_NOTES) return { ok: false, why: 'notes' };
  const score = o.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > notes * MAX_PER_NOTE) return { ok: false, why: 'score' };
  const acc = o.acc;
  if (typeof acc !== 'number' || !Number.isFinite(acc) || acc < 0 || acc > 1) return { ok: false, why: 'accuracy' };
  const grade = o.grade;
  if (typeof grade !== 'string' || grade.length !== 1 || !'SABCD'.includes(grade)) return { ok: false, why: 'grade' };
  return { ok: true, post: { board: b, name: cleanName(o.name), player: o.player, score, acc: Math.round(acc * 1000) / 1000, grade, fc: o.fc === true, notes } };
}

/** The table, and its indexes (server/schema.sql holds the same, to create it). */
export const SCHEMA = `CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,
  name TEXT NOT NULL,
  player TEXT NOT NULL,
  score INTEGER NOT NULL,
  acc REAL NOT NULL,
  grade TEXT NOT NULL,
  fc INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  who TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS scores_board_player ON scores(board, player);
CREATE INDEX IF NOT EXISTS scores_board_score ON scores(board, score DESC);
CREATE INDEX IF NOT EXISTS scores_who ON scores(who, at);`;

/** Keep a player's best on a board: a new row, or the old one bettered (a lower score changes nothing but the name). */
export const UPSERT = `INSERT INTO scores (board, name, player, score, acc, grade, fc, at, who) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
ON CONFLICT(board, player) DO UPDATE SET
  name = excluded.name,
  score = CASE WHEN excluded.score > scores.score THEN excluded.score ELSE scores.score END,
  acc = CASE WHEN excluded.score > scores.score THEN excluded.acc ELSE scores.acc END,
  grade = CASE WHEN excluded.score > scores.score THEN excluded.grade ELSE scores.grade END,
  fc = CASE WHEN excluded.score > scores.score THEN excluded.fc ELSE scores.fc END,
  at = CASE WHEN excluded.score > scores.score THEN excluded.at ELSE scores.at END,
  who = excluded.who`;
export const TOP = `SELECT name, score, grade, fc, player FROM scores WHERE board = ?1 ORDER BY score DESC, at ASC LIMIT ?2`;
export const RANK = `SELECT COUNT(*) AS above FROM scores WHERE board = ?1 AND score > ?2`;
export const TOTAL = `SELECT COUNT(*) AS n FROM scores WHERE board = ?1`;
export const MINE = `SELECT score FROM scores WHERE board = ?1 AND player = ?2`;
export const RECENT = `SELECT COUNT(*) AS n FROM scores WHERE who = ?1 AND at > ?2`;

/** An address, hashed with the day (so it can't be followed from one day to the next), for rate limiting only. */
export async function whoOf(ip: string, day: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  let s = '';
  for (let i = 0; i < 12; i++) s += h[i].toString(16).padStart(2, '0');
  return s;
}

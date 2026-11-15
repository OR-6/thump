/**
 * The world's leaderboards, from the game's side: post a song's score to its board (the song on an instrument at a
 * level) and hear where you stand. The server is functions/api/scores.ts (Cloudflare); anywhere it isn't (the dev
 * server, a copy hosted elsewhere, offline) every call quietly comes back null and the game carries on without it.
 * You're a random id this browser keeps, shown under your band's name: no account, nothing personal.
 */
import { load, save } from '../persistence/storage.js';

const API = `${import.meta.env?.BASE_URL ?? '/'}api/scores`;
const KEY = 'player.v1';
/** How long to wait for the server before carrying on without it (ms). */
const WAIT = 6000;

export interface Standing {
  rank: number;
  total: number;
  top: { name: string; score: number; grade: string; fc: boolean; you: boolean }[];
}

/** This browser's player id (made once). */
export function playerId(): string {
  let id = load<string>(KEY, '');
  if (!/^[a-z0-9]{8,32}$/.test(id)) {
    const a = new Uint8Array(10);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => (b % 36).toString(36)).join('');
    save(KEY, id);
  }
  return id;
}

/** A song's board: 'cold-brew:drums:normal' (a day's song: 'daily-2026-11-15:…'). */
export function boardOf(song: string, inst: string, level: string, day: string): string {
  return `${song === 'daily' ? `daily-${day}` : song}:${inst}:${level}`;
}

async function call(init?: RequestInit, query = ''): Promise<unknown> {
  if (typeof fetch === 'undefined') return null;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), WAIT) : null;
  try {
    const r = await fetch(`${API}${query}`, { ...init, signal: ctl?.signal });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Post a score; where it put you (null: the server isn't there, or said no). */
export async function postScore(p: { board: string; name: string; score: number; acc: number; grade: string; fc: boolean; notes: number }): Promise<Standing | null> {
  const r = (await call({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, player: playerId() }) })) as { rank?: number; total?: number; top?: Standing['top'] } | null;
  return r && typeof r.rank === 'number' && typeof r.total === 'number' ? { rank: r.rank, total: r.total, top: Array.isArray(r.top) ? r.top : [] } : null;
}

/** A board's top ten and where you are on it (null: no server). */
export async function boardTop(board: string): Promise<(Standing & { mine: boolean }) | null> {
  const r = (await call(undefined, `?board=${encodeURIComponent(board)}&player=${playerId()}`)) as { top?: Standing['top']; total?: number; me?: { rank: number } } | null;
  if (!r || !Array.isArray(r.top) || typeof r.total !== 'number') return null;
  return { top: r.top, total: r.total, rank: r.me?.rank ?? 0, mine: !!r.me };
}

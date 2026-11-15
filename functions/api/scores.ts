/**
 * The leaderboards (Cloudflare Pages Function, its database bound as DB: D1 'thump-scores').
 *   GET  /api/scores?board=cold-brew:drums:normal&limit=10&player=abc…  → { top, total, me? }
 *   POST /api/scores  { board, name, player, score, acc, grade, fc, notes } → { rank, total, best }
 * Rules and SQL in functions/_lib/scores.ts.
 */
import { MINE, RANK, RATE, RECENT, TOP, TOTAL, UPSERT, board, checkPost, whoOf } from '../_lib/scores';

interface D1Result<T> {
  results: T[];
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface Env {
  DB: { prepare(sql: string): D1Stmt };
  /** Optional secret for the address hash (a fixed fallback otherwise). */
  SCORE_SALT?: string;
}
interface Ctx {
  request: Request;
  env: Env;
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  });

async function standing(env: Env, b: string, player: string | null) {
  const top = (await env.DB.prepare(TOP).bind(b, 10).all<{ name: string; score: number; grade: string; fc: number; player: string }>()).results;
  const total = (await env.DB.prepare(TOTAL).bind(b).first<{ n: number }>())?.n ?? 0;
  let me: { rank: number; score: number } | undefined;
  if (player) {
    const mine = await env.DB.prepare(MINE).bind(b, player).first<{ score: number }>();
    if (mine) {
      const above = (await env.DB.prepare(RANK).bind(b, mine.score).first<{ above: number }>())?.above ?? 0;
      me = { rank: above + 1, score: mine.score };
    }
  }
  // (players' ids stay on the server: a row says only whether it's yours)
  return { top: top.map((r) => ({ name: r.name, score: r.score, grade: r.grade, fc: !!r.fc, you: !!player && r.player === player })), total, me };
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const u = new URL(request.url);
  const b = board(u.searchParams.get('board'));
  if (!b) return json({ error: 'no such board' }, 400);
  const p = u.searchParams.get('player');
  return json(await standing(env, b, p && /^[a-z0-9]{8,32}$/.test(p) ? p : null));
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'not json' }, 400);
  }
  const c = checkPost(body);
  if (!c.ok) return json({ error: c.why }, 400);
  const p = c.post;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const who = await whoOf(request.headers.get('cf-connecting-ip') ?? 'unknown', day, env.SCORE_SALT ?? 'thump-scores');
  const recent = (await env.DB.prepare(RECENT).bind(who, now - 3600_000).first<{ n: number }>())?.n ?? 0;
  if (recent >= RATE) return json({ error: 'too many' }, 429);
  await env.DB.prepare(UPSERT).bind(p.board, p.name, p.player, p.score, p.acc, p.grade, p.fc ? 1 : 0, now, who).run();
  const s = await standing(env, p.board, p.player);
  return json({ rank: s.me?.rank ?? s.total, total: s.total, best: s.me?.score ?? p.score, top: s.top });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' } });
}

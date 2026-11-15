import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_PER_NOTE, SCHEMA, board, checkPost, cleanName, whoOf } from '../functions/_lib/scores';

const ok = { board: 'cold-brew:drums:normal', name: 'The Desk Band', player: 'a1b2c3d4e5f6', score: 41200, acc: 0.93, grade: 'A', fc: false, notes: 300 };

describe('the leaderboards take only real scores', () => {
  it('a board is a song on an instrument at a level', () => {
    expect(board('cold-brew:drums:normal')).toBe('cold-brew:drums:normal');
    expect(board('daily-2026-11-15:guitar:easy')).toBe('daily-2026-11-15:guitar:easy');
    expect(board('cold-brew:kazoo:normal')).toBeNull();
    expect(board('cold-brew:drums:expert')).toBeNull();
    expect(board("x'; DROP TABLE scores;--:drums:easy")).toBeNull();
  });
  it('a good score passes; its name is cleaned', () => {
    const c = checkPost({ ...ok, name: '  The   Desk Band ' });
    expect(c.ok && c.post.name).toBe('The Desk Band');
  });
  it('a name that is not a name shows as "A player"', () => {
    expect(cleanName('<script>')).toBe('A player');
    expect(cleanName('x')).toBe('A player');
    expect(cleanName(42)).toBe('A player');
  });
  it("a band's board for a song played together", () => {
    expect(board('cold-brew:band:normal')).toBe('cold-brew:band:normal');
  });
  it('more than a note can score, a broken grade or accuracy, no player: refused', () => {
    expect(checkPost({ ...ok, score: ok.notes * MAX_PER_NOTE + 1 }).ok).toBe(false);
    expect(checkPost({ ...ok, score: 1.5 }).ok).toBe(false);
    expect(checkPost({ ...ok, grade: 'Z' }).ok).toBe(false);
    expect(checkPost({ ...ok, acc: 1.2 }).ok).toBe(false);
    expect(checkPost({ ...ok, player: 'me' }).ok).toBe(false);
    expect(checkPost({ ...ok, notes: 0 }).ok).toBe(false);
    expect(checkPost(null).ok).toBe(false);
  });
  it("an address is kept only as a day's hash", async () => {
    const a = await whoOf('203.0.113.7', '2026-11-15', 's');
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toBe(await whoOf('203.0.113.7', '2026-11-16', 's'));
    expect(a).not.toContain('203');
  });
  it('the schema file matches the code', () => {
    const file = readFileSync('server/schema.sql', 'utf8').replace(/^--.*\n/gm, '').trim();
    expect(file).toBe(SCHEMA.trim());
  });
});

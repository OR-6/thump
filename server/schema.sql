-- The leaderboards' table (D1 'thump-scores'); the same as SCHEMA in functions/_lib/scores.ts.
CREATE TABLE IF NOT EXISTS scores (
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
CREATE INDEX IF NOT EXISTS scores_who ON scores(who, at);

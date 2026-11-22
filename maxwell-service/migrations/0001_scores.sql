CREATE TABLE scores (
  board TEXT NOT NULL,
  player TEXT NOT NULL,
  alias TEXT NOT NULL,
  ticks INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (board, player)
);
CREATE INDEX fastest ON scores(board,ticks,created);
CREATE TABLE reviews (
  token TEXT PRIMARY KEY,
  board TEXT NOT NULL,
  player TEXT NOT NULL,
  alias TEXT NOT NULL,
  tick INTEGER NOT NULL DEFAULT 0,
  state TEXT,
  expires INTEGER NOT NULL
);
CREATE INDEX review_expiry ON reviews(expires);

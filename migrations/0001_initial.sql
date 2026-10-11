CREATE TABLE users (
  userid INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX users_name_lower ON users (LOWER(name));

CREATE TABLE games (
  gameid INTEGER PRIMARY KEY AUTOINCREMENT,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 25000),
  userid INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE
);
CREATE INDEX games_score ON games (score DESC);
CREATE INDEX games_user_score ON games (userid, score DESC);

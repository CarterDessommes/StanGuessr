import DatabaseSync from "better-sqlite3";

const db = new DatabaseSync(process.env.DB_PATH || "./guesser.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userid INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    gameid INTEGER PRIMARY KEY AUTOINCREMENT,
    score INTEGER NOT NULL,
    userid INTEGER NOT NULL,
    FOREIGN KEY (userid) REFERENCES users(userid) ON DELETE CASCADE
  );
`);

normalizeSchema();

// Enable foreign key checking
db.exec('PRAGMA foreign_keys = ON;');

function normalizeSchema() {
  const userColumns = db.prepare(`PRAGMA table_info(users)`).all();
  const hasPasswordHashColumn = userColumns.some(
    (column) => column.name === "password_hash",
  );
  const gamesTableSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get("games")?.sql;
  const gamesReferencesLegacyUsers = gamesTableSql?.includes("users_legacy");

  if (!hasPasswordHashColumn && !gamesReferencesLegacyUsers) {
    return;
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;

    BEGIN TRANSACTION;

    ALTER TABLE games RENAME TO games_legacy;
  `);

  if (hasPasswordHashColumn) {
    db.exec(`
      ALTER TABLE users RENAME TO users_legacy;

      CREATE TABLE users (
        userid INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      INSERT INTO users (userid, name)
      SELECT userid, name
      FROM users_legacy;
    `);
  }

  db.exec(`
    CREATE TABLE games (
      gameid INTEGER PRIMARY KEY AUTOINCREMENT,
      score INTEGER NOT NULL,
      userid INTEGER NOT NULL,
      FOREIGN KEY (userid) REFERENCES users(userid) ON DELETE CASCADE
    );

    INSERT INTO games (gameid, score, userid)
    SELECT gameid, score, userid
    FROM games_legacy;

    DROP TABLE games_legacy;
  `);

  if (hasPasswordHashColumn) {
    db.exec(`DROP TABLE users_legacy;`);
  }

  db.exec(`
    COMMIT;

    PRAGMA foreign_keys = ON;
  `);
}

// Adds new user, returns their userid and name
export function addUser(useName) {
    const result = db.prepare(`INSERT INTO users (name) VALUES (?)`).run(useName);
    return { userid: result.lastInsertRowid, name: useName };
}

// Adds new game, returns gameid, score, and userid
export function addGameScore(finalScore, user) {
    const result = db.prepare(`INSERT INTO games (score, userid) VALUES (?, ?)`).run(finalScore, user);
    return { gameid: result.lastInsertRowid, score: finalScore, userid: user}
}

// Creates a new user to add  to user table
export function createUser(name) {
  const existing = getUserByName(name);
  if (existing) return null;

  const result = db.prepare(`INSERT INTO users (name) VALUES (?)`).run(name);
  return { userid: result.lastInsertRowid, name };
}

// Deletes user account and their games
export function deleteUser(userid) {
    db.prepare(`DELETE FROM games WHERE userid = ?;`).run(userid);
    return db.prepare(`DELETE FROM users WHERE userid = ?`).run(userid);
}

// Returns limit number of top global scores
export function getGlobalTopScores(limit) {
    return db.prepare(`
        SELECT users.name, games.score FROM games
            INNER JOIN users ON games.userid = users.userid
            ORDER BY games.score DESC
            LIMIT ?;
        `).all(limit);
}

// Returns a score's all-time rank using competition-style ordering.
export function getScoreRank(score) {
    const result = db.prepare(`
        SELECT COUNT(*) + 1 AS rank FROM games
            WHERE score > ?;
        `).get(score);
    return result.rank;
}

// Returns the user's name
export function getUserByName(name) {
  return db
    .prepare(`SELECT userid, name FROM users WHERE LOWER(name) = LOWER(?)`)
    .get(name);
}

export function verifyUserCredentials(name) {
  const user = getUserByName(name);

  if (!user) {
    return null;
  }

  return { userid: user.userid, name: user.name };
}

// Returns limit number of top user scores
export function getUserTopScores(userid, limit) {
    return db.prepare(`
        SELECT score FROM games
            WHERE userid = ?
            ORDER BY score DESC
            LIMIT ?;
        `).all(userid, limit);
}

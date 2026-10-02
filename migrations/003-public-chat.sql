BEGIN;
CREATE TABLE chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  authorId TEXT NOT NULL REFERENCES users(id),
  clientId TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  createdAt TEXT NOT NULL,
  UNIQUE(authorId,clientId)
);
CREATE INDEX chat_author_time ON chat_messages(authorId,createdAt);
PRAGMA user_version=3;
COMMIT;

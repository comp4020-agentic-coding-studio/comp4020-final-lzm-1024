BEGIN;
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  posterId TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  authorId TEXT NOT NULL REFERENCES users(id),
  file TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE saved_posters (
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posterId TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY(userId,posterId)
);
CREATE INDEX upload_poster ON uploads(posterId);
PRAGMA user_version=2;
COMMIT;

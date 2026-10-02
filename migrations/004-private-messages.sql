BEGIN;
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX users_username ON users(username COLLATE NOCASE);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user1 TEXT NOT NULL REFERENCES users(id),
  user2 TEXT NOT NULL REFERENCES users(id),
  createdBy TEXT NOT NULL REFERENCES users(id),
  read1 INTEGER NOT NULL DEFAULT 0,
  read2 INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(user1,user2),
  CHECK(user1 < user2)
);
CREATE INDEX conversations_user1 ON conversations(user1,updatedAt);
CREATE INDEX conversations_user2 ON conversations(user2,updatedAt);
CREATE TABLE private_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversationId TEXT NOT NULL REFERENCES conversations(id),
  authorId TEXT NOT NULL REFERENCES users(id),
  clientId TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  createdAt TEXT NOT NULL,
  UNIQUE(authorId,clientId)
);
CREATE INDEX private_messages_conversation ON private_messages(conversationId,seq);
CREATE INDEX private_messages_author_time ON private_messages(authorId,createdAt);
PRAGMA user_version=4;
COMMIT;

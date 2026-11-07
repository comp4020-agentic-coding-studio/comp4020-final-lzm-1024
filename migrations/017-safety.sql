BEGIN;
-- Additive: comment retries can be recognised, and students can block each other.
ALTER TABLE comments ADD COLUMN clientId TEXT;
CREATE UNIQUE INDEX comment_client ON comments(authorId,clientId) WHERE clientId IS NOT NULL;
CREATE INDEX comment_author_time ON comments(authorId,createdAt);
CREATE TABLE user_blocks (
  blockerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blockedId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY(blockerId,blockedId),
  CHECK(blockerId<>blockedId)
);
CREATE INDEX user_blocks_blocked ON user_blocks(blockedId);
PRAGMA user_version=17;
COMMIT;

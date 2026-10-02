BEGIN;
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN headline TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN interests TEXT NOT NULL DEFAULT '';
CREATE TABLE profile_notes (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 profileId TEXT NOT NULL REFERENCES users(id),
 authorId TEXT NOT NULL REFERENCES users(id),
 clientId TEXT NOT NULL,
 body TEXT NOT NULL,
 createdAt TEXT NOT NULL,
 removedAt TEXT,
 UNIQUE(authorId,clientId)
);
CREATE INDEX profile_notes_page ON profile_notes(profileId,seq DESC);
CREATE INDEX profile_notes_rate ON profile_notes(authorId,createdAt);
PRAGMA user_version=10;
COMMIT;

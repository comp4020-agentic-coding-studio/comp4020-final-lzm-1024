BEGIN;
CREATE TABLE watch_rooms (
 id TEXT PRIMARY KEY, universityId TEXT NOT NULL REFERENCES universities(id), hostId TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, media TEXT NOT NULL, position REAL NOT NULL DEFAULT 0, playing INTEGER NOT NULL DEFAULT 0,
 anchorAt INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
 createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX watch_rooms_campus ON watch_rooms(universityId,closed,updatedAt);
CREATE TABLE watch_requests (
 userId TEXT NOT NULL REFERENCES users(id), clientId TEXT NOT NULL, roomId TEXT NOT NULL REFERENCES watch_rooms(id),
 operation TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(userId,clientId)
);
CREATE INDEX watch_requests_rate ON watch_requests(userId,createdAt);
CREATE TABLE watch_messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, roomId TEXT NOT NULL REFERENCES watch_rooms(id),
 authorId TEXT NOT NULL REFERENCES users(id), clientId TEXT NOT NULL, body TEXT NOT NULL,
 danmaku INTEGER NOT NULL DEFAULT 1, position REAL NOT NULL, createdAt TEXT NOT NULL, UNIQUE(authorId,clientId)
);
CREATE INDEX watch_messages_room ON watch_messages(roomId,seq DESC);
CREATE INDEX watch_messages_rate ON watch_messages(authorId,createdAt);
PRAGMA user_version=11;
COMMIT;

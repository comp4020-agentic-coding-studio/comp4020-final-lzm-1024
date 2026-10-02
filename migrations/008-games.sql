BEGIN;
CREATE TABLE game_rooms (
 id TEXT PRIMARY KEY, universityId TEXT NOT NULL REFERENCES universities(id), game TEXT NOT NULL,
 hostId TEXT NOT NULL REFERENCES users(id), guestId TEXT REFERENCES users(id), inviteeId TEXT REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('waiting','playing','finished','cancelled')) DEFAULT 'waiting',
 state TEXT NOT NULL, ready1 INTEGER NOT NULL DEFAULT 0, ready2 INTEGER NOT NULL DEFAULT 0,
 rematch1 INTEGER NOT NULL DEFAULT 0, rematch2 INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0, matchNumber INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX game_rooms_campus ON game_rooms(universityId,status,updatedAt);
CREATE TABLE game_requests (
 userId TEXT NOT NULL REFERENCES users(id), clientId TEXT NOT NULL, roomId TEXT NOT NULL REFERENCES game_rooms(id),
 operation TEXT NOT NULL, payload TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(userId,clientId)
);
CREATE INDEX game_requests_rate ON game_requests(userId,createdAt);
PRAGMA user_version=8;
COMMIT;

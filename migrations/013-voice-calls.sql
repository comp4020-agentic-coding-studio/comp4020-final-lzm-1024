BEGIN;
CREATE TABLE voice_calls (
 id TEXT PRIMARY KEY,
 conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 callerId TEXT NOT NULL REFERENCES users(id),
 calleeId TEXT NOT NULL REFERENCES users(id),
 clientId TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ringing','connecting','active','ended')),
 reason TEXT,
 createdAt TEXT NOT NULL,
 answeredAt TEXT,
 connectedAt TEXT,
 endedAt TEXT,
 UNIQUE(callerId,clientId)
);
CREATE INDEX voice_calls_conversation ON voice_calls(conversationId,createdAt DESC);
PRAGMA user_version=13;
COMMIT;

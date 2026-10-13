BEGIN;
ALTER TABLE voice_calls ADD COLUMN mode TEXT NOT NULL DEFAULT 'audio' CHECK(mode IN ('audio','video'));
PRAGMA user_version=15;
COMMIT;

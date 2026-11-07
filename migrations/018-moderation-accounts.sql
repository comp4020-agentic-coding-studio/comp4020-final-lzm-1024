BEGIN;
-- Additive: students can report posters and comments for review by configured moderators,
-- a moderator can take a poster off the wall without deleting the creator's work, and
-- accounts can hold a one-time recovery code for signing back in without email.
ALTER TABLE posters ADD COLUMN removedAt TEXT;
ALTER TABLE posters ADD COLUMN removedReason TEXT;
ALTER TABLE users ADD COLUMN recoveryHash TEXT;
ALTER TABLE users ADD COLUMN recoveryExpires INTEGER;
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporterId TEXT NOT NULL REFERENCES users(id),
  universityId TEXT NOT NULL REFERENCES universities(id),
  targetType TEXT NOT NULL CHECK(targetType IN ('poster','comment')),
  targetId TEXT NOT NULL,
  posterId TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','inappropriate','misleading','other')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','removed','dismissed','gone')),
  createdAt TEXT NOT NULL,
  resolvedAt TEXT,
  resolvedBy TEXT
);
CREATE UNIQUE INDEX report_once ON reports(reporterId,targetType,targetId) WHERE status='open';
CREATE INDEX report_queue ON reports(universityId,status,createdAt);
PRAGMA user_version=18;
COMMIT;

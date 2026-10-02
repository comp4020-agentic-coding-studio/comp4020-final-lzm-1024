BEGIN;
ALTER TABLE users ADD COLUMN universityId TEXT REFERENCES universities(id);
CREATE INDEX users_university ON users(universityId);
-- Existing accounts choose their university once; browsing history is not proof of affiliation.
CREATE TRIGGER users_fixed_university BEFORE UPDATE OF universityId ON users
WHEN OLD.universityId IS NOT NULL AND NEW.universityId IS NOT OLD.universityId
BEGIN
  SELECT RAISE(ABORT,'An account university cannot be changed');
END;
PRAGMA user_version=5;
COMMIT;

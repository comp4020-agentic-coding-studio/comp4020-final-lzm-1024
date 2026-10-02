BEGIN;
-- Earlier shared messages have no verified campus scope; retain them without assigning a school.
ALTER TABLE chat_messages ADD COLUMN universityId TEXT REFERENCES universities(id);
CREATE INDEX chat_campus_seq ON chat_messages(universityId,seq);
PRAGMA user_version=6;
COMMIT;

BEGIN;
-- Old poster links that must keep working after a poster's link changes.
CREATE TABLE poster_slug_aliases (
  slug TEXT PRIMARY KEY,
  posterId TEXT NOT NULL REFERENCES posters(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL
);
CREATE INDEX poster_slug_alias_poster ON poster_slug_aliases(posterId);
-- The built-in test notices that were upgraded in place kept their old sample's
-- link (for example /photography-walk-anu showing "Afterglow"). Give each one the
-- link of its current design and keep the old link as an alias. Student posters,
-- dates and content are untouched.
INSERT INTO poster_slug_aliases (slug,posterId,createdAt)
  SELECT p.slug,p.id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM posters p
  WHERE p.ownerId='campus-team' AND json_extract(p.publicData,'$.isTest')=1
    AND json_extract(p.publicData,'$.photoPoster.seedKey') IS NOT NULL
    AND p.slug<>json_extract(p.publicData,'$.photoPoster.seedKey')
    AND NOT EXISTS (SELECT 1 FROM posters q WHERE q.slug=json_extract(p.publicData,'$.photoPoster.seedKey'));
UPDATE posters SET slug=json_extract(publicData,'$.photoPoster.seedKey')
  WHERE id IN (SELECT posterId FROM poster_slug_aliases);
PRAGMA user_version=19;
COMMIT;

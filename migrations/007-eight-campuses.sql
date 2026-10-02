BEGIN;
-- Add campuses without replacing accounts, existing school bindings or poster records.
INSERT OR IGNORE INTO universities (id,slug,name,shortName) VALUES
('monash','monash','Monash University','Monash'),
('uq','uq','The University of Queensland','UQ'),
('uwa','uwa','The University of Western Australia','UWA'),
('adelaide','adelaide','Adelaide University','Adelaide');
PRAGMA user_version=7;
COMMIT;

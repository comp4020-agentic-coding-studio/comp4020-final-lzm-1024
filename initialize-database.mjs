import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {universities} from './campus.mjs';
import {generatedUsername} from './messaging.mjs';
import {seedPhotoGallery} from './photo-gallery.mjs';

// Keep legacy imports and additive upgrades isolated from request handling.
// Only the photo gallery seeds fresh installs; existing poster IDs stay intact.
export function initializeDatabase(db,dataDir,queries,now){
  const {get,all,run}=queries;
  function slugify(v) { return v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70) || 'event'; }
  // Additive schema migration, never reset an existing database or volume.
  if (get('PRAGMA user_version').user_version < 1) {
    db.exec(readFileSync(new URL('./migrations/001-campuswall.sql', import.meta.url), 'utf8'));
    for (const [slug,name,shortName] of universities) run('INSERT INTO universities VALUES (?,?,?,?)',slug,slug,name,shortName);
    run('INSERT INTO users VALUES (?,?,?,?,?)','campus-team','CampusWall team','seed@campuswall.invalid','!disabled',now());
    const oldPath=join(dataDir,'poster-studio.json');
  
    try {
      if (existsSync(oldPath)) for (const p of JSON.parse(readFileSync(oldPath,'utf8')).posters || []) {
        run('INSERT INTO legacy_archive VALUES (?,?)',p.id,JSON.stringify(p));
        // Legacy anonymous drafts remain archived; assigning their owner by display name is unsafe.
        if (!p.published) continue;
        const uni=universities.find(u=>u[2]===p.school)?.[0] || 'anu';
        const content={title:p.title || 'Campus event',subtitle:'From the original campus wall',date:p.date||'',time:p.time||'',location:p.location||'',description:(p.publishedElements||p.elements||[]).filter(e=>e.type==='text').map(e=>e.text).join('\n'),category:'Other',template:'minimal',style:'sunshine',alignment:'left',heroImageUrl:''};
        run('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)',p.id,'campus-team',uni,`${slugify(content.title)}-${p.id.slice(0,8)}`,'PUBLISHED',JSON.stringify(content),JSON.stringify(content),0,p.createdAt||now(),now(),p.publishedAt||now());
        for (const c of p.comments||[]) {
          const authorId=`legacy-${c.id}`;
          run('INSERT OR IGNORE INTO users VALUES (?,?,?,?,?)',authorId,c.author||'Student',`${authorId}@campuswall.invalid`,'!disabled',c.createdAt||now());
          run('INSERT INTO comments VALUES (?,?,?,?,?,?)',c.id,p.id,authorId,c.body,c.createdAt||now(),c.createdAt||now());
        }
      }
      db.exec('PRAGMA user_version=1; COMMIT;');
    } catch(error) { db.exec('ROLLBACK');throw error; }
  }
  const migrations=['002-discovery','003-public-chat','004-private-messages','005-account-campus','006-campus-chat','007-eight-campuses','008-games','009-avatars','010-profiles','011-watch','012-community','013-voice-calls'];
  const version=get('PRAGMA user_version').user_version;
  for(const [index,name] of migrations.entries()){
    if(version<index+2)db.exec(readFileSync(new URL(`./migrations/${name}.sql`,import.meta.url),'utf8'));
  }
  seedPhotoGallery(db);
  for(const account of all("SELECT id,name FROM users WHERE username IS NULL AND passwordHash<>'!disabled'"))run('UPDATE users SET username=? WHERE id=?',generatedUsername(account.name,account.id,get),account.id);
}

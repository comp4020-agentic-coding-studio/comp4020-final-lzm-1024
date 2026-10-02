import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {gallery,seedPhotoGallery,testNotice} from '../photo-gallery.mjs';
import {universities} from '../campus.mjs';
import {calendarEvent} from '../calendar.mjs';
import {photoPoster} from '../public/photo-posters.js';

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('migrations/001-campuswall.sql','utf8'));
  for(const [slug,name,short] of universities)db.prepare('INSERT INTO universities VALUES (?,?,?,?)').run(slug,slug,name,short);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('campus-team','CampusWall team','seed@campuswall.invalid','!disabled','2026-10-01');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('student','Original student','original@example.com','password-preserved','2026-10-01');
  db.exec('PRAGMA user_version=1; COMMIT');
  for(const file of ['002-discovery','003-public-chat','004-private-messages','005-account-campus','006-campus-chat','007-eight-campuses','008-games'])db.exec(readFileSync(`migrations/${file}.sql`,'utf8'));
  return db;
}
const date=new Date('2026-10-02T01:00:00Z');
test('24 distinct licensed photographic designs have official venue references for all eight campuses',()=>{
  assert.equal(gallery.events.length,24);assert.equal(new Set(gallery.events.map(e=>e.key)).size,24);assert.equal(new Set(gallery.events.map(e=>e.photo.id)).size,24);
  assert.equal(new Set(gallery.events.map(e=>e.layout)).size,8);
  for(const e of gallery.events){assert.match(e.photo.source,/^https:\/\/www\.pexels\.com\/photo\//);assert.ok(e.photo.credit&&e.photo.alt);for(const [slug] of universities){const venue=gallery.venues[slug][e.venue];assert.ok(venue.name&&venue.campus);assert.match(venue.source,/^https:\/\//);}}
});
test('all 24 locally hosted images decode as high resolution WebP photographs',async()=>{
  for(const event of gallery.events){const bytes=readFileSync(`public/demo-photos/${event.key}.webp`),metadata=await sharp(bytes).metadata();assert.equal(metadata.format,'webp');assert.ok(Math.max(metadata.width,metadata.height)>=1000);assert.ok(bytes.length>10000&&bytes.length<1500000);}
});
test('seed upgrades only exact built-in samples and preserves references, real users and other posters',()=>{
  const db=fixture();
  const original={title:'Photography walk',description:'A sample campus notice to help you explore CampusWall. Bring a friend, meet fellow students, and make something of your week. Create an account to share your own event.',heroImageUrl:''};
  const insert=(id,owner,data)=>db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,'anu',id,'PUBLISHED',JSON.stringify(data),JSON.stringify(data),2,'2026-10-01','2026-10-01','2026-10-01');
  insert('original-sample','campus-team',original);insert('real-notice','student',{title:'Original real notice',description:'Keep this exact text',date:'2026-10-15'});insert('legacy-notice','campus-team',{...original,description:'Different legacy content'});
  db.prepare('INSERT INTO comments VALUES (?,?,?,?,?,?)').run('saved-comment','original-sample','student','Keep my comment','2026-10-01','2026-10-01');db.prepare('INSERT INTO saved_posters VALUES (?,?,?)').run('student','original-sample','2026-10-01');
  const real=db.prepare('SELECT * FROM posters WHERE id=?').get('real-notice'),legacy=db.prepare('SELECT * FROM posters WHERE id=?').get('legacy-notice'),user=db.prepare('SELECT * FROM users WHERE id=?').get('student');
  seedPhotoGallery(db,date);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM posters WHERE json_extract(publicData,'$.isTest')=1").get().n,192);
  assert.equal(JSON.parse(db.prepare('SELECT publicData FROM posters WHERE id=?').get('original-sample').publicData).title,'Afterglow');
  assert.equal(db.prepare('SELECT body FROM comments WHERE id=?').get('saved-comment').body,'Keep my comment');assert.equal(db.prepare('SELECT posterId FROM saved_posters').get().posterId,'original-sample');
  assert.deepEqual(db.prepare('SELECT * FROM posters WHERE id=?').get('real-notice'),real);assert.deepEqual(db.prepare('SELECT * FROM posters WHERE id=?').get('legacy-notice'),legacy);assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get('student'),user);db.close();
});
test('restart is idempotent, leaves all dates fixed and preserves a published edit',()=>{
  const db=fixture();seedPhotoGallery(db,date);
  const first=db.prepare('SELECT id,publicData FROM posters LIMIT 1').get(),edited=JSON.parse(first.publicData);edited.title='Preserve corrected test copy';
  db.prepare('UPDATE posters SET publicData=?,content=? WHERE id=?').run(JSON.stringify(edited),JSON.stringify(edited),first.id);
  const before=db.prepare('SELECT * FROM posters ORDER BY id').all();
  seedPhotoGallery(db,new Date('2027-04-05T01:00:00Z'));assert.deepEqual(db.prepare('SELECT * FROM posters ORDER BY id').all(),before);
  for(const [campus] of universities){const posters=db.prepare('SELECT publicData FROM posters WHERE universityId=?').all(campus).map(p=>JSON.parse(p.publicData));assert.equal(posters.length,24);assert.ok(posters.every(p=>p.date>='2026-10-03'&&p.isTest&&p.description.includes('no venue is booked')));}
  db.close();
});
test('calendar exports clearly identify tests and retain ordinary event titles',()=>{
  const p={id:'test',title:'Afterglow',universityId:'anu',date:'2026-10-03',time:'19:00',description:'Fictional. No venue is booked.',location:'Manning Clark Hall',publishedAt:date.toISOString()};
  const testCalendar=calendarEvent({...p,isTest:true},'https://example.com/test');assert.match(testCalendar,/SUMMARY:\[TEST\] Afterglow/);assert.match(testCalendar,/STATUS:TENTATIVE/);assert.match(testCalendar,/TRANSP:TRANSPARENT/);
  const normal=calendarEvent(p,'https://example.com/real');assert.match(normal,/SUMMARY:Afterglow/);assert.ok(!normal.includes('STATUS:TENTATIVE'));
});
test('poster graphics retain the visible English test label and escape photo metadata',()=>{
  const html=photoPoster({title:'<script>alert(1)</script>',location:'Real venue',isTest:true,heroImageUrl:'/demo-photos/afterglow.webp',photoPoster:{layout:'bad-class',palette:{bg:'red;position:fixed'},photoAlt:'" onerror="alert(1)',series:'<svg/onload=alert(1)>',number:'01'}},{shortName:'ANU'},()=> '3 Oct');
  assert.match(html,/TEST EVENT/);assert.doesNotMatch(html,/\p{Script=Han}/u);assert.match(html,/photo-editorial/);assert.match(html,/--photo-bg:#172a32/);assert.ok(!html.includes('<script>')&&!html.includes('<svg/'));assert.ok(html.includes('&quot; onerror=&quot;'));
});
test('existing built-in disclosures become English once without changing dates, edits or student content',()=>{
  const db=fixture();seedPhotoGallery(db,date);
  const row=db.prepare("SELECT * FROM posters WHERE universityId='anu' LIMIT 1").get();
  const published=JSON.parse(row.publicData),draft=JSON.parse(row.content);
  const previous=testNotice.replace('TEST EVENT —','TEST EVENT / \u6d4b\u8bd5\u6d3b\u52a8 —');
  published.description=published.description.replace(testNotice,previous);
  draft.description=published.description;draft.title='Preserve an unpublished correction';
  db.prepare('UPDATE posters SET content=?,publicData=? WHERE id=?').run(JSON.stringify(draft),JSON.stringify(published),row.id);
  db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('student-photo','student','anu','student-photo','PUBLISHED',JSON.stringify(draft),JSON.stringify(published),4,'2026-10-01','2026-10-01','2026-10-01');
  const student=db.prepare('SELECT * FROM posters WHERE id=?').get('student-photo');
  seedPhotoGallery(db,new Date('2026-10-03T01:00:00Z'));
  const upgraded=db.prepare('SELECT * FROM posters WHERE id=?').get(row.id),newPublished=JSON.parse(upgraded.publicData),newDraft=JSON.parse(upgraded.content);
  assert.equal(newPublished.description,testNotice+published.description.slice(previous.length));
  assert.deepEqual({...newPublished,description:published.description},published);
  assert.deepEqual({...newDraft,description:draft.description},draft);
  for(const key of ['id','slug','createdAt','publishedAt','status','ownerId','universityId'])assert.equal(upgraded[key],row[key]);
  assert.equal(upgraded.version,row.version+1);assert.doesNotMatch(newPublished.description,/\p{Script=Han}/u);
  assert.deepEqual(db.prepare('SELECT * FROM posters WHERE id=?').get('student-photo'),student);
  const snapshot=db.prepare('SELECT * FROM posters ORDER BY id').all();
  seedPhotoGallery(db,new Date('2026-11-01T01:00:00Z'));assert.deepEqual(db.prepare('SELECT * FROM posters ORDER BY id').all(),snapshot);db.close();
});

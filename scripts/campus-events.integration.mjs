import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {seedCampusEvents,importers} from '../campus-events.mjs';

// Imported ANU calendar listings appear on the ANU wall as labelled listings with
// their official link, under a source account that cannot sign in or be messaged.
// Re-seeding is idempotent, follows the snapshot, and never touches student posters
// or listings a moderator removed.
const snapshot=JSON.parse(readFileSync('data/anu-events.json','utf8'));
test('ANU calendar listings are seeded, labelled and kept in step with the snapshot',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'campus-events-')),port=18167,base=`http://127.0.0.1:${port}`;let child,db;
  const req=async(path,method='GET',body,cookie)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};};
  const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}};
  try{
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_BACKUPS:'off'},stdio:'pipe'});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
    const wall=(await req('/api/posters?university=anu')).data,listed=wall.filter(p=>p.imported);
    await t.test('every snapshot event is on the ANU wall with its source',()=>{
      assert.equal(listed.length,snapshot.events.length);
      for(const p of listed){
        const e=snapshot.events.find(x=>x.url===p.eventUrl);assert.ok(e,p.title);
        assert.equal(p.title,e.title);assert.equal(p.date,e.date);assert.equal(p.imported.url,e.url);assert.equal(p.imported.retrievedAt,snapshot.retrievedAt);
        assert.equal(p.ownerId,importers.anu.id);assert.equal(p.canMessageOwner,false,'nobody can message the source account');
        assert.ok(!p.heroImageUrl,'no image is copied from the source');assert.ok(!p.isTest);
      }
    });
    await t.test('imported listings stay on their own campus',async()=>{
      const other=(await req('/api/posters?university=usyd'));if(other.status===200)assert.ok(!other.data.some(p=>p.imported));
    });
    await t.test('the source account cannot sign in',async()=>{
      assert.notEqual((await req('/api/auth/login','POST',{email:importers.anu.email,password:'!disabled'})).status,200);
    });
    let student;
    await t.test('a student starts their own poster',async()=>{
      const r=await req('/api/auth/register','POST',{name:'Event Tester',username:'event_tester',email:'events.tester@example.test',password:'disposable-test-password',universityId:'anu'});assert.ok([200,201].includes(r.status));
      const created=await req('/api/drafts','POST',{universityId:'anu',preset:'minimal'},r.cookie);assert.ok([200,201].includes(created.status));student=created.data.id;
    });
    await stop();child=null;

    db=new DatabaseSync(join(dir,'campuswall.sqlite'));const row=id=>db.prepare('SELECT status,version,removedAt FROM posters WHERE id=?').get(id);
    const studentBefore=row(student);
    await t.test('re-seeding the same snapshot changes nothing',()=>{
      const before=db.prepare('SELECT id,version FROM posters ORDER BY id').all();seedCampusEvents(db);
      assert.deepEqual(db.prepare('SELECT id,version FROM posters ORDER BY id').all(),before);
    });
    const [dropped,removed,kept]=listed;
    await t.test('a refreshed snapshot withdraws dropped events and skips removed ones',()=>{
      db.prepare("UPDATE posters SET status='DRAFT',publicData=NULL,removedAt=?,removedReason='moderator' WHERE id=?").run(new Date().toISOString(),removed.id);
      const next={...snapshot,window:{...snapshot.window,from:'2000-01-01'},events:snapshot.events.filter(e=>e.url!==dropped.eventUrl).map(e=>e.url===kept.eventUrl?{...e,title:'Updated title'}:e)};
      const snapDir=join(dir,'snapshot');mkdirSync(snapDir);writeFileSync(join(snapDir,'anu-events.json'),JSON.stringify(next));
      seedCampusEvents(db,{dataDir:pathToFileURL(snapDir+'/')});
      assert.equal(row(dropped.id).status,'DRAFT','an event that left the calendar is withdrawn');
      assert.equal(row(removed.id).status,'DRAFT','a moderator-removed listing stays removed');
      const updated=db.prepare('SELECT publicData FROM posters WHERE id=?').get(kept.id);assert.equal(JSON.parse(updated.publicData).title,'Updated title');
      assert.deepEqual(row(student),studentBefore,'the student poster is untouched');
    });

  }finally{db?.close?.();await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

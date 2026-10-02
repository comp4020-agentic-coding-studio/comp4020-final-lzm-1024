import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createQueries} from '../database.mjs';
import {createPosterStore} from '../poster-store.mjs';
import {createCommunity} from '../community.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';

test('bounded statement reuse always reads current values and revoked access',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE access(user TEXT PRIMARY KEY, allowed INTEGER);');
    const queries=createQueries(db,{capacity:2});
    queries.run('INSERT INTO access VALUES (?,?)','alice',1);
    assert.equal(queries.get('SELECT allowed FROM access WHERE user=?','alice').allowed,1);
    assert.equal(queries.get('SELECT allowed FROM access WHERE user=?','bob'),undefined);
    queries.run('UPDATE access SET allowed=? WHERE user=?',0,'alice');
    assert.equal(queries.get('SELECT allowed FROM access WHERE user=?','alice').allowed,0);
    assert.equal(queries.size,2);
    for(let n=0;n<20;n++)queries.get(`SELECT ${n} AS value`);
    assert.equal(queries.size,2);
    queries.clear();assert.equal(queries.size,0);
  }finally{db.close();}
});

test('a full poster list uses one query while snapshots and viewer saves remain isolated',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,passwordHash TEXT);
      CREATE TABLE posters(id TEXT PRIMARY KEY,ownerId TEXT,universityId TEXT,slug TEXT,status TEXT,content TEXT,publicData TEXT,version INTEGER,createdAt TEXT,updatedAt TEXT,publishedAt TEXT);
      CREATE TABLE comments(posterId TEXT);CREATE TABLE saved_posters(posterId TEXT,userId TEXT);
      INSERT INTO users VALUES ('alice','Alice','enabled'),('team','Team','!disabled');`);
    const insert=db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for(let n=0;n<200;n++)insert.run(String(n),n===199?'team':'alice','anu','notice-'+n,'PUBLISHED','{"title":"Private edit"}','{"title":"Published snapshot"}',1,'created','updated','published');
    db.exec("INSERT INTO comments VALUES ('0'),('0');INSERT INTO saved_posters VALUES ('0','bob');");
    const queries=createQueries(db);let calls=0;
    const store=createPosterStore({get:(...args)=>{calls++;return queries.get(...args);},all:(...args)=>{calls++;return queries.all(...args);}});
    const list=viewerId=>store.list({where:"p.status='PUBLISHED'",order:'CAST(p.id AS INTEGER)',viewerId});
    const bob=list('bob');assert.equal(calls,1);assert.equal(bob.length,200);
    assert.equal(bob[0].title,'Published snapshot');assert.equal(bob[0].commentCount,2);assert.equal(bob[0].isSaved,true);assert.equal(bob[0].canMessageOwner,true);assert.equal(bob[199].canMessageOwner,false);
    const alice=list('alice');assert.equal(calls,2);assert.equal(alice[0].isSaved,false);assert.equal(alice[0].canMessageOwner,false);
    db.exec("DELETE FROM saved_posters;DELETE FROM comments;");
    const updated=list('bob');assert.equal(updated[0].isSaved,false);assert.equal(updated[0].commentCount,0);
    const draft=store.present(queries.get('SELECT * FROM posters WHERE id=?','0'),true,'alice');
    assert.equal(draft.title,'Private edit');assert.equal(draft.hasUnpublishedChanges,true);
  }finally{db.close();}
});

test('public lists omit private draft columns and community map/feed work stays bounded',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,passwordHash TEXT);
      CREATE TABLE posters(id TEXT PRIMARY KEY,ownerId TEXT,universityId TEXT,slug TEXT,status TEXT,content TEXT,publicData TEXT,version INTEGER,createdAt TEXT,updatedAt TEXT,publishedAt TEXT);
      CREATE TABLE comments(posterId TEXT);CREATE TABLE saved_posters(posterId TEXT,userId TEXT);
      CREATE TABLE event_settings(posterId TEXT PRIMARY KEY,capacity INTEGER,duration INTEGER,enabled INTEGER,lat REAL,lng REAL,clubId TEXT);
      CREATE TABLE club_follows(universityId TEXT,clubId TEXT,userId TEXT);
      CREATE TABLE game_rooms(status TEXT,guestId TEXT,state TEXT);
      INSERT INTO users VALUES ('alice','Alice','enabled');`);
    const insert=db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for(let n=0;n<205;n++)insert.run(String(n),'alice',n<200?'anu':'usyd','notice-'+n,'PUBLISHED',JSON.stringify({title:'Private edit',description:'Private working document '.repeat(1000)}),JSON.stringify({title:'Published snapshot',description:'Public details'}),1,'created','updated',String(n).padStart(4,'0'));
    db.exec("INSERT INTO event_settings VALUES ('0',12,90,1,-35.28,149.12,'club');INSERT INTO saved_posters VALUES ('0','bob');INSERT INTO comments VALUES ('0');INSERT INTO club_follows VALUES ('anu','club','bob');");
    const queries=createQueries(db);let calls=0;
    const counted={...queries,get:(...args)=>{calls++;return queries.get(...args);},all:(sql,...params)=>{calls++;const rows=queries.all(sql,...params);if(sql.startsWith('SELECT p.id,'))assert.ok(rows.every(row=>!Object.hasOwn(row,'content')));return rows;}};
    const store=createPosterStore(counted),user={id:'bob',universityId:'anu'};
    let response;
    const service=createCommunity({...counted,db,posters:store,sockets:new Set(),now:()=>new Date().toISOString(),campusAccount:()=>user,json:(_res,status,value)=>{assert.equal(status,200);response=value;},fail:(status,message)=>{throw Object.assign(Error(message),{status});}});
    calls=0;await service.handle({method:'GET'},{},new URL('http://localhost/api/community/map'));
    assert.equal(calls,2);assert.equal(response.events.length,200);
    const pinned=response.events.find(p=>p.id==='0');
    assert.equal(pinned.title,'Published snapshot');assert.equal(pinned.description,'Public details');assert.equal(pinned.isSaved,true);assert.equal(pinned.commentCount,1);assert.equal(pinned.lat,-35.28);assert.equal(pinned.capacity,12);
    const ordinary=response.events.find(p=>p.id==='1');assert.equal(ordinary.enabled,0);assert.equal(ordinary.lat,null);assert.equal(ordinary.duration,60);assert.equal(ordinary.posterId,'1');
    db.exec("UPDATE event_settings SET lat=-35.3 WHERE posterId='0';DELETE FROM saved_posters;");
    calls=0;await service.handle({method:'GET'},{},new URL('http://localhost/api/community/map'));
    assert.equal(calls,2);assert.equal(response.events.find(p=>p.id==='0').lat,-35.3);assert.equal(response.events.find(p=>p.id==='0').isSaved,false);
    calls=0;await service.handle({method:'GET'},{},new URL('http://localhost/api/community/feed'));
    assert.equal(calls,1);assert.equal(response.events.length,1);assert.equal(response.events[0].id,'0');
    db.exec('DELETE FROM club_follows');calls=0;await service.handle({method:'GET'},{},new URL('http://localhost/api/community/feed'));assert.equal(calls,1);assert.deepEqual(response.events,[]);
    db.exec("UPDATE posters SET publicData=NULL WHERE id='0';");
    assert.equal(store.list({where:"p.id='0'",order:'p.id'})[0].title,'Private edit');
    const privateList=store.list({where:"p.id='1'",order:'p.id',privateView:true,viewerId:'alice'});assert.equal(privateList[0].title,'Private edit');assert.equal(privateList[0].hasUnpublishedChanges,true);
  }finally{db.close();}
});

test('compression and conditional static requests preserve account boundaries',{timeout:15000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});
  const dir=mkdtempSync(join(root,'performance-tests-')),base='http://127.0.0.1:18090';
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18090',DATA_DIR:dir},stdio:['ignore','ignore','pipe']});
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  const request=(path,headers={},method='GET')=>fetch(base+path,{headers,method,redirect:'manual'});
  try{
    let ready=false;
    for(let n=0;n<100;n++){try{ready=(await request('/api/health')).ok;if(ready)break;}catch{}if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,30));}
    assert.ok(ready,errors);
    const source=readFileSync('public/app.js','utf8');let etag;
    await t.test('identity, gzip and Brotli decode to identical source; q=0 is respected',async()=>{
      for(const [accept,expected] of [['identity',null],['gzip','gzip'],['br,gzip','br'],['br;q=0,gzip;q=0',null],['br;q=0.3,gzip;q=0.8','gzip']]){
        const res=await request('/app.js',{'accept-encoding':accept});assert.equal(res.status,200);
        assert.equal(res.headers.get('content-encoding'),expected);assert.equal(await res.text(),source);
        assert.match(res.headers.get('vary'),/Accept-Encoding/);
        if(expected==='br'){etag=res.headers.get('etag');assert.ok(Number(res.headers.get('content-length'))<Buffer.byteLength(source)*.5);}
      }
    });
    await t.test('weak and multiple validators return body-free 304; encodings have separate validators',async()=>{
      for(const match of [etag,'W/'+etag,'"unrelated", '+etag,'*']){
        const res=await request('/app.js',{'accept-encoding':'br,gzip','if-none-match':match});assert.equal(res.status,304);assert.equal((await res.arrayBuffer()).byteLength,0);
      }
      const different=await request('/app.js',{'accept-encoding':'identity','if-none-match':etag});assert.equal(different.status,200);assert.notEqual(different.headers.get('etag'),etag);await different.arrayBuffer();
    });
    await t.test('HEAD returns the selected representation length without sending a body',async()=>{
      const get=await request('/games.css',{'accept-encoding':'gzip'}),head=await request('/games.css',{'accept-encoding':'gzip'},'HEAD');
      assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),get.headers.get('content-length'));assert.equal(head.headers.get('etag'),get.headers.get('etag'));assert.equal((await head.arrayBuffer()).byteLength,0);await get.arrayBuffer();
    });
    await t.test('streamed photo bytes match the file and can be conditionally reused',async()=>{
      const posters=await(await request('/api/posters?university=anu')).json(),path=posters[0].heroImageUrl;
      const res=await request(path),bytes=Buffer.from(await res.arrayBuffer());assert.deepEqual(bytes,readFileSync(join('public',path.slice(1))));assert.equal(res.headers.get('cache-control'),'public, max-age=86400');
      assert.equal((await request(path,{'if-none-match':res.headers.get('etag')})).status,304);
    });
    await t.test('a cached guest page cannot bypass the logged-in account university',async()=>{
      const token='c'.repeat(64),cookie=`campus_session=${token}`,fixture=new DatabaseSync(join(dir,'campuswall.sqlite'));
      fixture.prepare('INSERT INTO users(id,name,email,passwordHash,createdAt,username,universityId) VALUES (?,?,?,?,?,?,?)').run('performance-account','Fixture','fixture@example.com','fixture-only',new Date().toISOString(),'perf-fixture','anu');
      fixture.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),'performance-account',Date.now()+60000);fixture.close();
      const guest=await request('/usyd',{'accept-encoding':'br'}),validator=guest.headers.get('etag');await guest.arrayBuffer();
      const res=await request('/usyd',{'accept-encoding':'br','if-none-match':validator,cookie});assert.equal(res.status,302);assert.equal(res.headers.get('location'),'/anu');
      const own=await request('/anu',{'accept-encoding':'br',cookie});assert.match(own.headers.get('cache-control'),/private/);assert.match(own.headers.get('vary'),/Cookie/);await own.arrayBuffer();
      const forbidden=await request('/api/posters?university=usyd',{cookie,'if-none-match':validator});assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get('cache-control'),'no-store');await forbidden.arrayBuffer();
    });
    await t.test('JSON remains uncached and static path traversal is rejected',async()=>{
      for(const path of ['/api/auth/me','/api/posters?university=anu']){const res=await request(path,{'if-none-match':'*'});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('etag'),null);await res.arrayBuffer();}
      assert.equal((await request('/demo-photos/%2e%2e%2fserver.mjs')).status,404);
    });
  }finally{
    if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
    if(dir.startsWith(root+sep)&&dir!==root)rmSync(dir,{recursive:true,force:true});
  }
});

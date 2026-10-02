import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {createQueries} from '../database.mjs';
import {createPosterStore} from '../poster-store.mjs';
import {createCommunity} from '../community.mjs';

const db=new DatabaseSync(':memory:');
try{
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,passwordHash TEXT);
    CREATE TABLE posters(id TEXT PRIMARY KEY,ownerId TEXT,universityId TEXT,slug TEXT,status TEXT,content TEXT,publicData TEXT,version INTEGER,createdAt TEXT,updatedAt TEXT,publishedAt TEXT);
    CREATE TABLE comments(posterId TEXT);CREATE TABLE saved_posters(posterId TEXT,userId TEXT);
    CREATE TABLE event_settings(posterId TEXT PRIMARY KEY,capacity INTEGER,duration INTEGER,enabled INTEGER,lat REAL,lng REAL,clubId TEXT);
    CREATE TABLE game_rooms(status TEXT,guestId TEXT,state TEXT);
    INSERT INTO users VALUES ('owner','Local fixture owner','enabled');`);
  const insert=db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for(let n=0;n<200;n++)insert.run(String(n),'owner','anu','fixture-'+n,'PUBLISHED',JSON.stringify({title:'Private working version',description:'Isolated private draft '.repeat(1500)}),JSON.stringify({title:'Published fixture '+n,date:'2026-10-15',description:'Public test-only details'}),1,'created','updated',String(n).padStart(4,'0'));
  const queries=createQueries(db);let calls=0,response;
  const counted={...queries,get:(...args)=>{calls++;return queries.get(...args);},all:(...args)=>{calls++;return queries.all(...args);}};
  const store=createPosterStore(counted),user={id:'viewer',universityId:'anu'};
  const defaults=posterId=>({posterId,capacity:50,duration:60,enabled:0,lat:null,lng:null,clubId:null});
  function reference(){
    return counted.all("SELECT p.* FROM posters p WHERE p.universityId=? AND p.status='PUBLISHED' ORDER BY p.publishedAt DESC LIMIT 300",user.universityId).map(p=>({...store.present(p,false,user.id),...(counted.get('SELECT * FROM event_settings WHERE posterId=?',p.id)||defaults(p.id)),href:`/${p.universityId}/posters/${p.slug}`}));
  }
  const service=createCommunity({...counted,db,posters:store,sockets:new Set(),now:()=>new Date().toISOString(),campusAccount:()=>user,json:(_res,status,value)=>{assert.equal(status,200);response=value.events;}});
  async function optimized(){await service.handle({method:'GET'},{},new URL('http://localhost/api/community/map'));return response;}
  assert.deepEqual(await optimized(),reference());
  async function sample(run){
    for(let n=0;n<3;n++)await run();const ms=[];let queryCount;
    for(let n=0;n<20;n++){calls=0;const start=performance.now();await run();ms.push(performance.now()-start);queryCount=calls;}
    ms.sort((a,b)=>a-b);return {samples:20,queriesPerRequest:queryCount,p50ms:+ms[10].toFixed(2),p95ms:+ms[19].toFixed(2)};
  }
  const result={date:'2026-10-02',fixturePosters:200,identicalResponse:true,reference:await sample(reference),optimized:await sample(optimized),notes:'In-memory SQLite and actual current community map handler. Reference preserves the pre-change full-row/per-poster query path. Authentication is a local fixture; this is not production HTTP latency.'};
  writeFileSync('data/performance-community-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{db.close();}

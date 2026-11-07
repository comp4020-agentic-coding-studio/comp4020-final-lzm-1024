import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';

// ACTIVE_CAMPUSES closes universities without deleting them. The same disposable
// database is served with every campus open, then ANU only, then all again.
test('closing campuses hides them but keeps their accounts and posters',{timeout:60000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'active-campus-')),port=18144,base='http://127.0.0.1:'+port;let child;
 async function start(active){const env={...process.env,PORT:String(port),DATA_DIR:dir};delete env.ACTIVE_CAMPUSES;if(active)env.ACTIVE_CAMPUSES=active;child=spawn(process.execPath,['server.mjs'],{env,stdio:'pipe'});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Start failed');}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',body,user){const r=await fetch(base+path,{method,redirect:'manual',headers:{'content-type':'application/json',...(user?{cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,location:r.headers.get('location'),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const password='preview-only-password';
 async function reg(name,universityId,email=name+'@example.com'){const r=await req('/api/auth/register','POST',{name,username:name,email,universityId,password});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};}
 async function publish(user,universityId,title){let p=(await req('/api/drafts','POST',{universityId,title},user)).data;for(const [field,value] of [['date','2027-04-01'],['location','Main hall']])p=(await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},user)).data;assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',{},user)).status,200);return p;}
 try{
  await start();const sydney=await reg('closed_sydney','usyd'),anu=await reg('open_anu','anu');const sydneyPoster=await publish(sydney,'usyd','Sydney stays safe');
  assert.equal((await req('/api/universities')).data.length,8,'unset means every campus is open');
  await stop();await start('anu');
  await t.test('only ANU is offered, browsable or joinable',async()=>{
   assert.deepEqual((await req('/api/universities')).data.map(u=>u.id),['anu']);
   assert.equal((await req('/usyd')).location,'/anu');assert.equal((await req('/usyd/clubs')).location,'/anu/clubs');assert.equal((await req('/usyd/posters/'+sydneyPoster.slug)).location,'/anu');
   assert.equal((await req('/anu')).status,200);
   for(const path of ['/api/posters?university=usyd','/api/clubs?university=usyd','/api/chat/messages?university=usyd'])assert.equal((await req(path)).status,400,path);
   for(const path of [`/api/posters/${sydneyPoster.id}`,`/api/posters/${sydneyPoster.id}/comments`,`/api/posters/${sydneyPoster.id}/calendar`])assert.equal((await req(path)).status,404,path);
   assert.equal((await req('/api/posters?university=anu')).status,200);
   const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?wall=usyd&chat=1`);const code=await new Promise(r=>{ws.on('error',()=>{});ws.on('unexpected-response',(_q,res)=>{res.resume();ws.terminate();r(res.statusCode);});ws.on('open',()=>{ws.close();r(101);});});assert.equal(code,400);
  });
  await t.test('registration is limited to open universities, without matching closed domains elsewhere',async()=>{
   const closedEmail=await req('/api/auth/register','POST',{name:'Syd',email:'someone@uni.sydney.edu.au',universityId:'anu',password});assert.equal(closedEmail.status,400);assert.match(closedEmail.data.error,/USYD is not open on CampusWall yet\. CampusWall is currently open to ANU/);assert.equal(closedEmail.cookie,undefined);
   assert.equal((await req('/api/auth/register','POST',{name:'Syd',email:'someone@example.com',universityId:'usyd',password})).status,400);
   assert.equal((await req('/api/auth/register','POST',{name:'Anu',email:'someone@anu.edu.au',password})).status,200,'open university email still works');
  });
  await t.test('accounts at closed universities sign in but cannot use or reach campus features',async()=>{
   const login=await req('/api/auth/login','POST',{email:sydney.email,password});assert.equal(login.status,200);sydney.cookie=login.cookie;
   for(const [path,method,body] of [['/api/drafts','GET'],['/api/drafts','POST',{universityId:'usyd',title:'x'}],['/api/saved','GET'],['/api/messages/conversations','GET'],['/api/community/notifications','GET'],['/api/chat/messages','POST',{body:'hi',clientId:'00000000-0000-4000-8000-000000000000'}]]){const r=await req(path,method,body,sydney);assert.equal(r.status,403,path);assert.match(r.data.error,/not open on CampusWall right now/);}
   assert.equal((await req('/api/posters?university=anu','GET',null,sydney)).status,403,'they cannot cross into ANU either');
   assert.equal((await req('/anu','GET',null,sydney)).status,200,'the page loads and explains the closure');
   assert.equal((await req(`/api/drafts`,'GET',null,anu)).status,200,'ANU accounts are unaffected');
  });
  await stop();await start();
  await t.test('re-opening every campus restores the closed data unchanged',async()=>{
   const login=await req('/api/auth/login','POST',{email:sydney.email,password});sydney.cookie=login.cookie;
   assert.equal((await req(`/api/posters/${sydneyPoster.id}`)).data.title,'Sydney stays safe');
   assert.equal((await req('/api/drafts','GET',null,sydney)).data.length,1);
  });
  await stop();
  await t.test('an unknown campus id stops the server instead of silently opening nothing',async()=>{
   const env={...process.env,PORT:String(port),DATA_DIR:dir,ACTIVE_CAMPUSES:'anu,atlantis'};const bad=spawn(process.execPath,['server.mjs'],{env,stdio:'pipe'});let err='';bad.stderr.on('data',d=>err+=d);const [codeExit]=await once(bad,'exit');assert.notEqual(codeExit,0);assert.match(err,/unknown university: atlantis/);
  });
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

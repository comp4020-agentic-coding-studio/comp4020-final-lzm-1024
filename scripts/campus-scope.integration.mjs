import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

// Private messages never reach a closed university; direct contact respects blocks;
// team applications cannot flood an organiser; malformed community addresses are client errors.
test('closed-campus contact, team application limits and block coverage',{timeout:60000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'campus-scope-')),port=18145,base='http://127.0.0.1:'+port;let child;
 async function start(active){const env={...process.env,PORT:String(port),DATA_DIR:dir};delete env.ACTIVE_CAMPUSES;if(active)env.ACTIVE_CAMPUSES=active;child=spawn(process.execPath,['server.mjs'],{env,stdio:'pipe'});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Start failed');}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',body,user){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(user?{cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name,universityId='anu'){const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.com',universityId,password:'preview-only-password'});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie};}
 try{
  await start();const a=await reg('scope_alex'),b=await reg('scope_blair'),c=await reg('scope_casey'),syd=await reg('scope_sydney','usyd');
  assert.ok((await req('/api/users/search?q=scope_sydney','GET',null,a)).data.users.some(u=>u.id===syd.id),'with every campus open, students can find each other across campuses');
  const earlier=(await req('/api/messages/conversations','POST',{userId:syd.id},a)).data.conversation;assert.ok(earlier.id);
  await stop();await start('anu');for(const user of [a,b,c])user.cookie=(await req('/api/auth/login','POST',{email:user.email,password:'preview-only-password'})).cookie;
  await t.test('students at a closed university cannot be found or messaged',async()=>{
   assert.equal((await req('/api/users/search?q=scope_','GET',null,a)).data.users.some(u=>u.id===syd.id),false);
   assert.ok((await req('/api/users/search?q=scope_','GET',null,a)).data.users.some(u=>u.id===b.id));
   assert.equal((await req('/api/messages/conversations','POST',{userId:syd.id},a)).status,404);
   assert.equal((await req('/api/messages/conversations','POST',{userId:b.id},a)).status,200);
  });
  await t.test('an earlier conversation with a closed university stays readable but accepts no new messages',async()=>{
   assert.equal((await req(`/api/messages/conversations/${earlier.id}/messages`,'GET',null,a)).status,200);
   const sent=await req(`/api/messages/conversations/${earlier.id}/messages`,'POST',{body:'hello',clientId:randomUUID()},a);assert.equal(sent.status,403);assert.match(sent.data.error,/not open on CampusWall right now/);
  });
  const team=(await req('/api/community/teams','POST',{title:'Study group',description:'Weekly',interests:'',category:'Study',capacity:5,startsAt:new Date(Date.now()+7*86400000).toISOString()},a)).data.team;
  await t.test('repeated team applications notify the organiser once a day and are rate limited',async()=>{
   for(let i=0;i<4;i++){assert.equal((await req(`/api/community/teams/${team.id}/apply`,'POST',{},b)).status,200);assert.equal((await req(`/api/community/teams/${team.id}/apply`,'POST',{},b)).status,200,'a pending retry is accepted without another notice');assert.equal((await req(`/api/community/teams/${team.id}/apply`,'DELETE',{},b)).status,200);}
   assert.equal((await req('/api/community/notifications','GET',null,a)).data.notifications.filter(n=>n.kind==='team').length,1);
   const codes=[];for(let i=0;i<10;i++){codes.push((await req(`/api/community/teams/${team.id}/apply`,'POST',{},b)).status);await req(`/api/community/teams/${team.id}/apply`,'DELETE',{},b);}
   assert.equal(codes.at(-1),429);assert.ok(codes.slice(0,5).every(code=>code===200));
  });
  await t.test('blocking also stops team applications and watch-room invitations',async()=>{
   assert.equal((await req('/api/blocks/'+a.id,'POST',{},c)).status,200);
   assert.equal((await req(`/api/community/teams/${team.id}/apply`,'POST',{},c)).status,403);
   const room=(await req('/api/watch/rooms','POST',{title:'Movie',url:'https://example.com/video.mp4',clientId:randomUUID()},a)).data.room;
   assert.equal((await req(`/api/community/watch/${room.id}/invite`,'POST',{userId:c.id,version:room.version},a)).status,403);
   assert.equal((await req('/api/community/notifications','GET',null,c)).data.notifications.filter(n=>n.title.includes('invited you')).length,0);
   assert.equal((await req(`/api/community/watch/${room.id}/invite`,'POST',{userId:b.id,version:room.version},a)).status,200,'other invitations still work');
  });
  await t.test('malformed community addresses are rejected as bad requests',async()=>{
   assert.equal((await req('/api/community/teams/%E0%A4%A','GET',null,a)).status,400);
   assert.equal((await req('/api/community/teams/%E0%A4%A')).status,400);
  });
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

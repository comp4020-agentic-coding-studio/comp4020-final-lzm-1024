import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// Students can fix their display name and username; email, campus and other people's
// accounts stay out of reach. Disposable database only.
test('display name and username changes',{timeout:30000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'account-')),port=18146,base='http://127.0.0.1:'+port;let child;
 async function start(){const env={...process.env,PORT:String(port),DATA_DIR:dir};delete env.ACTIVE_CAMPUSES;child=spawn(process.execPath,['server.mjs'],{env,stdio:'pipe'});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Start failed');}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',body,user){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(user?{cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name){const r=await req('/api/auth/register','POST',{name,email:name+'@example.com',universityId:'anu',password:'preview-only-password'});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie};}
 try{
  await start();const a=await reg('account_alex'),b=await reg('account_blair');
  await t.test('a generated username can be replaced and the display name corrected',async()=>{
   assert.match(a.username,/^account_alex/);
   const r=await req('/api/account','PATCH',{name:'Alex Chen',username:'Alex_C'},a);assert.equal(r.status,200);assert.equal(r.data.user.name,'Alex Chen');assert.equal(r.data.user.username,'alex_c');
   assert.equal((await req('/api/auth/me','GET',null,a)).data.user.username,'alex_c');
   assert.equal((await req('/api/profiles/'+a.id)).data.profile.name,'Alex Chen');
   assert.ok((await req('/api/users/search?q=alex_c','GET',null,b)).data.users.some(u=>u.id===a.id));
  });
  await t.test('usernames stay unique and well formed; names cannot be blank',async()=>{
   assert.equal((await req('/api/account','PATCH',{username:'ALEX_C'},b)).status,409,'case-insensitive uniqueness');
   for(const username of ['ab','has space','x'.repeat(25),'emoji😀'])assert.equal((await req('/api/account','PATCH',{username},b)).status,400,username);
   assert.equal((await req('/api/account','PATCH',{name:'   '},b)).status,400);assert.equal((await req('/api/account','PATCH',{name:'x'.repeat(51)},b)).status,400);
  });
  await t.test('email, campus and unknown fields cannot change, and sign-in is required',async()=>{
   for(const body of [{email:'new@example.com'},{universityId:'usyd'},{name:'Ok',passwordHash:'x'},{}])assert.equal((await req('/api/account','PATCH',body,b)).status,400,JSON.stringify(body));
   assert.equal((await req('/api/account','PATCH',{name:'Nobody'})).status,401);
   const me=(await req('/api/auth/me','GET',null,b)).data.user;assert.equal(me.email,'account_blair@example.com');assert.equal(me.universityId,'anu');
   assert.equal((await req('/api/profiles/'+b.id,'PATCH',{name:'Still blocked here'},b)).status,400,'the profile editor still cannot change identity');
  });
  await t.test('repeated changes are rate limited',async()=>{
   const c=await reg('account_casey');const codes=[];for(let i=0;i<12;i++)codes.push((await req('/api/account','PATCH',{name:'Casey '+i},c)).status);
   assert.equal(codes.at(-1),429);assert.ok(codes.slice(0,5).every(code=>code===200));
  });
  await stop();await start();
  await t.test('changes survive a restart',async()=>{
   const login=await req('/api/auth/login','POST',{email:a.email,password:'preview-only-password'});assert.equal(login.data.user.username,'alex_c');assert.equal(login.data.user.name,'Alex Chen');
  });
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

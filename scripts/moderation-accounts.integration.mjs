import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// Reports, moderator removal, password change, recovery codes and account deletion, checked with
// distinct clients against a disposable database, including a restart that names the moderator.
test('reporting, moderation and account security',{timeout:90000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'moderation-')),port=18153,base=`http://127.0.0.1:${port}`;let child;
  const start=async(env={})=>{child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,...env},stdio:'pipe'});for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('server did not start');};
  const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}};
  const req=async(path,method='GET',body,u)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const pass='disposable-test-password';
  const reg=async name=>{const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.test',password:pass,universityId:'anu'});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};};
  const login=async(name,password=pass)=>{const r=await req('/api/auth/login','POST',{email:name+'@example.test',password});return r.status===200?{...r.data.user,cookie:r.cookie}:r;};
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const publish=async(u,title)=>{let p=(await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title},u)).data;for(const [field,value] of Object.entries({date:future,time:'18:00',location:'Kambri'})){p=(await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},u)).data;}assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',null,u)).status,200);return p;};
  try{
    await start();
    let mod=await reg('mod_person');const author=await reg('mod_author'),a=await reg('mod_reporter_a'),b=await reg('mod_reporter_b');
    await stop();await start({MODERATOR_IDS:mod.id});mod=await login('mod_person');
    const poster=await publish(author,'Spam poster'),kept=await publish(author,'A fine poster');
    const comment=(await req(`/api/posters/${kept.id}/comments`,'POST',{body:'Rude comment'},a)).data;
    await t.test('students report public content once each; authors and guests cannot',async()=>{
      assert.equal((await req('/api/auth/me','GET',null,mod)).data.user.isModerator,true);assert.equal((await req('/api/auth/me','GET',null,a)).data.user.isModerator,false);
      for(const u of [a,b])assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:poster.id,reason:'spam',note:'Advertising'},u)).status,200);
      assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:poster.id,reason:'spam'},a)).status,200,'a repeat is accepted but not counted twice');
      assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:poster.id,reason:'spam'},author)).status,400);
      assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:poster.id,reason:'because'},a)).status,400);
      assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:poster.id,reason:'spam'})).status,401);
      assert.equal((await req('/api/reports','POST',{targetType:'comment',targetId:comment.id,reason:'harassment'},b)).status,200);
      assert.equal((await req('/api/moderation/reports','GET',null,a)).status,403);
    });
    await t.test('the moderator queue groups reports without naming reporters',async()=>{
      const list=(await req('/api/moderation/reports','GET',null,mod)).data.reports;
      const p=list.find(r=>r.targetId===poster.id),c=list.find(r=>r.targetId===comment.id);
      assert.equal(p.count,2);assert.deepEqual(p.reasons,{spam:2});assert.deepEqual(p.notes,['Advertising','Advertising']);assert.equal(p.title,'Spam poster');assert.equal(p.author,'mod_author');
      assert.equal(c.body,'Rude comment');assert.equal(c.author,'mod_reporter_a');const text=JSON.stringify(list);assert.ok(!text.includes(b.id)&&!text.includes('mod_reporter_b')&&!text.includes(a.id)&&!/reporter/i.test(Object.keys(p).join()),'reporters stay anonymous');
    });
    await t.test('removing a poster takes it off the wall but keeps it as a locked draft',async()=>{
      assert.equal((await req(`/api/moderation/poster/${poster.id}`,'POST',{action:'remove'},a)).status,403);
      const r=await req(`/api/moderation/poster/${poster.id}`,'POST',{action:'remove'},mod);assert.equal(r.status,200);assert.equal(r.data.closed,2);
      assert.equal((await req(`/api/posters/${poster.id}`)).status,404);
      const draft=(await req('/api/drafts','GET',null,author)).data.find(p=>p.id===poster.id);assert.equal(draft.status,'DRAFT');
      assert.equal((await req(`/api/drafts/${poster.id}/publish`,'POST',null,author)).status,403);
      const notes=(await req('/api/community/notifications','GET',null,author)).data;assert.ok(JSON.stringify(notes).includes('A moderator took your poster “Spam poster” off the wall'));
      assert.equal((await req(`/api/drafts/${poster.id}`,'DELETE',null,author)).status,200,'the creator can still delete it');
    });
    await t.test('removing a comment deletes it; dismissing closes reports without changes',async()=>{
      assert.equal((await req(`/api/moderation/comment/${comment.id}`,'POST',{action:'remove'},mod)).data.closed,1);
      assert.equal((await req(`/api/posters/${kept.id}/comments`)).data.length,0);
      assert.equal((await req('/api/reports','POST',{targetType:'poster',targetId:kept.id,reason:'misleading'},b)).status,200);
      assert.equal((await req(`/api/moderation/poster/${kept.id}`,'POST',{action:'dismiss'},mod)).data.closed,1);
      assert.equal((await req(`/api/posters/${kept.id}`)).status,200);assert.equal((await req('/api/moderation/reports','GET',null,mod)).data.reports.length,0);
    });
    await t.test('changing a password needs the current one and signs other devices out',async()=>{
      const other=await login('mod_reporter_a');
      assert.equal((await req('/api/account/password','POST',{currentPassword:'wrong-password',newPassword:'new-password-123'},a)).status,403);
      assert.equal((await req('/api/account/password','POST',{currentPassword:pass,newPassword:'new-password-123'},a)).status,200);
      assert.equal((await req('/api/auth/me','GET',null,a)).data.user.id,a.id,'this device stays signed in');
      assert.equal((await req('/api/auth/me','GET',null,other)).data.user,null,'the other device is signed out');
      assert.equal((await login('mod_reporter_a')).status,401);assert.equal((await login('mod_reporter_a','new-password-123')).id,a.id);
    });
    await t.test('a recovery code works once and needs the password to create',async()=>{
      assert.equal((await req('/api/account/recovery-code','POST',{password:'wrong-password'},b)).status,403);
      const {code}=(await req('/api/account/recovery-code','POST',{password:pass},b)).data;assert.match(code,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
      assert.equal((await req('/api/account/security','GET',null,b)).data.hasRecoveryCode,true);
      assert.equal((await req('/api/auth/recover','POST',{email:'mod_reporter_b@example.test',code:'AAAA-BBBB-CCCC-DDDD',password:'recovered-pass-1'})).status,401);
      const recovered=await req('/api/auth/recover','POST',{email:'mod_reporter_b@example.test',code:code.toLowerCase(),password:'recovered-pass-1'});assert.equal(recovered.status,200);assert.ok(recovered.cookie);
      assert.equal((await req('/api/auth/me','GET',null,b)).data.user,null,'old sign-ins end');
      assert.equal((await req('/api/auth/recover','POST',{email:'mod_reporter_b@example.test',code,password:'recovered-pass-2'})).status,401,'codes work once');
      assert.equal((await login('mod_reporter_b','recovered-pass-1')).id,b.id);
    });
    await t.test('a moderator can issue a 24-hour code for a student who has none',async()=>{
      assert.equal((await req('/api/moderation/recovery','POST',{username:'mod_author'},a)).status,403);
      const issued=(await req('/api/moderation/recovery','POST',{username:'@mod_author'},mod)).data;assert.ok(issued.expiresAt-Date.now()>23*3600000);
      assert.equal((await req('/api/auth/recover','POST',{email:'mod_author@example.test',code:issued.code,password:'author-new-pass'})).status,200);
    });
    await t.test('deleting an account removes the student’s public content and sign-in',async()=>{
      const author2=await login('mod_author','author-new-pass'),own=await publish(author2,'Leaving soon');await req(`/api/posters/${kept.id}/comments`,'POST',{body:'Bye'},author2);
      assert.equal((await req('/api/account/delete','POST',{password:'author-new-pass',confirm:'delete'},author2)).status,400);
      assert.equal((await req('/api/account/delete','POST',{password:'author-new-pass',confirm:'DELETE'},author2)).status,200);
      assert.equal((await req(`/api/posters/${own.id}`)).status,404);assert.equal((await req(`/api/posters/${kept.id}`)).status,404,'their posters are gone');
      assert.equal((await login('mod_author','author-new-pass')).status,401);
      assert.equal((await req('/api/users/search?q=mod_author','GET',null,mod)).data.users?.length??0,0);
      const again=await req('/api/auth/register','POST',{name:'Back again',username:'back_again',email:'mod_author@example.test',password:pass,universityId:'anu'});assert.equal(again.status,200,'the email address is free again');
    });
  }finally{await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

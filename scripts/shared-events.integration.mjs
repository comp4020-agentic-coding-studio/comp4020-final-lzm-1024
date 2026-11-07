import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// A student sharing someone else's event names the organiser and links the official
// page. The server then refuses CampusWall bookings for it, even if booking was enabled.
test('shared events take bookings only on their official page',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'shared-events-')),port=18149,base=`http://127.0.0.1:${port}`;let child;
  const req=async(path,method='GET',body,u)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const reg=async name=>{const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.test',password:'disposable-test-password',universityId:'anu'});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};};
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  async function publish(u,fields){let p=(await req('/api/drafts','POST',{universityId:'anu',preset:'seminar',title:fields.title},u)).data;for(const [field,value] of Object.entries({date:future,time:'18:00',location:'Molonglo Theatre',...fields})){const r=await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},u);assert.equal(r.status,200,JSON.stringify(r.data));p=r.data;}const r=await req(`/api/drafts/${p.id}/publish`,'POST',null,u);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
  try{
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
    const sharer=await reg('shared_sharer'),guest=await reg('shared_guest');
    const shared=await publish(sharer,{title:'A lecture someone else runs',organiser:'ANU Centre for Climate and Energy Policy',eventUrl:'https://example.org/official-event',description:'Register at https://example.org/official-event.'});
    const own=await publish(sharer,{title:'An event I run myself'});
    await t.test('the public poster carries the organiser and official page',async()=>{
      const list=(await req('/api/posters?university=anu')).data,p=list.find(x=>x.id===shared.id);
      assert.equal(p.organiser,'ANU Centre for Climate and Energy Policy');assert.equal(p.eventUrl,'https://example.org/official-event');
    });
    await t.test('booking a shared event is refused by the server; an own event still books',async()=>{
      for(const p of [shared,own])assert.equal((await req(`/api/community/events/${p.id}/settings`,'PATCH',{enabled:true,capacity:20},sharer)).status,200);
      const refused=await req(`/api/community/events/${shared.id}/register`,'POST',{},guest);
      assert.equal(refused.status,409);assert.equal(refused.data.error,'This event takes bookings on its official page.');
      const booked=await req(`/api/community/events/${own.id}/register`,'POST',{},guest);assert.equal(booked.status,200,JSON.stringify(booked.data));assert.equal(booked.data.registration.status,'registered');
    });
    await t.test('a non-web address is stored as typed but never treated as an official page',async()=>{
      const odd=await publish(sharer,{title:'Typed while editing',eventUrl:'javascript:alert(1)'});
      assert.equal((await req(`/api/community/events/${odd.id}/settings`,'PATCH',{enabled:true},sharer)).status,200);
      assert.equal((await req(`/api/community/events/${odd.id}/register`,'POST',{},guest)).status,200,'only real http(s) pages move bookings away');
    });
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

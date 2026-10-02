import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';

test('voice signalling permissions, device ownership, session revocation and persistence',{timeout:45000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'voice-integration-')),base='http://127.0.0.1:18097';let child;const clients=[];
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18097',DATA_DIR:dir},stdio:'pipe'});let output='';child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error(output);}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',data,u){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name,universityId='anu'){const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.com',password:'preview-only-password',universityId});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie,device:randomUUID()};}
 async function socket(u,device=u.device){const ws=new WebSocket(base.replace('http','ws')+'/ws?social=1&device='+device,{headers:{cookie:u.cookie}});clients.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');return ws;}
 async function wait(ws,p){for(let i=0;i<100;i++){const v=ws.events.find(p);if(v)return v;await new Promise(r=>setTimeout(r,30));}throw Error('Missing voice event');}
 const operation=(c,u,action)=>req('/api/calls/'+c.id,'POST',{action,device:u.device},u);
 const signal=(c,u,value,clientId=randomUUID())=>req('/api/calls/'+c.id+'/signal','POST',{device:u.device,clientId,signal:value},u);
 const audio={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'};
 let a,b,x,sydney,convo,c,wa,wb,wx;
 try{await start();a=await reg('voice_alex');b=await reg('voice_riley');x=await reg('voice_outsider');sydney=await reg('voice_sydney','usyd');wa=await socket(a);wb=await socket(b);wx=await socket(x);convo=(await req('/api/messages/conversations','POST',{userId:b.id},a)).data.conversation;
  await t.test('requires login, a real conversation, online recipient and the bound caller device',async()=>{
   assert.equal((await req('/api/calls')).status,401);assert.equal((await req('/api/calls','POST',{conversationId:convo.id,clientId:randomUUID(),device:x.device},x)).status,404);
   assert.equal((await req('/api/calls','POST',{conversationId:convo.id,clientId:randomUUID(),device:randomUUID()},a)).status,409);
   const other=(await req('/api/messages/conversations','POST',{userId:sydney.id},a)).data.conversation;
   assert.equal((await req('/api/calls','POST',{conversationId:other.id,clientId:randomUUID(),device:a.device},a)).status,403);
   const offline=(await req('/api/messages/conversations','POST',{userId:x.id},b)).data.conversation;wx.close();await once(wx,'close');assert.equal((await req('/api/calls','POST',{conversationId:offline.id,clientId:randomUUID(),device:b.device},b)).status,409);
  });
  await t.test('ringing is private, caller cannot answer, retries do not duplicate and busy calls are rejected',async()=>{
   const input={conversationId:convo.id,clientId:randomUUID(),device:a.device};let r=await req('/api/calls','POST',input,a);assert.equal(r.status,201,JSON.stringify(r.data));c=r.data.call;
   assert.equal((await req('/api/calls','POST',input,a)).data.call.id,c.id);await wait(wb,e=>e.type==='call:state'&&e.call.id===c.id);
   assert.equal((await req('/api/calls/'+c.id,'GET',null,x)).status,404);assert.equal((await req('/api/calls','GET',null,x)).data.call,null);assert.ok(!wa.events.some(e=>e.type==='call:signal'));
   assert.equal((await operation(c,a,'accept')).status,403);assert.equal((await req('/api/calls','POST',{...input,clientId:randomUUID()},b)).status,409);
   assert.equal((await signal(c,a,{description:audio})).status,409);
  });
  await t.test('only the answering device gets SDP/ICE and video or unrelated negotiation is rejected',async()=>{
   assert.equal((await operation(c,b,'accept')).status,200);const secondDevice=randomUUID(),second=await socket(b,secondDevice);
   assert.equal((await req('/api/calls/'+c.id,'POST',{action:'accept',device:secondDevice},b)).status,409);
   assert.equal((await signal(c,b,{description:audio})).status,409);assert.equal((await signal(c,a,{description:{...audio,sdp:audio.sdp+'m=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}})).status,400);
   const clientId=randomUUID();assert.equal((await signal(c,a,{description:audio},clientId)).status,200);assert.equal((await signal(c,a,{description:audio},clientId)).status,200);
   await wait(wb,e=>e.type==='call:signal'&&e.callId===c.id);assert.ok(!second.events.some(e=>e.type==='call:signal'));
   assert.equal((await signal(c,b,{candidate:{candidate:'bad'}})).status,400);assert.equal((await signal(c,b,{candidate:{candidate:'candidate:1 1 udp 2122260223 127.0.0.1 9999 typ host',sdpMid:'0',sdpMLineIndex:0}})).status,200);
   assert.equal((await signal(c,b,{description:{...audio,type:'answer'}})).status,200);await operation(c,a,'connected');assert.equal((await operation(c,b,'connected')).data.call.status,'active');
   assert.equal((await operation(c,x,'hangup')).status,404);assert.equal((await operation(c,a,'hangup')).data.call.status,'ended');assert.equal((await operation(c,a,'hangup')).status,200);assert.equal((await signal(c,b,{candidate:null})).status,409);
  });
  await t.test('decline persists, session logout prevents delivery and active calls end on restart',async()=>{
   c=(await req('/api/calls','POST',{conversationId:convo.id,clientId:randomUUID(),device:a.device},a)).data.call;
   assert.equal((await operation(c,b,'reject')).data.call.reason,'declined');
   c=(await req('/api/calls','POST',{conversationId:convo.id,clientId:randomUUID(),device:a.device},a)).data.call;await operation(c,b,'accept');
   const closed=once(wb,'close');await req('/api/auth/logout','POST',{},b);await closed;assert.equal((await signal(c,a,{description:audio})).status,409);assert.equal((await operation(c,b,'hangup')).status,401);
   for(const ws of clients)ws.close();await stop();await start();assert.equal((await req('/api/calls','GET',null,a)).data.call,null);assert.equal((await req('/api/calls/'+c.id,'GET',null,a)).data.call.reason,'server-restarted');
   const db=new DatabaseSync(join(dir,'campuswall.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) n FROM voice_calls WHERE connectedAt IS NOT NULL').get().n,1);assert.equal(db.prepare('PRAGMA user_version').get().user_version,14);assert.ok(!db.prepare('PRAGMA table_info(voice_calls)').all().some(c=>/sdp|audio|candidate/i.test(c.name)));db.close();
  });
 }finally{for(const ws of clients)ws.terminate();if(child?.exitCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

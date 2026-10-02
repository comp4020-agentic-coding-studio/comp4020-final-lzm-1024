import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {classifyHttp,loadLogKey,createActionLogger,createLogSink} from '../observability.mjs';
import {objectDefaults} from '../public/canvas-model.js';

test('strict log projection never serialises attacker-controlled text or arbitrary action names',()=>{
 const lines=[],logger=createActionLogger({key:Buffer.alloc(32,2),write:line=>lines.push(line)}),actorId=randomUUID(),resourceId=randomUUID();
 const secret='Private-text@example.com / Password-Secret / SDP-ICE / https://private.example/token';
 logger.record({actorId,resourceId,action:'canvas.add',body:secret,password:secret,headers:{cookie:secret},revision:4});
 logger.record({actorId,resourceId,action:secret,status:403,revision:secret});
 logger.websocket(actorId,'whiteboard',resourceId,'canvas:operation',{action:secret,text:secret},400);
 const events=lines.map(JSON.parse);assert.equal(events[0].revision,4);assert.equal(events[0].action,'canvas.add');assert.equal(events[1].action,'unknown');assert.equal(events[2].action,'canvas.unknown');
 assert.equal(events[0].actor,events[1].actor);assert.equal(events[0].resource,events[1].resource);assert.notEqual(events[0].actor,actorId);assert.notEqual(events[0].resource,resourceId);
 assert.equal(createActionLogger({key:Buffer.alloc(32,3),write:()=>{}}).record({actorId,action:'page.view'}).actor===events[0].actor,false);
 for(const value of [secret,actorId,resourceId,'password','headers','cookie'])assert.ok(!lines.join('\n').includes(value));
 for(const path of ['/api/unknown/private-name?q=secret','/api/drafts/private-title/evil','/api/community/teams/secret-name'])assert.ok(!JSON.stringify(classifyHttp(path,'POST')).includes('private-name'));
 assert.equal(classifyHttp('/api/health','GET'),null);assert.equal(classifyHttp('/app.js','GET'),null);
});

test('response outcomes emit once; log backpressure is bounded and explicitly reported',()=>{
 const lines=[],logger=createActionLogger({key:Buffer.alloc(32),write:line=>lines.push(JSON.parse(line))});
 const response=new EventEmitter();response.statusCode=403;response.writableFinished=true;
 logger.http({url:'/api/messages/conversations?email=secret',method:'POST',observedActorId:randomUUID()},response);response.emit('finish');response.emit('close');
 assert.equal(lines.length,1);assert.equal(lines[0].outcome,'rejected');assert.equal(lines[0].action,'messages.conversations.submit');
 const aborted=new EventEmitter();aborted.writableFinished=false;logger.http({url:'/api/chat',method:'GET'},aborted);aborted.emit('close');aborted.emit('finish');assert.equal(lines[1].status,499);
 const stream=new EventEmitter(),output=[];let first=true;stream.write=line=>{output.push(line);if(first){first=false;return false;}return true;};
 const sink=createLogSink(stream,2);for(let i=0;i<6;i++)sink(JSON.stringify({i}));assert.equal(output.length,1);stream.emit('drain');assert.equal(output.length,4);assert.equal(JSON.parse(output.at(-1)).count,3);
 stream.emit('error',Error('collector secret'));assert.doesNotThrow(()=>sink('discarded'));
});

test('real HTTP and WebSocket events preserve actor identity, reject secrets and survive restart',{timeout:25000},async()=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'observability-')),base='http://127.0.0.1:18115';let child,output='';const sockets=[];
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18115',DATA_DIR:dir},stdio:'pipe'});child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Preview did not start');}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',body,account){const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(account?{cookie:account.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name){const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@anu.edu.au',password:'secret-fixture-password',universityId:'anu'});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie};}
 const events=()=>output.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).filter(event=>event.event==='action');
 try{
  await start();const a=await reg('logowner'),b=await reg('logfriend');let p=(await req('/api/drafts','POST',{universityId:'anu',preset:'whiteboard',title:'Private-title-marker'},a)).data;
  await req(`/api/drafts/${p.id}/collaborators`,'POST',{userId:b.id},a);
  const c=(await req('/api/messages/conversations','POST',{userId:b.id},a)).data.conversation;
  await req(`/api/messages/conversations/${c.id}/messages`,'POST',{body:'Private-message-marker',clientId:randomUUID()},a);
  assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',{},b)).status,403);
  const ws=new WebSocket(base.replace('http','ws')+'/ws?poster='+p.id,{headers:{cookie:a.cookie,origin:base}});sockets.push(ws);const messages=[];ws.on('message',bytes=>messages.push(JSON.parse(bytes)));await once(ws,'open');
  const wait=async predicate=>{for(let i=0;i<150;i++){const result=messages.find(predicate);if(result)return result;await new Promise(r=>setTimeout(r,15));}throw Error('No matching socket result');};
  await wait(m=>m.type==='poster:state');ws.send(JSON.stringify({type:'canvas:operation',posterId:p.id,action:'add',requestId:randomUUID(),clientVersion:p.version,object:{...objectDefaults,id:'note',type:'sticky',text:'Private-canvas-marker'}}));
  p=(await wait(m=>m.type==='poster:updated')).poster;
  ws.send(JSON.stringify({type:'canvas:operation',posterId:p.id,action:'Private-action-marker',requestId:randomUUID(),clientVersion:p.version}));await wait(m=>m.type==='error');
  await req('/api/users/search?q=Private-search-marker&token=Private-token-marker','GET',null,a);
  await req('/api/auth/login','POST',{email:'Secret-login-marker@anu.edu.au',password:'secret-fixture-password'});
  ws.close();await once(ws,'close');await new Promise(r=>setTimeout(r,20));
  let all=events();const edit=all.find(e=>e.action==='canvas.add');assert.equal(edit.outcome,'accepted');assert.equal(edit.revision,p.version);assert.ok(all.find(e=>e.action==='canvas.unknown'&&e.outcome==='rejected'));
  const dm=all.find(e=>e.action==='messages.messages.submit');assert.equal(edit.actor,dm.actor);assert.notEqual(edit.actor,all.find(e=>e.action==='drafts.publish.submit').actor);
  const key=readFileSync(join(dir,'.observability-key'));await stop();await start();assert.deepEqual(readFileSync(join(dir,'.observability-key')),key);
  await req(`/api/drafts/${p.id}`,'GET',null,a);await new Promise(r=>setTimeout(r,20));all=events();assert.equal(all.findLast(e=>e.action==='drafts.read').actor,edit.actor);
  for(const secret of ['Private-title-marker','Private-message-marker','Private-canvas-marker','Private-action-marker','Private-search-marker','Private-token-marker','Secret-login-marker','secret-fixture-password',a.email,b.email,a.cookie,b.cookie,a.id,b.id,p.id,c.id])assert.ok(!output.includes(secret),'Redaction failed');
  assert.ok(all.some(e=>e.action==='auth.login.submit'&&e.status===401));
 }finally{for(const ws of sockets)ws.terminate();if(child?.exitCode===null)await stop();assert.ok(dir.startsWith(root+sep));rmSync(dir,{recursive:true,force:true});}
});

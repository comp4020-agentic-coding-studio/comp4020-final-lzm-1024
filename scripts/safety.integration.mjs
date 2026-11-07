import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';

// Abuse and privacy boundaries: emails stay private, retries and spam are bounded,
// blocking stops direct contact, and one slow upload cannot stall everyone else.
// Uses a disposable database only.
test('safety limits, comment moderation and blocking',{timeout:90000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'safety-')),port=18143,base='http://127.0.0.1:'+port;let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,IMAGE_READ_TIMEOUT_MS:'1500'},stdio:'pipe'});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Start failed');}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',body,user){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(user?{cookie:user.cookie}:{})},...(body!==undefined&&body!==null?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name,universityId='anu'){const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.com',universityId,password:'preview-only-password'});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie};}
 async function login(u){const r=await req('/api/auth/login','POST',{email:u.email,password:'preview-only-password'});assert.equal(r.status,200);u.cookie=r.cookie;}
 const noEmail=value=>assert.ok(!JSON.stringify(value).includes('@example.com'),'response must not contain an email');
 try{
  await start();
  const owner=await reg('safe_owner'),friend=await reg('safe_friend'),stranger=await reg('safe_stranger'),other=await reg('safe_sydney','usyd');
  let p=(await req('/api/drafts','POST',{universityId:'anu',title:'Safety night'},owner)).data;
  for(const [field,value] of [['date','2027-03-01'],['location','Union Court']])p=(await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},owner)).data;
  assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',{},owner)).status,200);

  await t.test('collaborator lists and invitations never return emails, and email probing is bounded',async()=>{
   const invited=await req(`/api/drafts/${p.id}/collaborators`,'POST',{userId:friend.id},owner);assert.equal(invited.status,201);noEmail(invited.data);
   const list=await req(`/api/drafts/${p.id}/collaborators`,'GET',null,owner);assert.equal(list.data.length,1);assert.equal(list.data[0].username,'safe_friend');noEmail(list.data);
   const byEmail=await req(`/api/drafts/${p.id}/collaborators`,'POST',{email:friend.email},owner);assert.equal(byEmail.status,201);noEmail(byEmail.data);assert.ok(!('universityId' in byEmail.data));
   const codes=[];for(let i=0;i<10;i++)codes.push((await req(`/api/drafts/${p.id}/collaborators`,'POST',{email:'probe'+i+'@example.com'},owner)).status);
   assert.deepEqual([...new Set(codes)],[404,429].filter(c=>codes.includes(c)));assert.equal(codes.at(-1),429,'email invitations stop after ten an hour');
   assert.equal((await req(`/api/drafts/${p.id}/collaborators`,'POST',{userId:stranger.id},owner)).status,201,'username invitations remain available');
   await req(`/api/drafts/${p.id}/collaborators/${stranger.id}`,'DELETE',{},owner);
  });

  let comment,commentInput;
  await t.test('comment retries are recognised and comment bursts are limited',async()=>{
   const input={body:'See you there',clientId:randomUUID()};commentInput=input;
   const first=await req(`/api/posters/${p.id}/comments`,'POST',input,friend);assert.equal(first.status,201);comment=first.data;
   const retry=await req(`/api/posters/${p.id}/comments`,'POST',input,friend);assert.equal(retry.status,200);assert.equal(retry.data.id,comment.id);
   assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{...input,body:'Changed'},friend)).status,409);
   assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{body:'bad id',clientId:'nope'},friend)).status,400);
   assert.equal((await req(`/api/posters/${p.id}/comments`)).data.filter(c=>c.body==='See you there').length,1);
   for(let i=0;i<4;i++)assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{body:'burst '+i,clientId:randomUUID()},friend)).status,201);
   assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{body:'too fast',clientId:randomUUID()},friend)).status,429);
   assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{body:'other people may still comment'},stranger)).status,201);
  });

  await t.test('comment authors and poster creators can remove comments; others cannot',async()=>{
   const list=(await req(`/api/posters/${p.id}/comments`)).data,mine=list.find(c=>c.body==='burst 0'),theirs=list.find(c=>c.body==='burst 1'),strangerComment=list.find(c=>c.authorId===stranger.id);
   assert.equal((await req(`/api/posters/${p.id}/comments/${mine.id}`,'DELETE',{})).status,401);
   assert.equal((await req(`/api/posters/${p.id}/comments/${mine.id}`,'DELETE',{},stranger)).status,403);
   assert.equal((await req(`/api/posters/${p.id}/comments/${mine.id}`,'DELETE',{},other)).status,403,'another campus cannot moderate');
   assert.equal((await req(`/api/posters/${p.id}/comments/${mine.id}`,'DELETE',{},friend)).status,200,'author removes own comment');
   assert.equal((await req(`/api/posters/${p.id}/comments/${theirs.id}`,'DELETE',{},owner)).status,200,'poster creator removes a comment');
   assert.equal((await req(`/api/posters/${p.id}/comments/${strangerComment.id}`,'DELETE',{},owner)).status,200);
   assert.equal((await req(`/api/posters/${p.id}/comments/${mine.id}`,'DELETE',{},friend)).status,404);
   const after=(await req(`/api/posters/${p.id}/comments`)).data;assert.ok(!after.some(c=>[mine.id,theirs.id].includes(c.id)));
  });

  await t.test('comment reads are paged at 100 with a stable cursor',async()=>{
   const db=new DatabaseSync(join(dir,'campuswall.sqlite'));db.exec('PRAGMA busy_timeout=5000');
   const insert=db.prepare('INSERT INTO comments (id,posterId,authorId,body,createdAt,updatedAt) VALUES (?,?,?,?,?,?)');
   for(let i=0;i<120;i++){const at=new Date(Date.UTC(2026,0,1,0,0,i)).toISOString();insert.run(randomUUID(),p.id,stranger.id,'page '+i,at,at);}db.close();
   const page=(await req(`/api/posters/${p.id}/comments`)).data;assert.equal(page.length,100);assert.equal(page.at(-1).body,'page 119','newest comments come last');
   const older=(await req(`/api/posters/${p.id}/comments?before=${page[0].id}`)).data;assert.ok(older.length>0&&older.length<100);assert.ok(!older.some(c=>page.some(n=>n.id===c.id)));assert.equal(older.at(-1).body,'page 19');
   assert.equal((await req(`/api/posters/${p.id}/comments?before=${randomUUID()}`)).status,400);
  });

  await t.test('repeated friend requests notify once a day and are rate limited',async()=>{
   for(let i=0;i<5;i++){assert.equal((await req('/api/community/friends/'+owner.id,'POST',{},stranger)).status,200);assert.equal((await req('/api/community/friends/'+owner.id,'DELETE',{},stranger)).status,200);}
   const notes=(await req('/api/community/notifications','GET',null,owner)).data.notifications.filter(n=>n.kind==='friend');assert.equal(notes.length,1);
   const codes=[];for(let i=0;i<20;i++){codes.push((await req('/api/community/friends/'+owner.id,'POST',{},stranger)).status);await req('/api/community/friends/'+owner.id,'DELETE',{},stranger);}
   assert.equal(codes.at(-1),429);assert.ok(codes.slice(0,15).every(c=>c===200));
  });

  await t.test('blocking stops direct contact both ways and ends the friendship',async()=>{
   assert.equal((await req('/api/community/friends/'+friend.id,'POST',{},owner)).status,200);assert.equal((await req('/api/community/friends/'+owner.id,'POST',{},friend)).status,200);
   const convo=(await req('/api/messages/conversations','POST',{userId:friend.id},owner)).data.conversation;
   assert.equal((await req(`/api/messages/conversations/${convo.id}/messages`,'POST',{body:'before block',clientId:randomUUID()},friend)).status,201);
   assert.equal((await req('/api/blocks/'+friend.id,'POST',{})).status,401);
   assert.equal((await req('/api/blocks/'+owner.id,'POST',{},owner)).status,400);
   assert.equal((await req('/api/blocks/'+friend.id,'POST',{},owner)).status,200);
   const blocked=(await req('/api/blocks','GET',null,owner)).data.blocked;assert.deepEqual(blocked.map(b=>b.id),[friend.id]);noEmail(blocked);
   assert.deepEqual((await req('/api/blocks','GET',null,friend)).data.blocked,[],'the blocked student is not shown the block');
   assert.ok(!(await req('/api/community/friends','GET',null,owner)).data.friends.some(f=>f.person.id===friend.id),'friendship removed');
   for(const [who,target] of [[friend,owner],[owner,friend]]){
    assert.equal((await req('/api/messages/conversations','POST',{userId:target.id},who)).status,403);
    assert.equal((await req(`/api/messages/conversations/${convo.id}/messages`,'POST',{body:'after block',clientId:randomUUID()},who)).status,403);
    assert.equal((await req('/api/community/friends/'+target.id,'POST',{},who)).status,403);
    assert.equal((await req(`/api/profiles/${target.id}/notes`,'POST',{body:'hi',clientId:randomUUID()},who)).status,403);
    assert.equal((await req('/api/games/rooms','POST',{game:'gomoku',inviteeId:target.id,clientId:randomUUID()},who)).status,403);
   }
   assert.equal((await req(`/api/drafts/${p.id}/collaborators/${friend.id}`,'DELETE',{},owner)).status,200);
   assert.equal((await req(`/api/drafts/${p.id}/collaborators`,'POST',{userId:friend.id},owner)).status,403);
   assert.equal((await req(`/api/messages/conversations/${convo.id}/messages`,'GET',null,owner)).status,200,'existing history stays readable');
   assert.equal((await req(`/api/messages/conversations/${convo.id}/messages`,'POST',{body:'hello stranger',clientId:randomUUID()},stranger)).status,404,'unrelated students are unaffected by the block');
   assert.equal((await req('/api/messages/conversations','POST',{userId:owner.id},stranger)).status,200);
  });

  await t.test('a stalled image upload neither blocks other uploads nor holds a slot forever',async()=>{
   const draft=(await req('/api/drafts','POST',{universityId:'anu',title:'Uploads'},stranger)).data,own=(await req('/api/drafts','POST',{universityId:'anu',title:'Mine'},owner)).data;
   const slow=http.request(`${base}/api/drafts/${draft.id}/image`,{method:'POST',headers:{'content-type':'image/png','content-length':4000000,cookie:stranger.cookie}});const closed=new Promise(r=>slow.on('close',r));slow.on('error',()=>{});slow.write(Buffer.alloc(16));
   await new Promise(r=>setTimeout(r,300));
   const other=await fetch(`${base}/api/drafts/${own.id}/image`,{method:'POST',headers:{'content-type':'image/png',cookie:owner.cookie},body:Buffer.alloc(64)});
   assert.equal(other.status,400,'another student is processed, not told to wait');
   await closed;
   const again=await fetch(`${base}/api/drafts/${draft.id}/image`,{method:'POST',headers:{'content-type':'image/png',cookie:stranger.cookie},body:Buffer.alloc(64)});assert.equal(again.status,400,'the timed-out slot was released');
  });

  await t.test('draft creation is throttled and capped at 50 open drafts across restarts',async()=>{
   let created=0;const make=async()=>(await req('/api/drafts','POST',{universityId:'anu',title:'Draft'},friend)).status;
   while(created<20){assert.equal(await make(),201);created++;}assert.equal(await make(),429,'burst limit');
   await stop();await start();await login(friend);while(created<40){assert.equal(await make(),201);created++;}
   await stop();await start();await login(friend);while(created<50){assert.equal(await make(),201);created++;}
   const capped=await req('/api/drafts','POST',{universityId:'anu',title:'Draft'},friend);assert.equal(capped.status,429);assert.match(capped.data.error,/50 unpublished drafts/);
  });

  await t.test('blocks and comment retries survive a restart',async()=>{
   await login(owner);await login(friend);
   assert.equal((await req('/api/messages/conversations','POST',{userId:owner.id},friend)).status,403);
   assert.equal((await req('/api/blocks/'+friend.id,'DELETE',{},owner)).status,200);
   assert.equal((await req('/api/messages/conversations','POST',{userId:owner.id},friend)).status,200,'unblocking restores contact');
   const retry=await req(`/api/posters/${p.id}/comments`,'POST',commentInput,friend);assert.equal(retry.status,200);assert.equal(retry.data.id,comment.id);
  });
 }finally{if(child?.exitCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

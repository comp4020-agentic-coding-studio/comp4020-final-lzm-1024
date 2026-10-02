import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync,mkdirSync,rmSync,readFileSync } from 'node:fs';
import { resolve,join,sep } from 'node:path';
import { randomUUID,scryptSync,createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';

test('private messages, user discovery, permissions and persistence',{timeout:45000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'messaging-')),base='http://127.0.0.1:18083',clients=[];let child;
  // Start with a real version-three account and session, rather than only fresh accounts.
  const fixture=new DatabaseSync(join(dir,'campuswall.sqlite'));fixture.exec(readFileSync('migrations/001-campuswall.sql','utf8'));
  const salt='migration-fixture';fixture.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('existing-user','Existing Student','old@example.com',`${salt}:${scryptSync('old-password',salt,64).toString('hex')}`,new Date().toISOString());
  fixture.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('campus-team','CampusWall team','team@example.com','!disabled',new Date().toISOString());
  fixture.prepare('INSERT INTO universities VALUES (?,?,?,?)').run('anu','anu','Australian National University','ANU');
  const oldToken='a'.repeat(64),oldCookie=`campus_session=${oldToken}`;fixture.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(oldToken).digest('hex'),'existing-user',Date.now()+86400000);
  fixture.exec('PRAGMA user_version=1; COMMIT;');for(const path of ['migrations/002-discovery.sql','migrations/003-public-chat.sql'])fixture.exec(readFileSync(path,'utf8'));fixture.close();
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18083',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',c=>output+=c);for(let i=0;i<100;i++){try{await fetch(base+'/api/health');return;}catch{}if(child.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,50));}throw new Error(output||'Server did not start');}
  async function stop(){const exited=once(child,'exit');child.kill();await exited;}
  async function request(path,method='GET',data,cookie){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name,username){const r=await request('/api/auth/register','POST',{name,username,universityId:'anu',email:`${randomUUID()}@example.com`,password:'correct-password'});assert.equal(r.status,200);return{...r.data.user,cookie:r.cookie};}
  async function socket(u,query='inbox=1'){const ws=new WebSocket(`ws://127.0.0.1:18083/ws?${query}`,{headers:{origin:base,...(u?{cookie:u.cookie}:{})}});clients.push(ws);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await once(ws,'open');return ws;}
  async function wait(ws,predicate){for(let i=0;i<100;i++){const index=ws.messages.findIndex(predicate);if(index>=0)return ws.messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,20));}throw new Error('Expected private socket message not received');}
  async function rejectedSocket(cookie,query='inbox=1',origin=base){const ws=new WebSocket(`ws://127.0.0.1:18083/ws?${query}`,{headers:{origin,...(cookie?{cookie}:{})}});return new Promise((resolve,reject)=>{ws.on('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});ws.on('error',()=>{});ws.on('open',()=>{ws.terminate();reject(new Error('Private socket was incorrectly accepted'));});});}
  let a,b,c,conversation,first,wa,wb,wc,publicReader;
  try{
    await start();
    await t.test('migration preserves existing login and gives old accounts a unique searchable username',async()=>{
      const me=await request('/api/auth/me','GET',null,oldCookie);assert.equal(me.status,200);assert.equal(me.data.user.id,'existing-user');assert.match(me.data.user.username,/^existing_stu_/);assert.ok(!Object.hasOwn(me.data.user,'passwordHash'));
      assert.equal((await request('/api/auth/login','POST',{email:'old@example.com',password:'old-password'})).status,200);
    });
    a=await register('Alex','campus_alex');b=await register('Alex','campus_blair');c=await register('Observer','campus_observer');
    await t.test('search requires login, distinguishes duplicate display names and never reveals email or disabled accounts',async()=>{
      assert.equal((await request('/api/users/search?q=Alex')).status,401);
      const result=(await request('/api/users/search?q=alex','GET',null,c.cookie)).data.users;assert.equal(result.length,2);assert.equal(new Set(result.map(u=>u.username)).size,2);assert.ok(result.every(u=>Object.keys(u).sort().join(',')==='avatarId,id,name,username'));
      assert.equal((await request('/api/users/search?q=@CAMPUS_BLAIR','GET',null,a.cookie)).data.users[0].id,b.id);
      assert.equal((await request('/api/users/search?q=campus_alex','GET',null,a.cookie)).data.users.length,0);
      assert.equal((await request('/api/users/search?q=CampusWall','GET',null,a.cookie)).data.users.length,0);
      assert.deepEqual((await request('/api/users/search?q=','GET',null,a.cookie)).data.users,[]);
      const duplicate=await request('/api/auth/register','POST',{name:'Duplicate',universityId:'anu',username:'CAMPUS_ALEX',email:'duplicate@example.com',password:'correct-password'});assert.equal(duplicate.status,409);
      assert.equal((await request('/api/auth/register','POST',{name:'Invalid',universityId:'anu',username:'not allowed!',email:'invalid@example.com',password:'correct-password'})).status,400);
    });
    await t.test('one private conversation per pair; self, disabled and guest creation are rejected',async()=>{
      assert.equal((await request('/api/messages/conversations','GET')).status,401);
      assert.equal((await request('/api/messages/conversations','POST',{userId:b.id})).status,401);
      assert.equal((await request('/api/messages/conversations','POST',{userId:a.id},a.cookie)).status,400);
      assert.equal((await request('/api/messages/conversations','POST',{userId:'campus-team'},a.cookie)).status,404);
      const result=await request('/api/messages/conversations','POST',{userId:b.id},a.cookie);assert.equal(result.status,200);conversation=result.data.conversation;assert.equal(conversation.peer.id,b.id);
      const reverse=await request('/api/messages/conversations','POST',{userId:a.id},b.cookie);assert.equal(reverse.data.conversation.id,conversation.id);assert.equal(reverse.data.conversation.peer.id,a.id);
      assert.equal((await request('/api/messages/conversations','GET',null,c.cookie)).data.conversations.length,0);
      for(const suffix of ['', '/messages'])assert.equal((await request(`/api/messages/conversations/${conversation.id}${suffix}`,'GET',null,c.cookie)).status,404);
      assert.equal(await rejectedSocket(),401);assert.equal(await rejectedSocket(a.cookie,'inbox=1','https://attacker.example'),403);
    });
    let organiserPoster,organiserConversation;
    await t.test('poster contact resolves the published creator on the server and reuses existing conversations without sending a message',async()=>{
      organiserPoster=(await request('/api/drafts','POST',{universityId:'anu'},b.cookie)).data;
      for(const [field,value] of Object.entries({title:'Organiser contact check',date:'2026-10-20',location:'Campus courtyard'}))organiserPoster=(await request(`/api/drafts/${organiserPoster.id}/fields`,'PATCH',{field,value,clientVersion:organiserPoster.version},b.cookie)).data;
      assert.equal((await request(`/api/drafts/${organiserPoster.id}/publish`,'POST',{},b.cookie)).status,200);
      await request(`/api/drafts/${organiserPoster.id}/collaborators`,'POST',{email:a.email},b.cookie);
      assert.equal((await request(`/api/posters/${organiserPoster.id}`)).data.canMessageOwner,true);
      assert.equal((await request(`/api/posters/${organiserPoster.id}`,'GET',null,b.cookie)).data.canMessageOwner,false);
      const contact=await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id,userId:a.id,ownerId:a.id},c.cookie);assert.equal(contact.status,200);organiserConversation=contact.data.conversation;
      assert.equal(organiserConversation.peer.id,b.id);assert.notEqual(organiserConversation.peer.id,a.id);
      assert.equal((await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id},c.cookie)).data.conversation.id,organiserConversation.id);
      assert.equal((await request('/api/messages/conversations','POST',{userId:b.id},c.cookie)).data.conversation.id,organiserConversation.id);
      assert.deepEqual((await request(`/api/messages/conversations/${organiserConversation.id}/messages`,'GET',null,c.cookie)).data.messages,[]);
    });
    await t.test('poster contact rejects guests, private or removed posters, self-contact, disabled authors and cross-origin requests',async()=>{
      assert.equal((await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id})).status,401);
      assert.equal((await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id},b.cookie)).status,400);
      const cross=await fetch(base+'/api/messages/from-poster',{method:'POST',headers:{cookie:c.cookie,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify({posterId:organiserPoster.id})});assert.equal(cross.status,403);
      const draft=(await request('/api/drafts','POST',{universityId:'anu'},b.cookie)).data;assert.equal((await request('/api/messages/from-poster','POST',{posterId:draft.id},c.cookie)).status,404);
      const database=new DatabaseSync(join(dir,'campuswall.sqlite')),time=new Date().toISOString(),content=JSON.stringify({title:'Sample contact',date:'2026-10-20',location:'Campus',description:'Sample'});
      database.prepare('INSERT INTO posters (id,ownerId,universityId,slug,status,content,publicData,version,createdAt,updatedAt,publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('sample-contact','campus-team','anu','sample-contact','PUBLISHED',content,content,0,time,time,time);database.close();
      assert.equal((await request('/api/posters/sample-contact')).data.canMessageOwner,false);assert.equal((await request('/api/messages/from-poster','POST',{posterId:'sample-contact'},c.cookie)).status,404);
      await request(`/api/drafts/${organiserPoster.id}/unpublish`,'POST',{},b.cookie);assert.equal((await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id},c.cookie)).status,404);
      await request(`/api/drafts/${organiserPoster.id}`,'DELETE',null,b.cookie);assert.equal((await request('/api/messages/from-poster','POST',{posterId:organiserPoster.id},c.cookie)).status,404);
      assert.equal((await request('/api/messages/from-poster','POST',{posterId:'missing'},c.cookie)).status,404);
    });
    wa=await socket(a);wb=await socket(b);wc=await socket(c);publicReader=await socket(null,'wall=anu&chat=1');
    for(const ws of [wa,wb,wc])await wait(ws,m=>m.type==='inbox:state');await wait(publicReader,m=>m.type==='chat:state');
    await t.test('live messages use authenticated identity and reach only both participants',async()=>{
      const input={body:'  \u79c1\u4fe1\u4f60\u597d！\n<script>alert(1)</script>  ',clientId:randomUUID(),authorId:c.id,author:'Forged'};
      const result=await request(`/api/messages/conversations/${conversation.id}/messages`,'POST',input,a.cookie);assert.equal(result.status,201);first=result.data.message;assert.equal(first.authorId,a.id);assert.equal(first.username,a.username);assert.equal(first.body,'\u79c1\u4fe1\u4f60\u597d！\n<script>alert(1)</script>');assert.ok(!first.email&&!first.clientId);
      assert.equal((await wait(wa,m=>m.type==='inbox:message')).message.id,first.id);const delivered=await wait(wb,m=>m.type==='inbox:message');assert.equal(delivered.message.id,first.id);assert.equal(delivered.conversation.unread,1);
      await new Promise(r=>setTimeout(r,80));assert.ok(!wc.messages.some(m=>m.type==='inbox:message'));assert.ok(!publicReader.messages.some(m=>m.type==='inbox:message'));
      assert.equal((await request('/api/chat/messages?university=anu')).data.messages.length,0);
    });
    await t.test('private writes reject outsiders, invalid input, spoofed socket writes and cross-origin requests; retries remain unique',async()=>{
      const path=`/api/messages/conversations/${conversation.id}/messages`;
      assert.equal((await request(path,'POST',{body:'Spy',clientId:randomUUID()},c.cookie)).status,404);
      for(const value of ['', ' ', 'x'.repeat(2001),42])assert.equal((await request(path,'POST',{body:value,clientId:randomUUID()},a.cookie)).status,400);
      assert.equal((await request(path,'POST',{body:'Hello',clientId:'bad'},a.cookie)).status,400);
      const cross=await fetch(base+path,{method:'POST',headers:{cookie:a.cookie,origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify({body:'Cross origin',clientId:randomUUID()})});assert.equal(cross.status,403);
      wa.send(JSON.stringify({type:'private:send',conversationId:conversation.id,body:'Socket spoof'}));assert.equal((await wait(wa,m=>m.type==='error')).status,401);
      const input={body:'Safe retry',clientId:randomUUID()},sent=await request(path,'POST',input,a.cookie),retry=await request(path,'POST',input,a.cookie);assert.equal(sent.status,201);assert.equal(retry.status,200);assert.equal(sent.data.message.id,retry.data.message.id);
      assert.equal((await request(path,'POST',{...input,body:'Changed'},a.cookie)).status,409);
    });
    await t.test('unread positions are participant scoped, monotonic and synced to the reader’s other tabs',async()=>{
      const path=`/api/messages/conversations/${conversation.id}/read`,last=(await request(`/api/messages/conversations/${conversation.id}/messages`,'GET',null,b.cookie)).data.messages.at(-1);
      assert.equal((await request(path,'POST',{throughSeq:last.seq},c.cookie)).status,404);assert.equal((await request(path,'POST',{throughSeq:999999},b.cookie)).status,400);
      const before=(await request('/api/messages/conversations','GET',null,b.cookie)).data.conversations[0];assert.equal(before.unread,2);
      const read=await request(path,'POST',{throughSeq:last.seq},b.cookie);assert.equal(read.data.conversation.unread,0);assert.ok(read.data.conversation.version>before.version);
      assert.equal((await wait(wb,m=>m.type==='inbox:read')).conversation.unread,0);
      assert.equal((await request(path,'POST',{throughSeq:0},b.cookie)).data.conversation.unread,0);
    });
    await t.test('sending limit spans conversations and history paginates in stable order without gaps',async()=>{
      const path=`/api/messages/conversations/${conversation.id}/messages`;let lastInput;
      for(let i=0;i<28;i++){lastInput={body:`Alex ${i}`,clientId:randomUUID()};assert.equal((await request(path,'POST',lastInput,a.cookie)).status,201);}
      assert.equal((await request(path,'POST',{body:'Too many',clientId:randomUUID()},a.cookie)).status,429);assert.equal((await request(path,'POST',lastInput,a.cookie)).status,200);
      const other=(await request('/api/messages/conversations','POST',{userId:c.id},a.cookie)).data.conversation;assert.equal((await request(`/api/messages/conversations/${other.id}/messages`,'POST',{body:'Still limited',clientId:randomUUID()},a.cookie)).status,429);
      for(let i=0;i<25;i++)assert.equal((await request(path,'POST',{body:`Blair ${i}`,clientId:randomUUID()},b.cookie)).status,201);
      const recent=(await request(path,'GET',null,a.cookie)).data;assert.equal(recent.messages.length,50);assert.equal(recent.hasMore,true);
      const older=(await request(`${path}?before=${recent.messages[0].seq}`,'GET',null,a.cookie)).data;assert.equal(older.messages.length,5);assert.equal(older.hasMore,false);
      const combined=[...older.messages,...recent.messages];assert.equal(new Set(combined.map(m=>m.id)).size,55);assert.ok(combined.every((m,i)=>!i||m.seq>combined[i-1].seq));
      const catchup=(await request(`${path}?after=${combined[0].seq}`,'GET',null,a.cookie)).data;assert.equal(catchup.messages.length,50);assert.equal(catchup.hasMore,true);assert.equal(catchup.messages[0].id,combined[1].id);
      assert.equal((await request(`${path}?before=bad`,'GET',null,a.cookie)).status,400);assert.equal((await request(`${path}?before=1&after=2`,'GET',null,a.cookie)).status,400);
    });
    await t.test('reconnect and restart restore private history, unique usernames and read positions',async()=>{
      for(const ws of clients)ws.close();await stop();await start();
      const me=(await request('/api/auth/me','GET',null,a.cookie)).data.user;assert.equal(me.username,'campus_alex');
      const history=(await request(`/api/messages/conversations/${conversation.id}/messages`,'GET',null,a.cookie)).data;assert.equal(history.messages.length,50);
      const restored=await socket(b);const state=await wait(restored,m=>m.type==='inbox:state');assert.equal(state.conversations[0].unread,28);
      assert.equal((await request(`/api/messages/conversations/${conversation.id}/messages`,'GET',null,c.cookie)).status,404);
    });
    await t.test('logout and expired sessions revoke inbox delivery and all private reads and writes',async()=>{
      const expired=await register('Expired','campus_expired');const privatePair=(await request('/api/messages/conversations','POST',{userId:c.id},expired.cookie)).data.conversation;
      const expiredSocket=await socket(expired);await wait(expiredSocket,m=>m.type==='inbox:state');const closed=once(expiredSocket,'close');
      const database=new DatabaseSync(join(dir,'campuswall.sqlite'));database.prepare('UPDATE sessions SET expiresAt=0 WHERE userId=?').run(expired.id);database.close();
      assert.equal((await request(`/api/messages/conversations/${privatePair.id}/messages`,'POST',{body:'No expired delivery',clientId:randomUUID()},c.cookie)).status,201);assert.equal((await closed)[0],4001);assert.ok(!expiredSocket.messages.some(m=>m.type==='inbox:message'));
      assert.equal((await request('/api/messages/conversations','GET',null,expired.cookie)).status,401);
      await request('/api/auth/logout','POST',{},a.cookie);assert.equal((await request(`/api/messages/conversations/${conversation.id}/messages`,'GET',null,a.cookie)).status,401);assert.equal(await rejectedSocket(a.cookie),401);
      assert.equal((await request(`/api/messages/conversations/${conversation.id}/messages`,'GET',null,b.cookie)).status,200);
    });
  }finally{for(const ws of clients)ws.terminate();if(child?.exitCode===null)await stop();if(!resolve(dir).startsWith(root+sep))throw new Error('Cleanup outside test directory');rmSync(dir,{recursive:true,force:true});}
});

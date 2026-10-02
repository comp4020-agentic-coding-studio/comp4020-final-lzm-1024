import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID,scryptSync,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';

test('fixed account universities, migration and isolated public chat',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'campus-access-')),base='http://127.0.0.1:18085',clients=[];let child;
  const fixture=new DatabaseSync(join(dir,'campuswall.sqlite'));fixture.exec(readFileSync('migrations/001-campuswall.sql','utf8'));
  for(const university of ['anu','usyd','unsw','unimelb'])fixture.prepare('INSERT INTO universities VALUES (?,?,?,?)').run(university,university,university,university);
  const time=new Date().toISOString(),salt='campus-migration',oldToken='b'.repeat(64),oldCookie=`campus_session=${oldToken}`;
  fixture.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('legacy-student','Legacy Student','legacy@example.com',`${salt}:${scryptSync('old-password',salt,64).toString('hex')}`,time);
  fixture.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(oldToken).digest('hex'),'legacy-student',Date.now()+86400000);
  fixture.exec('PRAGMA user_version=1; COMMIT;');for(const file of ['002-discovery.sql','003-public-chat.sql','004-private-messages.sql'])fixture.exec(readFileSync('migrations/'+file,'utf8'));
  fixture.prepare('INSERT INTO chat_messages (id,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?)').run('old-shared','legacy-student',randomUUID(),'Earlier shared conversation',time);fixture.close();
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18085',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',c=>errors+=c);for(let i=0;i<100;i++){try{await fetch(base+'/api/health');return;}catch{}if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,30));}throw Error(errors||'Server did not start');}
  async function stop(){const exited=once(child,'exit');child.kill();await exited;}
  async function request(path,method='GET',data,cookie){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  async function register(universityId){const email=randomUUID()+'@example.com',r=await request('/api/auth/register','POST',{name:universityId,email,password:'correct-password',universityId});assert.equal(r.status,200);return {...r.data.user,email,cookie:r.cookie};}
  async function socket(query,cookie){const ws=new WebSocket(base.replace('http','ws')+'/ws?'+query,{headers:{origin:base,...(cookie?{cookie}:{})}});clients.push(ws);ws.messages=[];ws.on('message',data=>ws.messages.push(JSON.parse(data)));await once(ws,'open');return ws;}
  async function wait(ws,type){for(let i=0;i<100;i++){const index=ws.messages.findIndex(m=>m.type===type);if(index>=0)return ws.messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,20));}throw Error('Expected socket message not received');}
  async function rejectedSocket(query,cookie){const ws=new WebSocket(base.replace('http','ws')+'/ws?'+query,{headers:{origin:base,...(cookie?{cookie}:{})}});return new Promise((resolve,reject)=>{ws.on('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});ws.on('error',()=>{});ws.on('open',()=>{ws.terminate();reject(Error('Forbidden socket accepted'));});});}
  let anu,sydney,poster,anuReader,sydneyReader;
  try{
    await start();
    await t.test('older passwords and sessions survive; unassigned accounts must explicitly select a campus',async()=>{
      const me=await request('/api/auth/me','GET',null,oldCookie);assert.equal(me.data.user.id,'legacy-student');assert.equal(me.data.user.universityId,null);
      const login=await request('/api/auth/login','POST',{email:'legacy@example.com',password:'old-password',universityId:'usyd'});assert.equal(login.status,200);assert.equal(login.data.user.universityId,null);
      assert.equal((await request('/api/posters?university=anu','GET',null,oldCookie)).status,409);
      assert.equal((await request('/api/chat/messages','POST',{body:'Before choosing',clientId:randomUUID(),universityId:'anu'},oldCookie)).status,409);
      assert.equal((await request('/api/auth/university','POST',{universityId:'anu'})).status,401);
      assert.equal((await request('/api/auth/university','POST',{universityId:'invalid'},oldCookie)).status,400);
      assert.equal((await request('/api/auth/university','POST',{universityId:'anu'},oldCookie)).data.user.universityId,'anu');
      assert.equal((await request('/api/auth/university','POST',{universityId:'anu'},oldCookie)).status,200);
      assert.equal((await request('/api/auth/university','POST',{universityId:'usyd'},oldCookie)).status,409);
      const store=new DatabaseSync(join(dir,'campuswall.sqlite'));assert.throws(()=>store.prepare('UPDATE users SET universityId=? WHERE id=?').run('usyd','legacy-student'));assert.equal(store.prepare('SELECT COUNT(*) n FROM chat_messages WHERE id=? AND universityId IS NULL').get('old-shared').n,1);store.close();
      for(const university of ['anu','usyd'])assert.equal((await request(`/api/chat/messages?university=${university}`)).data.messages.length,0);
    });
    await t.test('registration requires a valid campus and login cannot change the saved university',async()=>{
      for(const universityId of [undefined,'invalid'])assert.equal((await request('/api/auth/register','POST',{name:'Invalid campus',email:randomUUID()+'@example.com',password:'correct-password',universityId})).status,400);
      anu=await register('anu');sydney=await register('usyd');
      const login=await request('/api/auth/login','POST',{email:anu.email,password:'correct-password',universityId:'usyd'});assert.equal(login.data.user.universityId,'anu');
      assert.equal((await request('/api/auth/university','POST',{universityId:'usyd'},anu.cookie)).status,409);
    });
    await t.test('campus access is enforced for lists, clubs, posters, comments, saves, exports and page URLs',async()=>{
      const d=await request('/api/drafts','POST',{universityId:'usyd'},sydney.cookie);poster=d.data;
      for(const [field,value] of [['title','Sydney campus only'],['date','2026-12-01'],['location','Sydney lawn']])poster=(await request(`/api/drafts/${poster.id}/fields`,'PATCH',{field,value,clientVersion:poster.version},sydney.cookie)).data;
      assert.equal((await request(`/api/drafts/${poster.id}/publish`,'POST',{},sydney.cookie)).status,200);
      for(const path of ['/api/posters?university=usyd','/api/clubs?university=usyd',`/api/posters/${poster.id}`,`/api/posters/${poster.id}/comments`,`/api/posters/${poster.id}/calendar`,`/api/posters/${poster.id}/qr`]){assert.equal((await fetch(base+path)).status,200);assert.equal((await fetch(base+path,{headers:{cookie:anu.cookie}})).status,403);}
      for(const action of ['comments','save'])assert.equal((await request(`/api/posters/${poster.id}/${action}`,'POST',{body:'Wrong campus'},anu.cookie)).status,403);
      assert.equal((await request('/api/messages/from-poster','POST',{posterId:poster.id},anu.cookie)).status,403);
      for(const path of ['/usyd','/usyd/clubs',`/usyd/posters/${poster.slug}`]){const r=await fetch(base+path,{headers:{cookie:anu.cookie},redirect:'manual'});assert.equal(r.status,302);assert.ok(r.headers.get('location').startsWith('/anu'));}
      assert.equal((await request('/api/clubs?university=anu','GET',null,anu.cookie)).status,200);
    });
    await t.test('foreign-campus drafts, collaboration and WebSocket handshakes cannot bypass the restriction',async()=>{
      assert.equal((await request('/api/drafts','POST',{universityId:'usyd'},anu.cookie)).status,403);
      assert.equal((await request(`/api/drafts/${poster.id}`,'GET',null,anu.cookie)).status,403);
      assert.equal((await request(`/api/drafts/${poster.id}/collaborators`,'POST',{email:anu.email},sydney.cookie)).status,403);
      assert.equal(await rejectedSocket('wall=usyd&chat=1',anu.cookie),403);assert.equal(await rejectedSocket('wall=usyd',anu.cookie),403);assert.equal(await rejectedSocket('poster='+poster.id,anu.cookie),403);
    });
    await t.test('public chat derives the campus from the account and isolates HTTP and live delivery',async()=>{
      anuReader=await socket('wall=anu&chat=1');sydneyReader=await socket('wall=usyd&chat=1');await wait(anuReader,'chat:state');await wait(sydneyReader,'chat:state');
      assert.equal((await request('/api/chat/messages','POST',{universityId:'usyd',body:'Forged campus',clientId:randomUUID()},anu.cookie)).status,403);
      assert.equal((await request('/api/chat/messages?university=usyd','GET',null,anu.cookie)).status,403);
      const input={universityId:'anu',body:'Hello ANU',clientId:randomUUID()},first=await request('/api/chat/messages','POST',input,anu.cookie);assert.equal(first.status,201);assert.equal(first.data.universityId,'anu');assert.equal((await wait(anuReader,'chat:message')).message.id,first.data.id);
      const second=await request('/api/chat/messages','POST',{body:'Hello Sydney',clientId:randomUUID()},sydney.cookie);assert.equal(second.data.universityId,'usyd');assert.equal((await wait(sydneyReader,'chat:message')).message.id,second.data.id);
      assert.ok(!anuReader.messages.some(m=>m.type==='chat:message'));assert.ok(!sydneyReader.messages.some(m=>m.type==='chat:message'));
      assert.equal((await request('/api/chat/messages','POST',input,anu.cookie)).data.id,first.data.id);
      assert.equal((await request('/api/chat/messages?university=anu')).data.messages[0].body,'Hello ANU');assert.equal((await request('/api/chat/messages?university=usyd')).data.messages[0].body,'Hello Sydney');
    });
    await t.test('campus choice and scoped history persist after restart; logout restores guest browsing',async()=>{
      for(const ws of clients)ws.close();await stop();await start();
      assert.equal((await request('/api/auth/me','GET',null,anu.cookie)).data.user.universityId,'anu');assert.equal((await request('/api/auth/me','GET',null,oldCookie)).data.user.universityId,'anu');
      assert.equal((await request('/api/chat/messages?university=usyd')).data.messages.length,1);assert.equal((await request('/api/chat/messages?university=anu')).data.messages.length,1);
      await request('/api/auth/logout','POST',{},anu.cookie);assert.equal((await request('/api/clubs?university=usyd','GET',null,anu.cookie)).status,200);
      assert.equal((await request('/api/chat/messages','POST',{body:'Logged out',clientId:randomUUID()},anu.cookie)).status,401);
    });
    const newAccounts=[],readers=[];
    await t.test('the four added campuses support directories, registration, publishing, exports and isolated live channels',async()=>{
      const schools=(await request('/api/universities')).data;assert.equal(schools.length,8);assert.equal(new Set(schools.map(u=>u.id)).size,8);
      for(const [campus,total] of [['monash',114],['uq',221],['uwa',160],['adelaide',169]]){
        const u=await register(campus);newAccounts.push(u);const meta=schools.find(s=>s.id===campus),directory=(await request(`/api/clubs?university=${campus}`)).data;
        assert.equal(directory.total,total);assert.equal(new Set(directory.clubs.map(c=>c.profileUrl)).size,total);assert.ok(directory.clubs.every(c=>c.universityId===campus&&c.interests.length));assert.equal(directory.interests.length,11);
        for(const group of directory.interests)assert.equal(group.count,directory.clubs.filter(c=>c.interests.includes(group.id)).length);
        const tech=(await request(`/api/clubs?university=${campus}&interest=tech`)).data;assert.ok(tech.clubs.length&&tech.clubs.every(c=>c.interests.includes('tech')));
        for(const path of [`/${campus}`,`/${campus}/clubs`,meta.logo.src])assert.equal((await fetch(base+path,{headers:{cookie:u.cookie}})).status,200);
        assert.equal((await request('/api/clubs?university=anu','GET',null,u.cookie)).status,403);assert.equal(await rejectedSocket('wall=anu&chat=1',u.cookie),403);
        assert.equal((await fetch(base+'/anu',{headers:{cookie:u.cookie},redirect:'manual'})).headers.get('location'),'/'+campus);
        assert.equal((await request('/api/auth/university','POST',{universityId:'anu'},u.cookie)).status,409);
        let p=(await request('/api/drafts','POST',{universityId:campus},u.cookie)).data;assert.equal(p.style,meta.style);
        for(const [field,value] of [['title',`${campus} community event`],['date','2026-12-01'],['time','18:30'],['location',meta.locations[0]]])p=(await request(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},u.cookie)).data;
        assert.equal((await request(`/api/drafts/${p.id}/publish`,'POST',{},u.cookie)).status,200);u.posterId=p.id;
        assert.equal((await request(`/api/posters/${p.id}`,'GET',null,u.cookie)).data.timeZone,meta.timeZone);
        const other=newAccounts.find(a=>a.id!==u.id)||sydney;assert.equal((await request(`/api/posters/${p.id}`,'GET',null,other.cookie)).status,403);
        const calendar=await(await fetch(base+`/api/posters/${p.id}/calendar`)).text();assert.ok(calendar.includes(`DTSTART;TZID=${meta.timeZone}:20261201T183000`));
        const ws=await socket(`wall=${campus}&chat=1`);assert.equal((await wait(ws,'chat:state')).universityId,campus);readers.push(ws);
      }
      for(let i=0;i<newAccounts.length;i++){
        const u=newAccounts[i],sent=await request('/api/chat/messages','POST',{body:`Hello ${u.universityId}`,clientId:randomUUID()},u.cookie);assert.equal(sent.status,201);assert.equal((await wait(readers[i],'chat:message')).message.universityId,u.universityId);
        assert.equal((await request('/api/chat/messages?university='+u.universityId)).data.messages.length,1);
        assert.equal((await request('/api/chat/messages','POST',{universityId:'anu',body:'Forged scope',clientId:randomUUID()},u.cookie)).status,403);
      }
      assert.ok(readers.every(ws=>!ws.messages.some(m=>m.type==='chat:message')));
    });
    await t.test('the additive eight-school migration is idempotent and retains old affiliations and new records',async()=>{
      for(const ws of clients)ws.close();await stop();await start();
      const store=new DatabaseSync(join(dir,'campuswall.sqlite'));assert.equal(store.prepare('PRAGMA user_version').get().user_version,13);assert.equal(store.prepare('SELECT COUNT(*) n FROM universities').get().n,8);assert.equal(store.prepare('SELECT universityId FROM users WHERE id=?').get('legacy-student').universityId,'anu');assert.equal(store.prepare('SELECT COUNT(*) n FROM chat_messages WHERE id=?').get('old-shared').n,1);store.close();
      for(const u of newAccounts){assert.equal((await request('/api/auth/me','GET',null,u.cookie)).data.user.universityId,u.universityId);assert.equal((await request(`/api/posters/${u.posterId}`,'GET',null,u.cookie)).status,200);assert.equal((await request(`/api/chat/messages?university=${u.universityId}`)).data.messages.length,1);}
    });
  }finally{for(const ws of clients)ws.terminate();if(child&&child.exitCode===null)await stop();const target=resolve(dir);if(target.startsWith(root+sep)&&target!==root)rmSync(target,{recursive:true,force:true});}
});

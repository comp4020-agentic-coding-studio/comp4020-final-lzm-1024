import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';
import sharp from 'sharp';
import { calendarEvent } from '../calendar.mjs';
import { eventStatus, dayAfter, campusToday } from '../public/event-utils.js';

test('CampusWall product, permissions, collaboration and durable storage', {timeout:45000}, async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});
  const dir=mkdtempSync(join(root,'integration-'));
  // Exercise the actual migration, including private legacy data preservation.
  writeFileSync(join(dir,'poster-studio.json'),JSON.stringify({posters:[
    {id:'old-public',title:'Legacy notice',school:'ANU',owner:'Old owner',published:true,elements:[],comments:[]},
    {id:'old-private',title:'Never expose this',school:'ANU',owner:'Old owner',published:false,elements:[],comments:[]},
  ]}));
  const base='http://127.0.0.1:18081';let child;const clients=[];
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18081',DATA_DIR:dir,EDITING_TTL_MS:'150'},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',c=>output+=c);for(let i=0;i<100;i++){try{await fetch(`${base}/api/health`);return;}catch{}if(child.exitCode!==null)throw new Error(output);await new Promise(r=>setTimeout(r,50));}throw new Error('Server did not start: '+output);}
  async function stop(){const exited=once(child,'exit');child.kill();await exited;}
  async function request(path,method='GET',body,cookie){const r=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name,universityId='anu'){const r=await request('/api/auth/register','POST',{name,universityId,email:`${name}@example.com`,password:'correct-horse-battery'});assert.equal(r.status,200);return{...r.data.user,cookie:r.cookie};}
  async function imageRequest(posterId,bytes,type,u){return fetch(`${base}/api/drafts/${posterId}/image`,{method:'POST',headers:{'content-type':type,...(u?{cookie:u.cookie}:{})},body:bytes});}
  async function connect(posterId,u){const ws=new WebSocket(`ws://127.0.0.1:18081/ws?poster=${posterId}`,{headers:{cookie:u.cookie,origin:base}});clients.push(ws);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await once(ws,'open');ws.initialState=(await wait(ws,m=>m.type==='poster:state')).poster;return ws;}
  async function wait(ws,predicate){for(let i=0;i<100;i++){const index=ws.messages.findIndex(predicate);if(index>=0)return ws.messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,20));}throw new Error('Expected WebSocket message not received');}
  try{
    await start();const a=await register('creator'),b=await register('editor'),c=await register('outsider');let p;
    await t.test('public club directory preserves complete identities, source categories and campus isolation',async()=>{
      const response=await request('/api/clubs?university=anu');assert.equal(response.status,200);const directory=response.data;
      assert.equal(directory.total,236);assert.equal(directory.clubs.length,236);assert.equal(directory.categories.length,16);
      assert.equal(directory.source.url,'https://anusa.com.au/clubs/clubs-list/');assert.ok(Date.parse(directory.retrievedAt));
      assert.equal(new Set(directory.clubs.map(club=>club.id)).size,236);
      for(const club of directory.clubs){assert.equal(club.universityId,'anu');assert.ok(club.name&&!club.name.endsWith('...'));assert.ok(club.categories.length);assert.ok(club.categories.every(category=>directory.categories.includes(category)));const profile=new URL(club.profileUrl);assert.equal(profile.origin,'https://campus.hellorubric.com');assert.equal(club.id,`anusa-${profile.searchParams.get('s')}`);assert.ok(!club.imageUrl||new URL(club.imageUrl).protocol==='https:');}
      assert.ok(directory.clubs.some(club=>club.name==='ANU Artificial Intelligence and Machine Learning Society'));
      const filtered=(await request('/api/clubs?university=anu&q=chess')).data;assert.ok(filtered.clubs.some(club=>club.name==='ANU Chess Society'));
      const sports=(await request('/api/clubs?university=anu&category=Sports%20and%20Fitness')).data;assert.equal(sports.clubs.length,8);assert.ok(sports.clubs.every(club=>club.categories.includes('Sports and Fitness')));
      const intersection=(await request('/api/clubs?university=anu&category=Sports%20and%20Fitness&q=definitely-no-such-club')).data;assert.equal(intersection.clubs.length,0);
      assert.equal((await request('/api/clubs?university=invalid')).status,400);
      assert.equal((await fetch(`${base}/anu/clubs`)).status,200);assert.equal((await fetch(`${base}/anu/clubs/not-found`)).status,404);
      const posters=(await request('/api/posters?university=anu')).data;assert.ok(!posters.some(poster=>poster.id.startsWith('anusa-')));
    });
    for(const [university,total,categoryCount,sourceUrl,profileOrigin,prefix] of [
      ['usyd',301,9,'https://usu.edu.au/clubs/','https://usu.edu.au','usu-'],
      ['unsw',458,16,'https://www.arc.unsw.edu.au/clubs/find-a-club','https://campus.hellorubric.com','arc-'],
      ['unimelb',246,10,'https://umsu.unimelb.edu.au/buddy-up/clubs/clubs-listing/','https://umsu.unimelb.edu.au','umsu-']
    ])await t.test(`${university} public clubs preserve full source identities, categories and campus isolation`,async()=>{
      const response=await request(`/api/clubs?university=${university}`);assert.equal(response.status,200);const directory=response.data;
      assert.equal(directory.total,total);assert.equal(directory.clubs.length,total);assert.equal(directory.categories.length,categoryCount);assert.equal(directory.source.url,sourceUrl);assert.ok(Date.parse(directory.retrievedAt));
      assert.equal(new Set(directory.clubs.map(c=>c.id)).size,total);assert.equal(new Set(directory.clubs.map(c=>c.profileUrl)).size,total);
      for(const club of directory.clubs){assert.equal(club.universityId,university);assert.ok(club.id.startsWith(prefix));assert.ok(club.name&&!club.name.endsWith('...'));assert.ok(club.categories.length);assert.ok(club.categories.every(c=>directory.categories.includes(c)));assert.equal(new URL(club.profileUrl).origin,profileOrigin);assert.ok(!club.imageUrl||new URL(club.imageUrl).protocol==='https:');}
      const chess=(await request(`/api/clubs?university=${university}&q=CHESS`)).data;assert.ok(chess.clubs.some(c=>/chess/i.test(c.name)));assert.ok(chess.clubs.every(c=>c.universityId===university));
      const category=directory.categories[0],filtered=(await request(`/api/clubs?university=${university}&category=${encodeURIComponent(category)}`)).data;assert.ok(filtered.clubs.length>0&&filtered.clubs.length<total);assert.ok(filtered.clubs.every(c=>c.categories.includes(category)));
      assert.equal((await request(`/api/clubs?university=${university}&category=${encodeURIComponent(category)}&q=definitely-no-such-club`)).data.clubs.length,0);
      if(university==='unimelb'){const keywords=(await request('/api/clubs?university=unimelb&q=professional%20services')).data;assert.ok(keywords.clubs.some(c=>c.name==='Accounting Students Association'));}
      assert.equal((await fetch(`${base}/${university}/clubs`)).status,200);assert.equal((await fetch(`${base}/${university}/clubs/not-found`)).status,404);
      assert.ok(!(await request(`/api/posters?university=${university}`)).data.some(p=>p.id.startsWith(prefix)));
    });
    await t.test('interest browsing covers every club, keeps overlapping interests and combines with source filters',async()=>{
      for(const university of ['anu','usyd','unsw','unimelb']){
        const directory=(await request(`/api/clubs?university=${university}`)).data;
        assert.equal(directory.interests.length,11);assert.equal(new Set(directory.interests.map(g=>g.id)).size,11);
        for(const club of directory.clubs){assert.ok(club.interests.length);assert.equal(new Set(club.interests).size,club.interests.length);assert.ok(club.interests.every(id=>directory.interests.some(g=>g.id===id)));}
        for(const group of directory.interests){const expected=directory.clubs.filter(c=>c.interests.includes(group.id));assert.equal(group.count,expected.length);const filtered=(await request(`/api/clubs?university=${university}&interest=${group.id}`)).data;assert.equal(filtered.clubs.length,expected.length);assert.ok(filtered.clubs.every(c=>c.universityId===university&&c.interests.includes(group.id)));}
        const tech=(await request(`/api/clubs?university=${university}&interest=tech&q=ARTIFICIAL%20INTELLIGENCE`)).data;assert.ok(tech.clubs.length>0);assert.ok(tech.clubs.some(c=>/artificial intelligence/i.test(c.name)));assert.ok(tech.clubs.every(c=>`${c.name} ${c.categories.join(' ')} ${c.keywords||''}`.toLowerCase().includes('artificial intelligence')));
        const chess=(await request(`/api/clubs?university=${university}&interest=hobbies&q=chess`)).data;assert.ok(chess.clubs.length>0);const category=chess.clubs[0].categories[0];const combined=(await request(`/api/clubs?university=${university}&interest=hobbies&q=chess&category=${encodeURIComponent(category)}`)).data;assert.ok(combined.clubs.length>0);assert.ok(combined.clubs.every(c=>c.categories.includes(category)&&c.interests.includes('hobbies')&&/chess/i.test(c.name)));
        assert.equal((await request(`/api/clubs?university=${university}&interest=nonexistent`)).data.clubs.length,0);
      }
    });
    await t.test('guests browse only selected campus; legacy published notices survive',async()=>{const r=await request('/api/posters?university=anu');assert.equal(r.status,200);assert.ok(r.data.length>=7);assert.ok(r.data.every(p=>p.universityId==='anu'&&p.status==='PUBLISHED'));assert.ok(r.data.some(p=>p.id==='old-public'));assert.ok(!r.data.some(p=>p.id==='old-private'));assert.equal((await request('/api/drafts/old-private')).status,401);});
    await t.test('authentication uses server sessions and rejects impersonation',async()=>{assert.equal((await request('/api/drafts','POST',{universityId:'anu',owner:'creator'})).status,401);assert.equal((await request('/api/auth/login','POST',{email:a.email,password:'wrong-password'})).status,401);assert.equal((await request('/api/auth/me','GET',null,a.cookie)).data.user.id,a.id);});
    await t.test('draft creation is private and owner-only',async()=>{const r=await request('/api/drafts','POST',{universityId:'anu',template:'minimal'},a.cookie);assert.equal(r.status,201);p=r.data;assert.equal(p.status,'DRAFT');assert.equal((await request(`/api/posters/${p.id}`)).status,404);assert.equal((await request(`/api/drafts/${p.id}`,'GET',null,c.cookie)).status,403);assert.ok(!(await request('/api/posters?university=anu&q=event')).data.some(v=>v.id===p.id));});
    await t.test('publishing validates title, date and location',async()=>{assert.equal((await request(`/api/drafts/${p.id}/publish`,'POST',{},a.cookie)).status,400);});
    await t.test('collaborator relationships are unique and owner-controlled',async()=>{for(let i=0;i<2;i++)assert.equal((await request(`/api/drafts/${p.id}/collaborators`,'POST',{email:b.email},a.cookie)).status,201);assert.equal((await request(`/api/drafts/${p.id}/collaborators`,'GET',null,a.cookie)).data.length,1);assert.equal((await request(`/api/drafts/${p.id}`,'GET',null,b.cookie)).status,200);for(const action of ['publish','unpublish','collaborators'])assert.equal((await request(`/api/drafts/${p.id}/${action}`,'POST',{email:c.email},b.cookie)).status,403);assert.equal((await request(`/api/drafts/${p.id}`,'DELETE',null,b.cookie)).status,403);});
    await t.test('unauthorised WebSocket handshake is rejected',async()=>{const ws=new WebSocket(`ws://127.0.0.1:18081/ws?poster=${p.id}`,{headers:{cookie:c.cookie,origin:base}});const status=await new Promise(resolve=>{ws.on('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});ws.on('error',()=>{});});assert.equal(status,403);});
    const wa=await connect(p.id,a),wb=await connect(p.id,b);
    await t.test('presence includes both independent sessions',async()=>{const msg=await wait(wa,m=>m.type==='presence'&&m.people.length===2);assert.deepEqual(new Set(msg.people.map(u=>u.id)),new Set([a.id,b.id]));});
    await t.test('editing-field hints are broadcast, validated and expire without changing poster versions',async()=>{
      wa.send(JSON.stringify({type:'poster:editing',posterId:p.id,field:'title'}));
      const active=await wait(wb,m=>m.type==='presence'&&m.people.some(person=>person.id===a.id&&person.editingFields.includes('title')));
      assert.equal(active.people.find(person=>person.id===a.id).editingFields[0],'title');
      assert.equal((await request(`/api/drafts/${p.id}`,'GET',null,a.cookie)).data.version,0);
      wa.send(JSON.stringify({type:'poster:editing',posterId:p.id,field:'ownerId'}));assert.equal((await wait(wa,m=>m.type==='error')).status,400);
      await wait(wb,m=>m.type==='presence'&&m.people.some(person=>person.id===a.id&&person.editingFields.length===0));
    });
    await t.test('different-field concurrent edits both persist and broadcast',async()=>{wa.send(JSON.stringify({type:'poster:update',posterId:p.id,field:'title',value:'An event together',clientVersion:0,requestId:'title'}));wb.send(JSON.stringify({type:'poster:update',posterId:p.id,field:'date',value:'2026-10-15',clientVersion:0,requestId:'date'}));await wait(wa,m=>m.type==='poster:updated'&&m.poster.version===2);const msg=await wait(wb,m=>m.type==='poster:updated'&&m.poster.version===2);assert.equal(msg.poster.title,'An event together');assert.equal(msg.poster.date,'2026-10-15');p=msg.poster;});
    await t.test('same-field conflict follows server acceptance order',async()=>{wa.send(JSON.stringify({type:'poster:update',posterId:p.id,field:'title',value:'First title',clientVersion:2}));const first=await wait(wb,m=>m.type==='poster:updated'&&m.poster.version===3);assert.equal(first.poster.title,'First title');wb.send(JSON.stringify({type:'poster:update',posterId:p.id,field:'title',value:'Last accepted title',clientVersion:2}));const last=await wait(wa,m=>m.type==='poster:updated'&&m.poster.version===4);assert.equal(last.poster.title,'Last accepted title');});
    await t.test('field whitelist, valid dates and versions are enforced',async()=>{for(const change of [{field:'ownerId',value:c.id},{field:'date',value:'2026-02-30'},{field:'template',value:'arbitrary'},{field:'heroImageUrl',value:'javascript:alert(1)'}])assert.equal((await request(`/api/drafts/${p.id}/fields`,'PATCH',{...change,clientVersion:4},b.cookie)).status,400);assert.equal((await request(`/api/drafts/${p.id}/fields`,'PATCH',{field:'title',value:'Invalid',clientVersion:999},b.cookie)).status,400);wb.send(JSON.stringify({type:'poster:update',posterId:p.id,field:'status',value:'PUBLISHED',clientVersion:4}));assert.equal((await wait(wb,m=>m.type==='error')).status,400);});
    await t.test('owner publishes to correct campus; snapshot protects public content',async()=>{p=(await request(`/api/drafts/${p.id}/fields`,'PATCH',{field:'location',value:'Kambri',clientVersion:4},a.cookie)).data;assert.equal((await request(`/api/drafts/${p.id}/publish`,'POST',{},a.cookie)).status,200);assert.ok((await request('/api/posters?university=anu')).data.some(v=>v.id===p.id));assert.ok(!(await request('/api/posters?university=usyd')).data.some(v=>v.id===p.id));const published=(await request(`/api/posters/${p.id}`)).data;p=(await request(`/api/drafts/${p.id}/fields`,'PATCH',{field:'title',value:'Private revision',clientVersion:published.version},b.cookie)).data;assert.equal((await request(`/api/posters/${p.id}`)).data.title,'Last accepted title');assert.equal(p.hasUnpublishedChanges,true);});
    await t.test('comments require login and reject empty or oversized text',async()=>{assert.equal((await request(`/api/posters/${p.id}/comments`,'POST',{body:'Hello'})).status,401);for(const text of [' ', 'x'.repeat(1001)])assert.equal((await request(`/api/posters/${p.id}/comments`,'POST',{body:text},c.cookie)).status,400);assert.equal((await request(`/api/posters/${p.id}/comments`,'POST',{body:'<script>alert(1)</script>'},c.cookie)).status,201);const list=(await request(`/api/posters/${p.id}/comments`)).data;assert.equal(list[0].author,'outsider');assert.equal(list[0].body,'<script>alert(1)</script>');});
    await t.test('reconnect loads authoritative saved draft',async()=>{wb.close();await once(wb,'close');const replacement=await connect(p.id,b);assert.equal(replacement.initialState.title,'Private revision');assert.equal(replacement.initialState.version,p.version);});
    await t.test('removing a collaborator revokes HTTP and open socket access',async()=>{const active=clients.at(-1);const closed=once(active,'close');await request(`/api/drafts/${p.id}/collaborators/${b.id}`,'DELETE',null,a.cookie);assert.equal((await closed)[0],4003);assert.equal((await request(`/api/drafts/${p.id}`,'GET',null,b.cookie)).status,403);});
    await t.test('cross-origin mutations and handshakes are blocked',async()=>{const res=await fetch(`${base}/api/drafts`,{method:'POST',headers:{origin:'https://attacker.example',cookie:a.cookie,'content-type':'application/json'},body:JSON.stringify({universityId:'anu'})});assert.equal(res.status,403);});
    await t.test('server restart preserves draft, publication, comments and sessions',async()=>{for(const ws of clients)ws.close();await stop();await start();const saved=await request(`/api/drafts/${p.id}`,'GET',null,a.cookie);assert.equal(saved.status,200);assert.equal(saved.data.title,'Private revision');assert.equal((await request(`/api/posters/${p.id}`)).data.title,'Last accepted title');assert.equal((await request(`/api/posters/${p.id}/comments`)).data.length,1);});
    await t.test('campus metadata and signature palettes apply to new drafts',async()=>{
      const campuses=(await request('/api/universities')).data;assert.equal(campuses.length,8);
      for(const uni of campuses){assert.ok(uni.locations.length>=3);assert.ok(uni.mapUrl.startsWith('https://'));const campusUser=uni.id==='anu'?a:await register(`palette-${uni.id}`,uni.id);const created=(await request('/api/drafts','POST',{universityId:uni.id},campusUser.cookie)).data;assert.equal(created.style,`campus-${uni.id}`);await request(`/api/drafts/${created.id}`,'DELETE',null,campusUser.cookie);}
    });
    let uploaded,latest;
    const image=await sharp({create:{width:2000,height:1000,channels:3,background:'#be830e'}}).png().toBuffer();
    await t.test('image uploads validate account, access, actual type and size',async()=>{
      assert.equal((await imageRequest(p.id,image,'image/png')).status,401);
      assert.equal((await imageRequest(p.id,image,'image/png',c)).status,403);
      assert.equal((await imageRequest(p.id,Buffer.from('<svg></svg>'),'image/svg+xml',a)).status,400);
      assert.equal((await imageRequest(p.id,Buffer.from('<script>bad</script>'),'image/png',a)).status,400);
      assert.equal((await imageRequest(p.id,image,'image/jpeg',a)).status,400);
      assert.equal((await imageRequest(p.id,new Uint8Array(5*1024*1024+1),'image/png',a)).status,413);
    });
    await t.test('uploaded images resize to WebP and remain private until publication',async()=>{
      const response=await imageRequest(p.id,image,'image/png',a);assert.equal(response.status,201);p=await response.json();uploaded=p.heroImageUrl;assert.match(uploaded,/^\/media\/[a-f0-9-]{36}$/);
      assert.equal((await fetch(base+uploaded)).status,404);
      const authorized=await fetch(base+uploaded,{headers:{cookie:a.cookie}});assert.equal(authorized.status,200);assert.equal(authorized.headers.get('content-type'),'image/webp');
      const metadata=await sharp(Buffer.from(await authorized.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,1600);assert.equal(metadata.height,800);assert.equal(metadata.exif,undefined);
      assert.equal((await request(`/api/drafts/${p.id}/publish`,'POST',{},a.cookie)).status,200);assert.equal((await fetch(base+uploaded)).status,200);
    });
    await t.test('collaborator replacement preserves the public image snapshot; cross-poster references are rejected',async()=>{
      await request(`/api/drafts/${p.id}/collaborators`,'POST',{email:b.email},a.cookie);
      const response=await imageRequest(p.id,image,'image/png',b);assert.equal(response.status,201);p=await response.json();latest=p.heroImageUrl;
      assert.notEqual(latest,uploaded);assert.equal((await fetch(base+uploaded)).status,200);assert.equal((await fetch(base+latest)).status,404);
      const other=(await request('/api/drafts','POST',{universityId:'anu'},c.cookie)).data;
      assert.equal((await request(`/api/drafts/${other.id}/fields`,'PATCH',{field:'heroImageUrl',value:latest,clientVersion:0},c.cookie)).status,400);
      await request(`/api/drafts/${other.id}`,'DELETE',null,c.cookie);
      await request(`/api/drafts/${p.id}/collaborators/${b.id}`,'DELETE',null,a.cookie);
      assert.equal((await fetch(base+latest,{headers:{cookie:b.cookie}})).status,404);
    });
    await t.test('saved events are unique, account-scoped and use only the published snapshot',async()=>{
      assert.equal((await request(`/api/posters/${p.id}/save`,'POST',{})).status,401);
      for(let i=0;i<2;i++)assert.equal((await request(`/api/posters/${p.id}/save`,'POST',{},c.cookie)).status,200);
      const saved=(await request('/api/saved','GET',null,c.cookie)).data;assert.equal(saved.length,1);assert.equal(saved[0].isSaved,true);assert.equal(saved[0].heroImageUrl,uploaded);
      assert.equal((await request('/api/saved','GET',null,a.cookie)).data.length,0);
      await request(`/api/posters/${p.id}/save`,'DELETE',null,a.cookie);assert.equal((await request('/api/saved','GET',null,c.cookie)).data.length,1);
      assert.equal((await request(`/api/posters/${p.id}`,'GET',null,c.cookie)).data.isSaved,true);assert.equal((await request(`/api/posters/${p.id}`)).data.isSaved,false);
    });
    await t.test('calendar export supports all-day notices and local campus time after republishing',async()=>{
      const allDay=await fetch(`${base}/api/posters/${p.id}/calendar`);assert.equal(allDay.status,200);assert.match(allDay.headers.get('content-type'),/text\/calendar/);assert.match(await allDay.text(),/DTSTART;VALUE=DATE:20261015/);
      p=(await request(`/api/drafts/${p.id}/fields`,'PATCH',{field:'time',value:'18:45',clientVersion:p.version},a.cookie)).data;
      await request(`/api/drafts/${p.id}/publish`,'POST',{},a.cookie);
      const timed=await fetch(`${base}/api/posters/${p.id}/calendar`);const content=await timed.text();assert.match(content,/TZID:Australia\/Sydney/);assert.match(content,/DTSTART;TZID=Australia\/Sydney:20261015T184500/);assert.ok(!content.includes('DTEND'));
      assert.equal((await fetch(base+latest)).status,200);assert.equal((await fetch(base+uploaded)).status,404);
    });
    await t.test('QR export is a downloadable public SVG and cannot expose drafts',async()=>{
      const qr=await fetch(`${base}/api/posters/${p.id}/qr?download=1`);assert.equal(qr.status,200);assert.equal(qr.headers.get('content-type'),'image/svg+xml');assert.match(qr.headers.get('content-disposition'),/attachment/);const svg=await qr.text();assert.match(svg,/<svg/);assert.match(svg,/<path/);
      const privatePoster=(await request('/api/drafts','POST',{universityId:'anu'},a.cookie)).data;
      for(const action of ['qr','calendar','save'])assert.equal((await request(`/api/posters/${privatePoster.id}/${action}`,action==='save'?'POST':'GET',action==='save'?{}:null,a.cookie)).status,404);
      await request(`/api/drafts/${privatePoster.id}`,'DELETE',null,a.cookie);
    });
    await t.test('images and saved events survive a second server restart',async()=>{await stop();await start();assert.equal((await fetch(base+latest)).status,200);assert.equal((await request('/api/saved','GET',null,c.cookie)).data.length,1);});
    await t.test('event status and calendar escaping handle date boundaries and UTF-8 safely',async()=>{
      assert.equal(dayAfter('2026-12-31'),'2027-01-01');for(const [date,label] of [['2026-09-30','Ended'],['2026-10-01','Today'],['2026-10-02','Tomorrow'],['2026-10-03','Upcoming']])assert.equal(eventStatus({date},'2026-10-01').label,label);
      const calendar=calendarEvent({...p,publishedAt:'2026-10-01T00:00:00Z',title:'Meet\r\nBEGIN:BAD',description:'\u5b66\u751f\u4e00\u8d77\u505a\u6d77\u62a5'.repeat(30)+', hello; yes',location:'A\\B'},`${base}/anu/posters/test`);
      assert.match(calendar,/SUMMARY:Meet\\nBEGIN:BAD/);assert.ok(!calendar.includes('\r\nBEGIN:BAD'));for(const line of calendar.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.match(calendar,/LOCATION:A\\\\B/);
    });
    await t.test('new campus calendars use local time zones, including half-hour Adelaide and non-DST Brisbane/Perth',async()=>{
      for(const [universityId,zone,standard,daylight] of [['monash','Australia/Melbourne','+1000','+1100'],['uq','Australia/Brisbane','+1000',null],['uwa','Australia/Perth','+0800',null],['adelaide','Australia/Adelaide','+0930','+1030']]){
        const calendar=calendarEvent({...p,universityId,time:'18:45'},base+'/'+universityId);
        assert.ok(calendar.includes(`DTSTART;TZID=${zone}:20261015T184500`));assert.ok(calendar.includes(`TZOFFSETTO:${standard}`));assert.equal(calendar.includes('BEGIN:DAYLIGHT'),!!daylight);if(daylight)assert.ok(calendar.includes(`TZOFFSETTO:${daylight}`));assert.ok(!calendar.includes('DTEND'));
      }
      const boundary=new Date('2026-10-01T15:45:00Z');assert.equal(campusToday(boundary,'Australia/Perth'),'2026-10-01');assert.equal(campusToday(boundary,'Australia/Brisbane'),'2026-10-02');assert.equal(campusToday(boundary,'Australia/Adelaide'),'2026-10-02');
    });
    await t.test('unpublish hides poster, images, saved results and exports; deletion cleans files',async()=>{assert.equal((await request(`/api/drafts/${p.id}/unpublish`,'POST',{},a.cookie)).status,200);assert.equal((await request(`/api/posters/${p.id}`)).status,404);assert.equal((await fetch(base+latest)).status,404);assert.equal((await request('/api/saved','GET',null,c.cookie)).data.length,0);assert.equal((await request(`/api/drafts/${p.id}`,'DELETE',null,a.cookie)).status,200);assert.equal((await request(`/api/drafts/${p.id}`,'GET',null,a.cookie)).status,404);assert.equal(readdirSync(join(dir,'uploads')).length,0);});
    async function chatSocket(query='wall=anu&chat=1'){
      const ws=new WebSocket(`ws://127.0.0.1:18081/ws?${query}`,{headers:{origin:base}});clients.push(ws);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await once(ws,'open');return ws;
    }
    const chatClients=[];let chatMessage;
    await t.test('guests can read public chat history and join live chat but cannot send',async()=>{
      assert.deepEqual((await request('/api/chat/messages?university=anu')).data,{messages:[],limit:100,universityId:'anu'});
      assert.equal((await request('/api/chat/messages','POST',{body:'Anonymous spoof',authorId:a.id,clientId:randomUUID()})).status,401);
      for(const query of ['chat=1&university=anu','wall=anu&chat=1','wall=usyd&chat=1']){const ws=await chatSocket(query);chatClients.push(ws);assert.deepEqual((await wait(ws,message=>message.type==='chat:state')).messages,[]);}
      chatClients[0].send(JSON.stringify({type:'chat:send',body:'Anonymous socket spoof',authorId:a.id}));assert.equal((await wait(chatClients[0],message=>message.type==='error')).status,401);
      assert.equal((await request('/api/chat/messages?university=anu')).data.messages.length,0);
    });
    await t.test('authenticated chat uses server identity and reaches only its own campus',async()=>{
      const result=await request('/api/chat/messages','POST',{body:'  \u5927\u5bb6\u597d！\n<script>alert(1)</script>  ',clientId:randomUUID(),authorId:c.id,author:'Impersonated'},a.cookie);assert.equal(result.status,201);chatMessage=result.data;
      assert.equal(chatMessage.authorId,a.id);assert.equal(chatMessage.author,a.name);assert.equal(chatMessage.body,'\u5927\u5bb6\u597d！\n<script>alert(1)</script>');assert.ok(!Object.hasOwn(chatMessage,'email'));assert.ok(!Object.hasOwn(chatMessage,'clientId'));
      for(const ws of chatClients.slice(0,2)){const live=await wait(ws,message=>message.type==='chat:message');assert.deepEqual(live.message,chatMessage);}await new Promise(r=>setTimeout(r,100));assert.ok(!chatClients[2].messages.some(m=>m.type==='chat:message'));assert.equal((await request('/api/chat/messages?university=usyd')).data.messages.length,0);
      assert.deepEqual((await request('/api/chat/messages?university=anu')).data.messages,[chatMessage]);
    });
    await t.test('chat rejects invalid messages, invalid requests and cross-origin posting; retries are idempotent',async()=>{
      for(const text of ['', ' ', 'x'.repeat(501),42,null])assert.equal((await request('/api/chat/messages','POST',{body:text,clientId:randomUUID()},c.cookie)).status,400);
      assert.equal((await request('/api/chat/messages','POST',{body:'Hello',clientId:'invalid'},c.cookie)).status,400);
      const forged=await fetch(`${base}/api/chat/messages`,{method:'POST',headers:{origin:'https://attacker.example',cookie:c.cookie,'content-type':'application/json'},body:JSON.stringify({body:'Forged',clientId:randomUUID()})});assert.equal(forged.status,403);
      const clientId=randomUUID(),input={body:'A message retried safely',clientId};const first=await request('/api/chat/messages','POST',input,c.cookie),retry=await request('/api/chat/messages','POST',input,c.cookie);
      assert.equal(first.status,201);assert.equal(retry.status,200);assert.equal(first.data.id,retry.data.id);assert.equal(first.data.seq,retry.data.seq);
      assert.equal((await request('/api/chat/messages','POST',{body:'Changed body',clientId},c.cookie)).status,409);
      const other=await request('/api/chat/messages','POST',input,a.cookie);assert.equal(other.status,201);assert.notEqual(other.data.id,first.data.id);
      assert.equal((await request('/api/chat/messages?university=anu')).data.messages.length,3);
    });
    await t.test('chat sending limit is account-scoped and a saved-message retry remains safe',async()=>{
      const firstInput={body:'Rate limit message 0',clientId:randomUUID()};const first=await request('/api/chat/messages','POST',firstInput,b.cookie);assert.equal(first.status,201);
      for(let index=1;index<20;index++)assert.equal((await request('/api/chat/messages','POST',{body:`Rate limit message ${index}`,clientId:randomUUID()},b.cookie)).status,201);
      assert.equal((await request('/api/chat/messages','POST',{body:'Too many',clientId:randomUUID()},b.cookie)).status,429);
      assert.equal((await request('/api/chat/messages','POST',firstInput,b.cookie)).data.id,first.data.id);
      assert.equal((await request('/api/chat/messages','POST',{body:'Another account can still talk',clientId:randomUUID()},c.cookie)).status,201);
    });
    await t.test('public chat returns the latest 100 in order and reconnect reloads the same saved history',async()=>{
      for(let account=0;account<5;account++){const sender=await register(`chat-${account}`);for(let index=0;index<20;index++)assert.equal((await request('/api/chat/messages','POST',{body:`History ${account}-${index}`,clientId:randomUUID()},sender.cookie)).status,201);}
      const history=(await request('/api/chat/messages?university=anu')).data.messages;assert.equal(history.length,100);assert.equal(new Set(history.map(message=>message.id)).size,100);assert.ok(history.every((message,index)=>!index||message.seq>history[index-1].seq));assert.equal(history.at(-1).body,'History 4-19');
      const otherCampus=await chatSocket('wall=unimelb&chat=1');assert.deepEqual((await wait(otherCampus,message=>message.type==='chat:state')).messages,[]);const reconnect=await chatSocket('wall=anu&chat=1');assert.deepEqual((await wait(reconnect,message=>message.type==='chat:state')).messages,history);
      for(const ws of clients)ws.close();await stop();await start();assert.deepEqual((await request('/api/chat/messages?university=anu')).data.messages,history);
    });
    await t.test('logging out revokes chat posting while the conversation stays publicly readable',async()=>{
      const sender=await register('chat-logout');await request('/api/auth/logout','POST',{},sender.cookie);
      assert.equal((await request('/api/chat/messages','POST',{body:'After logout',clientId:randomUUID()},sender.cookie)).status,401);assert.equal((await request('/api/chat/messages?university=anu')).data.messages.length,100);
    });
    await t.test('logout invalidates server-side session',async()=>{await request('/api/auth/logout','POST',{},a.cookie);assert.equal((await request('/api/drafts','GET',null,a.cookie)).status,401);});
  }finally{for(const ws of clients)ws.terminate();if(child?.exitCode===null)await stop();if(!resolve(dir).startsWith(root+sep))throw new Error('Test cleanup path is outside the test directory');rmSync(dir,{recursive:true,force:true});}
});

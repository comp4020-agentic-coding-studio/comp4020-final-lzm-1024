import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';

const base=process.env.APP_URL;
if(!base)throw new Error('Set APP_URL to the deployed CampusWall URL');
for(const path of ['/','/readme/','/anu','/anu/clubs','/saved','/messages','/games','/watch','/app.js','/chat.js','/messages.js','/games.js','/game-catalog.js','/event-utils.js','/email-utils.js','/ui-utils.js','/styles.css','/games.css','/api/health']){
  const response=await fetch(new URL(path,base));assert.equal(response.status,200,path);
  assert.doesNotMatch(await response.text(),/\p{Script=Han}/u,`${path} built-in copy`);
}
const compressed=await fetch(new URL('/app.js',base),{headers:{'accept-encoding':'br,gzip'}});
assert.equal(compressed.headers.get('content-encoding'),'br');assert.ok(Number(compressed.headers.get('content-length'))<20000);await compressed.arrayBuffer();
const cached=await fetch(new URL('/app.js',base),{headers:{'accept-encoding':'br,gzip','if-none-match':compressed.headers.get('etag')}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
const head=await fetch(new URL('/games.css',base),{method:'HEAD',headers:{'accept-encoding':'gzip'}});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
const identity=await fetch(new URL('/api/auth/me',base),{headers:{'if-none-match':'*'}});assert.equal(identity.status,200);assert.equal(identity.headers.get('cache-control'),'no-store');assert.equal(identity.headers.get('etag'),null);await identity.arrayBuffer();
assert.equal((await fetch(new URL('/api/profiles/00000000-0000-0000-0000-000000000000',base),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({bio:'Anonymous check'})})).status,401);
assert.equal((await fetch(new URL('/api/profile/avatar',base),{method:'POST',headers:{'content-type':'image/png'},body:'invalid'})).status,401);
const campuses=await (await fetch(new URL('/api/universities',base))).json();
for(const path of ['/voice-calls.js','/voice-transport.js','/typography.css','/community.js','/community.css','/vendor/leaflet.js','/vendor/leaflet.css','/watch.js','/watch-player.js','/watch-model.js','/watch.css','/vendor/hls.min.js','/profile.js','/profile.css','/chat-ui.js','/motion.js','/motion.css','/poster-design.js','/designer.js','/poster-design.css','/designer.css','/canvas-model.js','/whiteboard.js','/whiteboard.css']){const res=await fetch(new URL(path,base));assert.equal(res.status,200,path);assert.match(res.headers.get('cache-control'),/public/);await res.arrayBuffer();}
for(const page of ['','map','calendar','organiser','friends','groups','teams','clubs','screenings','leaderboard','notifications'])assert.equal((await fetch(new URL('/community'+(page?'/'+page:''),base))).status,200);
for(const endpoint of ['notifications','friends','groups','teams','clubs','map','calendar','stats','organiser','screenings'])assert.equal((await fetch(new URL('/api/community/'+endpoint,base))).status,401);
assert.equal((await fetch(new URL('/api/watch/rooms',base))).status,401);
assert.equal((await fetch(new URL('/api/watch/rooms',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Anonymous watch check',url:'https://example.com/test.mp4',clientId:'00000000-0000-0000-0000-000000000000'})})).status,401);
assert.match((await fetch(new URL('/watch',base))).headers.get('content-security-policy'),/media-src 'self' https: blob:/);
const games=await (await fetch(new URL('/api/games/catalog',base))).json();assert.equal(games.games.length,10);assert.equal(new Set(games.games.map(g=>g.id)).size,10);
assert.doesNotMatch(JSON.stringify(games),/\p{Script=Han}/u,'English game catalog');assert.ok(games.games.every(game=>!Object.hasOwn(game,'zh')));
for(const path of ['/api/games/rooms','/api/games/players?q=student'])assert.equal((await fetch(new URL(path,base))).status,401);
assert.equal((await fetch(new URL('/api/games/rooms',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({game:'gomoku',clientId:'00000000-0000-0000-0000-000000000000'})})).status,401);
assert.equal(campuses.length,8);assert.ok(campuses.every(c=>c.locations.length>0&&c.mapUrl.startsWith('https://')&&c.style===`campus-${c.slug}`&&c.timeZone.startsWith('Australia/')));
assert.ok(campuses.every(c=>Array.isArray(c.emailDomains)&&c.emailDomains.length>0));assert.ok(campuses.find(c=>c.id==='anu').emailDomains.includes('anu.edu.au'));
// Rejected requests must fail before creating an account; never seed production users.
const rejectedRegistration=await fetch(new URL('/api/auth/register',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'domain-lock-check@anu.edu.au',name:'Domain check',password:'unused-check-password',universityId:'usyd'})});
assert.equal(rejectedRegistration.status,400);assert.match((await rejectedRegistration.json()).error,/university email belongs to ANU/);assert.equal(rejectedRegistration.headers.get('set-cookie'),null);
for(const campus of campuses){const logo=await fetch(new URL(campus.logo.src,base));assert.equal(logo.status,200);assert.match(logo.headers.get('content-type'),/^image\/(svg\+xml|png)/);assert.ok((await logo.arrayBuffer()).byteLength>1000);}
const directory=await (await fetch(new URL('/api/clubs?university=anu',base))).json();assert.equal(directory.total,236);assert.equal(directory.clubs.length,236);assert.equal(directory.categories.length,16);assert.equal(directory.source.url,'https://anusa.com.au/clubs/clubs-list/');
for(const [campus,total,categories,origin] of [['usyd',301,9,'https://usu.edu.au'],['unsw',458,16,'https://campus.hellorubric.com'],['unimelb',246,10,'https://umsu.unimelb.edu.au'],['monash',114,7,'https://clubs.msa.monash.edu'],['uq',221,14,'https://campus.hellorubric.com'],['uwa',160,23,'https://www.uwastudentguild.com'],['adelaide',169,4,'https://www.ausaadelaide.com.au']]){
  assert.equal((await fetch(new URL(`/${campus}/clubs`,base))).status,200);
  const directory=await(await fetch(new URL(`/api/clubs?university=${campus}`,base))).json();assert.equal(directory.total,total);assert.equal(directory.clubs.length,total);assert.equal(directory.categories.length,categories);assert.ok(directory.clubs.every(c=>c.universityId===campus&&new URL(c.profileUrl).origin===origin));
  assert.equal(directory.interests.length,11);assert.ok(directory.clubs.every(c=>c.interests.length>0));const tech=await(await fetch(new URL(`/api/clubs?university=${campus}&interest=tech`,base))).json();assert.ok(tech.clubs.length>0&&tech.clubs.every(c=>c.interests.includes('tech')));
}
for(const {id:university} of campuses){
  const chat=await (await fetch(new URL(`/api/chat/messages?university=${university}`,base))).json();assert.equal(chat.universityId,university);assert.equal(chat.limit,100);assert.ok(Array.isArray(chat.messages));assert.ok(chat.messages.length<=100);assert.ok(chat.messages.every(message=>message.universityId===university&&message.author&&message.body&&!message.email));
}
assert.equal((await fetch(new URL('/api/chat/messages',base))).status,400);
assert.equal((await fetch(new URL('/api/auth/university',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({universityId:'anu'})})).status,401);
assert.equal((await fetch(new URL('/api/chat/messages',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:'Anonymous smoke check',clientId:'00000000-0000-0000-0000-000000000000'})})).status,401);
assert.equal((await fetch(new URL('/api/calls',base))).status,401);
let first;
const photoAssets=new Set();
for(const {id:university} of campuses){
  const response=await fetch(new URL(`/api/posters?university=${university}`,base));
  assert.equal(response.status,200);const posters=await response.json();assert.ok(Array.isArray(posters));
  assert.ok(posters.every(p=>p.universityId===university&&p.status==='PUBLISHED'&&typeof p.canMessageOwner==='boolean'));
  const photos=posters.filter(p=>p.isTest&&p.photoPoster);assert.equal(photos.length,24,`${university} photo gallery`);
  for(const photo of photos)assert.doesNotMatch(JSON.stringify(photo),/\p{Script=Han}/u,`${university} built-in test notice ${photo.id}`);
  assert.equal(new Set(photos.map(p=>p.photoPoster.seedKey)).size,24);assert.ok(photos.every(p=>p.location&&p.description.includes('Fictional event')&&!p.canMessageOwner&&p.photoPoster.venueSource.startsWith('https://')&&p.photoPoster.venueMap.startsWith('https://www.google.com/maps/search/')));
  for(const p of photos)photoAssets.add(p.heroImageUrl);
  const testCalendar=await(await fetch(new URL(`/api/posters/${photos[0].id}/calendar`,base))).text();assert.match(testCalendar,/SUMMARY:\[TEST\]/);assert.match(testCalendar,/STATUS:TENTATIVE/);
  first ||= posters[0];assert.equal((await fetch(new URL(`/${university}`,base))).status,200);
}
assert.equal(photoAssets.size,24);
for(const path of [...photoAssets,'/photo-posters.js','/photo-posters.css']){const res=await fetch(new URL(path,base));assert.equal(res.status,200,path);if(path.endsWith('.webp')){assert.match(res.headers.get('content-type'),/^image\/webp/);assert.ok((await res.arrayBuffer()).byteLength>10000);}}
for(const path of [`/api/posters/${first.slug}`,`/api/posters/${first.id}/comments`])assert.equal((await fetch(new URL(path,base))).status,200);
const calendar=await fetch(new URL(`/api/posters/${first.id}/calendar`,base));assert.equal(calendar.status,200);assert.match(await calendar.text(),/BEGIN:VCALENDAR/);
const qr=await fetch(new URL(`/api/posters/${first.id}/qr`,base));assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);
assert.equal((await fetch(new URL('/api/saved',base))).status,401);
assert.equal((await fetch(new URL('/api/users/search?q=student',base))).status,401);
assert.equal((await fetch(new URL('/api/messages/conversations',base))).status,401);
assert.equal((await fetch(new URL('/api/messages/conversations',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'campus-team'})})).status,401);
assert.equal((await fetch(new URL('/api/messages/from-poster',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({posterId:first.id})})).status,401);
assert.equal((await fetch(new URL(`/api/posters/${first.id}/save`,base),{method:'POST'})).status,401);
assert.equal((await fetch(new URL('/api/drafts',base))).status,401);
assert.equal((await fetch(new URL('/api/drafts',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({universityId:'anu'})})).status,401);
const socketUrl=new URL('/ws?wall=anu',base);socketUrl.protocol=socketUrl.protocol==='https:'?'wss:':'ws:';
const ws=new WebSocket(socketUrl,{headers:{origin:new URL(base).origin},handshakeTimeout:15000});
await once(ws,'open');ws.close();await once(ws,'close');
const chatUrl=new URL('/ws?wall=anu&chat=1',base);chatUrl.protocol=socketUrl.protocol;
const chatWs=new WebSocket(chatUrl,{headers:{origin:new URL(base).origin},handshakeTimeout:15000});const chatState=once(chatWs,'message');await once(chatWs,'open');const initialChat=JSON.parse((await chatState)[0]);assert.equal(initialChat.type,'chat:state');assert.equal(initialChat.universityId,'anu');chatWs.close();await once(chatWs,'close');
const privateUrl=new URL(`/ws?poster=${first.id}`,base);privateUrl.protocol=socketUrl.protocol;
const privateWs=new WebSocket(privateUrl,{headers:{origin:new URL(base).origin},handshakeTimeout:15000});
const rejected=await new Promise((resolve,reject)=>{privateWs.on('unexpected-response',(_req,res)=>{res.resume();privateWs.terminate();resolve(res.statusCode);});privateWs.on('error',error=>{if(privateWs.readyState!==WebSocket.CLOSED)reject(error);});});
assert.equal(rejected,401);
const inboxUrl=new URL('/ws?inbox=1',base);inboxUrl.protocol=socketUrl.protocol;const inboxWs=new WebSocket(inboxUrl,{headers:{origin:new URL(base).origin},handshakeTimeout:15000});
const inboxRejected=await new Promise((resolve,reject)=>{inboxWs.on('unexpected-response',(_req,res)=>{res.resume();inboxWs.terminate();resolve(res.statusCode);});inboxWs.on('error',error=>{if(inboxWs.readyState!==WebSocket.CLOSED)reject(error);});});assert.equal(inboxRejected,401);
console.log('Deployment verified: 24 photographic test notices per campus (192 total), all 24 local photo assets and calendar test labels, ten games, eight campus walls/logos/chat channels, 1,905 clubs, private messaging, calendar/QR exports and protected APIs.');

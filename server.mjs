import {performance} from 'node:perf_hooks';
import {createActionLogger,createLogSink,loadLogKey} from './observability.mjs';
import {createVoiceCalls} from './voice-calls.mjs';
import {createCommunity} from './community.mjs';
import {createWatch} from './watch.mjs';
import {createProfiles} from './profiles.mjs';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { campusDetails, universities } from './campus.mjs';
import { validEmail, universityFromEmail } from './public/email-utils.js';
import { calendarEvent } from './calendar.mjs';
import { clubDirectory } from './clubs.mjs';
import { createMessaging, generatedUsername } from './messaging.mjs';
import { createGames } from './games.mjs';
import {initializeDatabase} from './initialize-database.mjs';
import {createQueries} from './database.mjs';
import {createPosterStore} from './poster-store.mjs';
import {createPublicAssets} from './public-assets.mjs';
import {seedCanvas,applyCanvasOperation,validateProps} from './public/canvas-model.js';
import {designFields,designChoices,designNumbers,designColours,designDefaults,designPresets} from './public/poster-design.js';

const scrypt = promisify(derive), dataDir = process.env.DATA_DIR || '/data';
const emailUniversities=universities.map(([id,name,shortName])=>({id,name,shortName,...campusDetails[id]}));
sharp.cache(false); sharp.concurrency(1);
const uploadDir=join(dataDir,'uploads');let processingImage=false;
mkdirSync(dataDir, { recursive: true });
const observation=createActionLogger({key:loadLogKey(dataDir),write:createLogSink(process.stdout)});
const db = new DatabaseSync(join(dataDir, 'campuswall.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const queries=createQueries(db);
const {get,all,run}=queries;
const now = () => new Date().toISOString(), id = () => randomUUID();
initializeDatabase(db,dataDir,queries,now);
mkdirSync(uploadDir,{recursive:true});
class Problem extends Error { constructor(status,message) { super(message);this.status=status; } }
const fail=(status,message)=>{throw new Problem(status,message);};
const string=(v,max,label)=>{if(typeof v!=='string'||v.length>max) fail(400,`${label} must be text with at most ${max} characters`);return v.trim();};
const fields={title:100,subtitle:160,date:10,time:5,location:180,description:2000,category:20,template:20,style:20,alignment:10,heroImageUrl:1500,...designFields};
const choices={category:['Social','Academic','Clubs','Sport','Arts','Career','Other'],template:['minimal','photo','club','seminar','social'],style:['sunshine','sage','lavender','coral','sky','ink',...Object.values(campusDetails).map(c=>c.style)],alignment:['left','center']};
function validate(field,value) {
  if(!Object.hasOwn(fields,field)) fail(400,'This field cannot be edited');
  const v=string(value,fields[field],field);
  if(designChoices[field]&&!designChoices[field].includes(v))fail(400,`Invalid ${field}`);
  if(designNumbers[field]&&(!/^-?\d+$/.test(v)||Number(v)<designNumbers[field][0]||Number(v)>designNumbers[field][1]))fail(400,`Invalid ${field}`);
  if(designColours.includes(field)&&!/^#[a-f0-9]{6}$/i.test(v))fail(400,`Invalid ${field}`);
  if(choices[field]&&!choices[field].includes(v)) fail(400,`Invalid ${field}`);
  if(field==='date'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)) fail(400,'Choose a valid date');
  if(field==='time'&&v&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400,'Choose a valid time');
  if(field==='heroImageUrl'&&v&&!/^\/media\/[a-f0-9-]{36}$/.test(v)) {try {if(new URL(v).protocol!=='https:') fail(400,'Use an HTTPS image URL');} catch {fail(400,'Use a valid HTTPS image URL');}}
  return v;
}
const json=(res,status,data)=>{if(Number.isSafeInteger(data?.version))res.observedRevision=data.version;res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const body=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',b=>{raw+=b;if(Buffer.byteLength(raw)>16000){reject(new Problem(413,'Request is too large'));req.destroy();}});req.on('end',()=>{try{const parsed=JSON.parse(raw||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();resolve(parsed);}catch{reject(new Problem(400,'Invalid JSON'));}});req.on('error',reject);});
const hash=token=>createHash('sha256').update(token).digest('hex');
function token(req) {return /(?:^|;\s*)campus_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1]||'';}
function user(req) {const account=get('SELECT u.id,u.name,u.email,u.username,u.universityId,u.avatarId FROM users u JOIN sessions s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?',hash(token(req)),Date.now());if(account)req.observedActorId=account.id;return account;}
function authenticated(req) {return user(req)||fail(401,'Sign in to continue');}
function campusAccount(req){const u=authenticated(req);if(!u.universityId)fail(409,'Choose your account university to continue');return u;}
function campusAccess(req,universityId){const u=user(req);if(!u)return;if(!u.universityId)fail(409,'Choose your account university to continue');if(u.universityId!==universityId)fail(403,'Your account can only access its own university');}
function record(posterId) {return get('SELECT * FROM posters WHERE id=?',posterId)||fail(404,'Poster not found');}
function allowed(p,u) {return p.ownerId===u.id||!!get('SELECT 1 FROM collaborators WHERE posterId=? AND userId=?',p.id,u.id);}
function editor(p,u) {if(!u.universityId||u.universityId!==p.universityId||!allowed(p,u))fail(403,'You do not have access to this draft');}
function owner(p,u) {if(p.ownerId!==u.id)fail(403,'Only the creator can do that');}
const posters=createPosterStore(queries),view=posters.present;
const sockets=new Set();
const send=(ws,type,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...data}));};
function validSocket(ws) {return !!get('SELECT 1 FROM sessions WHERE tokenHash=? AND expiresAt>?',ws.sessionHash,Date.now());}
function broadcast(posterId,type,data) {const p=get('SELECT * FROM posters WHERE id=?',posterId);for(const ws of sockets)if(ws.posterId===posterId){if(!p||!validSocket(ws)||!allowed(p,ws.user))ws.close(4003,'Access removed');else send(ws,type,data);}}
function presence(posterId) {
  const people=new Map();
  for(const ws of sockets)if(ws.posterId===posterId&&ws.readyState===WebSocket.OPEN){
    const person=people.get(ws.user.id)||{id:ws.user.id,name:ws.user.name,editingFields:[]};
    if(ws.editingField&&ws.editingUntil>Date.now()&&!person.editingFields.includes(ws.editingField))person.editingFields.push(ws.editingField);
    people.set(ws.user.id,person);
  }
  broadcast(posterId,'presence',{people:[...people.values()]});
}
function wallChanged(universityId) {for(const ws of sockets)if(ws.wall===universityId)send(ws,'wall:changed',{universityId});}
const chatSelect='SELECT c.seq,c.id,c.body,c.createdAt,c.universityId,u.id authorId,u.name author,u.avatarId FROM chat_messages c JOIN users u ON u.id=c.authorId';
function chatHistory(universityId) {return all(`${chatSelect} WHERE c.universityId=? ORDER BY c.seq DESC LIMIT 100`,universityId).reverse();}
function broadcastChat(message) {for(const ws of sockets)if(ws.chat&&ws.chatCampus===message.universityId){if(ws.user&&!validSocket(ws)){ws.close(4001,'Session expired');continue;}send(ws,'chat:message',{message});}}
let community;
const messaging=createMessaging({db,get,all,run,id,now,fail,string,authenticated:campusAccount,body,json,sockets,send,validSocket,campusAccess,notify:(...args)=>community?.notify(...args)});
const games=createGames({db,get,all,run,id,now,fail,string,campusAccount,body,json,sockets,send,validSocket,messaging,recordGame:(...args)=>community?.recordGame(...args)});
function update(p,u,input) {
  editor(p,u);
  if(!Number.isInteger(input.clientVersion)||input.clientVersion<0||input.clientVersion>p.version)fail(400,'Invalid poster version');
  if(p.version-input.clientVersion>100)fail(409,'This draft changed elsewhere; reconnect to load the latest version');
  const value=validate(input.field,input.value),content=JSON.parse(p.content);content[input.field]=value;
  if(Object.hasOwn(designFields,input.field))content.designVersion='1';
  if(content.canvas){const bindings={title:['base-title',value],subtitle:['base-subtitle',value],location:['base-where',value],date:['base-when',[value,content.time].filter(Boolean).join(' · ')],time:['base-when',[content.date,value].filter(Boolean).join(' · ')]};const binding=bindings[input.field];if(binding){const object=content.canvas.objects.find(o=>o.id===binding[0]);if(object)object.text=binding[1];}}
  if(input.field==='heroImageUrl'&&value.startsWith('/media/')&&!get('SELECT 1 FROM uploads WHERE id=? AND posterId=?',value.slice(7),p.id))fail(400,'This image does not belong to this poster');
  run('UPDATE posters SET content=?,version=version+1,updatedAt=? WHERE id=?',JSON.stringify(content),now(),p.id);
  const result=view(record(p.id),true);broadcast(p.id,'poster:updated',{poster:result,field:input.field,updatedBy:u.id,requestId:input.requestId});return result;
}
function updateCanvas(p,u,input){
 editor(p,u);if(typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(input.requestId))fail(400,'Invalid canvas request');
 if(!Number.isInteger(input.clientVersion)||input.clientVersion<0||input.clientVersion>p.version)fail(400,'Invalid poster version');
 const content=JSON.parse(p.content),current=content.canvas||seedCanvas({...content,universityId:p.universityId});const receipts=current.receipts||[];
 if(receipts.some(r=>r.id===input.requestId&&r.user===u.id)){const result=view(p,true);broadcast(p.id,'poster:updated',{poster:result,requestId:input.requestId,canvas:true,updatedBy:u.id});return result;}
 const canvas=input.action==='init'?current:applyCanvasOperation(current,input);
 for(const o of canvas.objects)if(o.type==='image'&&o.src.startsWith('/media/')&&!get('SELECT 1 FROM uploads WHERE id=? AND posterId=?',o.src.slice(7),p.id))fail(400,'This image does not belong to this poster');
 canvas.receipts=[...receipts,{id:input.requestId,user:u.id}].slice(-128);content.canvas=canvas;
 run('UPDATE posters SET content=?,version=version+1,updatedAt=? WHERE id=?',JSON.stringify(content),now(),p.id);
 const result=view(record(p.id),true);broadcast(p.id,'poster:updated',{poster:result,requestId:input.requestId,canvas:true,updatedBy:u.id});return result;
}
function sameOrigin(req) {if(!req.headers.origin)return;try{if(new URL(req.headers.origin).host===req.headers.host)return;}catch{}fail(403,'Request origin is not allowed');}
const attempts=new Map();
function rateLimit(req) {const key=req.socket.remoteAddress,entry=attempts.get(key)||{n:0,until:Date.now()+60000};if(entry.until<Date.now()){entry.n=0;entry.until=Date.now()+60000;}if(++entry.n>30)fail(429,'Too many attempts. Please wait a minute.');attempts.set(key,entry);}
function session(res,req,u) {req.observedActorId=u.id;const sessionToken=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES (?,?,?)',hash(sessionToken),u.id,Date.now()+7*86400000);res.setHeader('set-cookie',`campus_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);}
function publicUrl(req,p) {const origin=process.env.PUBLIC_BASE_URL||`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`;return new URL(`/${p.universityId}/posters/${p.slug}`,origin).href;}
function readImage(req) {
  const limit=5*1024*1024;
  return new Promise((resolve,reject)=>{
    let size=0,finished=false;const chunks=[];
    if(Number(req.headers['content-length'])>limit){req.resume();reject(new Problem(413,'Choose an image smaller than 5 MB'));return;}
    req.on('data',chunk=>{if(finished)return;size+=chunk.length;if(size>limit){finished=true;chunks.length=0;reject(new Problem(413,'Choose an image smaller than 5 MB'));return;}chunks.push(chunk);});
    req.on('end',()=>{if(!finished)resolve(Buffer.concat(chunks));});req.on('error',reject);
  });
}
async function uploadImage(req,posterId) {
  const u=authenticated(req);editor(record(posterId),u);
  if(!['image/jpeg','image/png','image/webp'].includes(req.headers['content-type']))fail(400,'Choose a JPEG, PNG or WebP image');
  if(processingImage)fail(429,'Another image is processing. Please try again in a moment.');
  if(get('SELECT COUNT(*) n FROM uploads WHERE posterId=?',posterId).n>=20)fail(400,'This poster has reached its 20-image limit');
  if(get('SELECT COALESCE(SUM(bytes),0) n FROM uploads').n>=200*1024*1024)fail(507,'Image storage is full. Use an HTTPS image link instead.');
  processingImage=true;
  try {
    const input=await readImage(req);let encoded;
    try {
      const image=sharp(input,{limitInputPixels:16_000_000,failOn:'warning'}),metadata=await image.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1)fail(400,'Choose a still JPEG, PNG or WebP image');
      const expected={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[req.headers['content-type']];
      if(metadata.format!==expected)fail(400,'Image content does not match its file type');
      encoded=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    }catch(error){if(error.status)throw error;fail(400,'Unable to read this image. Choose a valid image up to 16 megapixels.');}
    // Recheck after asynchronous processing: collaborator access may have been revoked.
    authenticated(req);const p=record(posterId);editor(p,u);
    const imageId=id(),filename=`${imageId}.webp`;
    writeFileSync(join(uploadDir,filename),encoded,{flag:'wx'});
    try {
      run('INSERT INTO uploads VALUES (?,?,?,?,?,?)',imageId,p.id,u.id,filename,encoded.length,now());
      return update(p,u,{field:'heroImageUrl',value:`/media/${imageId}`,clientVersion:p.version});
    }catch(error){run('DELETE FROM uploads WHERE id=?',imageId);rmSync(join(uploadDir,filename),{force:true});throw error;}
  }finally{processingImage=false;}
}
const avatarDir=join(dataDir,'avatars');mkdirSync(avatarDir,{recursive:true});
async function uploadAvatar(req){
 const u=authenticated(req);
 if(!['image/jpeg','image/png','image/webp'].includes(req.headers['content-type']))fail(400,'Choose a JPEG, PNG or WebP image');
 if(processingImage)fail(429,'Another image is processing. Please try again in a moment.');
 processingImage=true;
 try{
  const input=await readImage(req);let encoded;
  try{const image=sharp(input,{limitInputPixels:16_000_000,failOn:'warning'}),metadata=await image.metadata();
   if(metadata.pages>1||metadata.format!==({'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[req.headers['content-type']]))fail(400,'Choose a still image matching its file type');
   encoded=await image.rotate().resize(256,256,{fit:'cover'}).webp({quality:82}).toBuffer();
  }catch(error){if(error.status)throw error;fail(400,'Unable to read this image. Choose a valid image up to 16 megapixels.');}
  const current=authenticated(req);const avatarId=id(),file=join(avatarDir,avatarId+'.webp');writeFileSync(file,encoded,{flag:'wx'});
  try{run('UPDATE users SET avatarId=? WHERE id=?',avatarId,u.id);}catch(error){rmSync(file,{force:true});throw error;}
  if(current.avatarId)rmSync(join(avatarDir,current.avatarId+'.webp'),{force:true});
  const person=user(req);
  const watchRooms=new Set([...sockets].filter(ws=>ws.watchRoom).map(ws=>ws.watchRoom));for(const roomId of watchRooms)watch.broadcast(watch.room(roomId));
  for(const ws of sockets){
   if(ws.user&&!validSocket(ws))continue;
   if((ws.chat&&ws.chatCampus===person.universityId)||(ws.inbox&&(ws.user.id===u.id||get('SELECT 1 FROM conversations WHERE (user1=? AND user2=?) OR (user1=? AND user2=?)',ws.user.id,u.id,u.id,ws.user.id))))send(ws,'profile:updated',{person:{id:person.id,name:person.name,avatarId}});
  }
  return person;
 }finally{processingImage=false;}
}
const profiles=createProfiles({get,all,run,body,json,authenticated:campusAccount,campusAccess,string,fail,id,now,notify:(...args)=>community?.notify(...args)});
const watch=createWatch({db,get,all,run,id,now,fail,string,campusAccount,body,json,sockets,send,validSocket});
community=createCommunity({db,get,all,run,id,now,fail,string,campusAccount,campusAccess,body,json,sockets,send,validSocket,watch,posters});
const voiceCalls=createVoiceCalls({get,all,run,id,now,fail,body,json,campusAccount,sockets,send,validSocket,sessionHash:req=>hash(token(req))});
const publicAssets=createPublicAssets();
const server=createServer(async(req,res)=>{
  observation.http(req,res);
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','strict-origin-when-cross-origin');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
    if(/^\/watch(?:\/[a-f0-9-]{36})?$/.test(path))res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(method!=='GET'&&method!=='HEAD')sameOrigin(req);
    if((method==='GET'||method==='HEAD')&&await publicAssets.serve(req,res,path))return;
    if(path==='/api/calls'||path.startsWith('/api/calls/'))return await voiceCalls.handle(req,res,url);
    if(path.startsWith('/api/community/'))return await community.handle(req,res,url);
    if(path.startsWith('/api/watch/'))return await watch.handle(req,res,url);
    if(path.startsWith('/api/profiles/'))return await profiles.handle(req,res,url);
    if(path==='/api/profile/avatar'&&method==='POST')return json(res,200,{user:await uploadAvatar(req)});
    const avatar=path.match(/^\/avatars\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.webp$/);
    if(avatar&&(method==='GET'||method==='HEAD')){if(!get('SELECT 1 FROM users WHERE avatarId=?',avatar[1]))fail(404,'Avatar not found');const bytes=readFileSync(join(avatarDir,avatar[1]+'.webp'));res.writeHead(200,{'content-type':'image/webp','content-length':bytes.length,'cache-control':'public, max-age=86400'});return res.end(method==='HEAD'?undefined:bytes);}
    if(path==='/api/health')return json(res,200,{ok:true});
    if(path==='/api/universities')return json(res,200,universities.map(([slug])=>({...get('SELECT * FROM universities WHERE id=?',slug),...campusDetails[slug]})));
    if(path.startsWith('/api/games/'))return await games.handle(req,res,url);
    if(path==='/api/users/search'||path.startsWith('/api/messages/'))return await messaging.handle(req,res,url);
    if(path==='/api/clubs'&&method==='GET') {
      const universityId=url.searchParams.get('university');
      if(!get('SELECT 1 FROM universities WHERE id=?',universityId||''))fail(400,'Choose a university');
      campusAccess(req,universityId);
      return json(res,200,clubDirectory(universityId,{q:url.searchParams.get('q')||'',category:url.searchParams.get('category')||'',interest:url.searchParams.get('interest')||''}));
    }
    if(path==='/api/auth/me')return json(res,200,{user:user(req)||null});
    if(path==='/api/auth/university'&&method==='POST'){
      authenticated(req);const input=await body(req),u=authenticated(req),universityId=input.universityId;
      if(!get('SELECT 1 FROM universities WHERE id=?',universityId||''))fail(400,'Choose a university');
      if(u.universityId&&u.universityId!==universityId)fail(409,'Your account university is already fixed');
      if(!u.universityId){
        const emailCampus=universityFromEmail(u.email,emailUniversities);
        if(emailCampus&&emailCampus.id!==universityId)fail(400,`Your university email belongs to ${emailCampus.shortName}. Choose that university.`);
        run('UPDATE users SET universityId=? WHERE id=? AND universityId IS NULL',universityId,u.id);
      }
      const current=user(req);if(current.universityId!==universityId)fail(409,'Your account university is already fixed');
      return json(res,200,{user:current});
    }
    if(path==='/api/chat/messages') {
      if(method==='GET'){const uni=url.searchParams.get('university')||user(req)?.universityId;if(!get('SELECT 1 FROM universities WHERE id=?',uni||''))fail(400,'Choose a university');campusAccess(req,uni);return json(res,200,{messages:chatHistory(uni),limit:100,universityId:uni});}
      if(method==='POST') {
        campusAccount(req);const input=await body(req),u=campusAccount(req),text=string(input.body,500,'Message');
        if(input.universityId!==undefined&&input.universityId!==u.universityId)fail(403,'You can only send to your own university chat');
        if(!text)fail(400,'Write a message first');
        if(typeof input.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.clientId))fail(400,'Invalid message request');
        // A retry after an interrupted response must not publish the message twice.
        const existing=get(`${chatSelect} WHERE c.authorId=? AND c.clientId=?`,u.id,input.clientId);
        if(existing){if(existing.body!==text||existing.universityId!==u.universityId)fail(409,'This request already sent a different message');return json(res,200,existing);}
        const since=new Date(Date.now()-60000).toISOString();
        if(get('SELECT COUNT(*) n FROM chat_messages WHERE authorId=? AND createdAt>?',u.id,since).n>=20){res.setHeader('retry-after','60');fail(429,'You’re sending messages quickly. Please wait a minute.');}
        const messageId=id();run('INSERT INTO chat_messages (id,authorId,clientId,body,createdAt,universityId) VALUES (?,?,?,?,?,?)',messageId,u.id,input.clientId,text,now(),u.universityId);
        const message=get(`${chatSelect} WHERE c.id=?`,messageId);broadcastChat(message);return json(res,201,message);
      }
      fail(405,'Method not allowed');
    }
    if((path==='/api/auth/register'||path==='/api/auth/login')&&method==='POST') {
      rateLimit(req);const input=await body(req),email=string(input.email,254,'Email').toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email');
      const password=typeof input.password==='string'?input.password:'';if(password.length<8||password.length>128)fail(400,'Password must contain 8–128 characters');let u;
      if(path.endsWith('register')) {
        if(!validEmail(email))fail(400,'Enter a valid email');
        const emailCampus=universityFromEmail(email,emailUniversities);
        if(emailCampus&&input.universityId!==undefined&&input.universityId!==emailCampus.id)fail(400,`Your university email belongs to ${emailCampus.shortName}. You cannot register for another university.`);
        const universityId=emailCampus?.id||input.universityId;if(!get('SELECT 1 FROM universities WHERE id=?',universityId||''))fail(400,'Choose your account university');
        const name=string(input.name,50,'Display name');if(!name)fail(400,'Enter your display name');if(get('SELECT 1 FROM users WHERE email=?',email))fail(409,'An account already uses that email');
        let username=input.username===undefined?'':string(input.username,24,'Username').toLowerCase();if(username&&!/^[a-z0-9_]{3,24}$/.test(username))fail(400,'Username must be 3–24 letters, numbers or underscores');
        if(username&&get('SELECT 1 FROM users WHERE username=? COLLATE NOCASE',username))fail(409,'That username is already taken');
        const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64);u={id:id(),name,email};username ||= generatedUsername(name,u.id,get);u.username=username;
        u.universityId=universityId;
        try{run('INSERT INTO users (id,name,email,passwordHash,createdAt,username,universityId) VALUES (?,?,?,?,?,?,?)',u.id,name,email,`${salt}:${key.toString('hex')}`,now(),username,universityId);}catch{fail(409,'That email or username is already taken');}
      } else {
        const account=get('SELECT * FROM users WHERE email=?',email),[salt,expected]=account?.passwordHash.split(':')||[];
        const key=await scrypt(password,salt||'invalid-account',64);if(!expected||!timingSafeEqual(key,Buffer.from(expected,'hex')))fail(401,'Email or password is incorrect');u={id:account.id,name:account.name,email:account.email,username:account.username,universityId:account.universityId,avatarId:account.avatarId};
      }
      session(res,req,u);return json(res,200,{user:u});
    }
    if(path==='/api/auth/logout'&&method==='POST') {user(req);const sessionHash=hash(token(req));run('DELETE FROM sessions WHERE tokenHash=?',sessionHash);for(const ws of sockets)if(ws.sessionHash===sessionHash)ws.close(4001,'Signed out');res.setHeader('set-cookie','campus_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
    const media=path.match(/^\/media\/([a-f0-9-]{36})$/);
    if(media&&method==='GET') {
      const image=get('SELECT * FROM uploads WHERE id=?',media[1])||fail(404,'Image not found');const p=record(image.posterId),u=user(req);
      const snapshot=JSON.parse(p.publicData||'{}');const publicImage=p.status==='PUBLISHED'&&(snapshot.heroImageUrl===path||snapshot.canvas?.objects.some(o=>o.type==='image'&&o.src===path));
      if(!publicImage&&(!u||!allowed(p,u)))fail(404,'Image not found');
      campusAccess(req,p.universityId);
      res.writeHead(200,{'content-type':'image/webp','cache-control':'private, no-store','vary':'Cookie'});return res.end(readFileSync(join(uploadDir,image.file)));
    }
    if(path==='/api/saved'&&method==='GET') {
      const u=campusAccount(req);
      return json(res,200,posters.list({join:'JOIN saved_posters saved ON saved.posterId=p.id',where:"saved.userId=? AND p.universityId=? AND p.status='PUBLISHED'",params:[u.id,u.universityId],order:"json_extract(p.publicData,'$.date'),saved.createdAt DESC",viewerId:u.id}));
    }
    if(path==='/api/posters'&&method==='GET') {
      const uni=url.searchParams.get('university')||universities.find(u=>u[2]===url.searchParams.get('school'))?.[0];if(!get('SELECT 1 FROM universities WHERE slug=?',uni||''))fail(400,'Choose a university');
      campusAccess(req,uni);
      let where="p.status='PUBLISHED' AND p.universityId=?";const params=[uni],category=url.searchParams.get('category');
      if(category){where+=" AND json_extract(p.publicData,'$.category')=?";params.push(category);}
      const q=(url.searchParams.get('q')||'').slice(0,100).toLowerCase();if(q){where+=" AND instr(lower(json_extract(p.publicData,'$.title') || ' ' || json_extract(p.publicData,'$.location') || ' ' || json_extract(p.publicData,'$.description')),?)>0";params.push(q);}
      for(const [param,op] of [['from','>='],['to','<=']])if(url.searchParams.get(param)){where+=` AND json_extract(p.publicData,'$.date')${op}?`;params.push(validate('date',url.searchParams.get(param)));}
      return json(res,200,posters.list({where,params,order:"json_extract(p.publicData,'$.date'),p.publishedAt DESC",viewerId:user(req)?.id}));
    }
    const pub=path.match(/^\/api\/posters\/([^/]+)(?:\/(comments|save|calendar|qr))?$/);
    if(pub) {
      const p=get("SELECT * FROM posters WHERE (id=? OR slug=?) AND status='PUBLISHED'",pub[1],pub[1])||fail(404,'Poster not found');
      campusAccess(req,p.universityId);
      if(method==='GET'&&!pub[2]){const visitor=user(req);if(visitor&&visitor.id!==p.ownerId)run('INSERT OR IGNORE INTO event_views VALUES (?,?,?)',p.id,visitor.id,now().slice(0,10));return json(res,200,view(p,false,visitor?.id));}
      if(pub[2]==='save'&&(method==='POST'||method==='DELETE')) {
        const u=authenticated(req);
        if(method==='POST')run('INSERT OR IGNORE INTO saved_posters VALUES (?,?,?)',u.id,p.id,now());else run('DELETE FROM saved_posters WHERE userId=? AND posterId=?',u.id,p.id);
        return json(res,200,{isSaved:method==='POST'});
      }
      if(pub[2]==='calendar'&&method==='GET') {
        const event=view(p);if(!event.date)fail(400,'This poster does not have an event date yet');
        res.writeHead(200,{'content-type':'text/calendar; charset=utf-8','content-disposition':`attachment; filename="${p.slug}.ics"`,'cache-control':'no-store'});return res.end(calendarEvent(event,publicUrl(req,p)));
      }
      if(pub[2]==='qr'&&method==='GET') {
        const svg=await QRCode.toString(publicUrl(req,p),{type:'svg',errorCorrectionLevel:'M',margin:4,width:256});
        // Publication may have changed while rendering.
        if(record(p.id).status!=='PUBLISHED')fail(404,'Poster not found');
        res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store',...(url.searchParams.get('download')==='1'?{'content-disposition':`attachment; filename="${p.slug}-qr.svg"`}:{})});return res.end(svg);
      }
      if(pub[2]==='comments'&&method==='GET')return json(res,200,all('SELECT c.id,c.body,c.createdAt,c.updatedAt,u.name author,u.id authorId FROM comments c JOIN users u ON u.id=c.authorId WHERE posterId=? ORDER BY c.createdAt',p.id));
      if(pub[2]==='comments'&&method==='POST'){const u=authenticated(req),input=await body(req),text=string(input.body,1000,'Comment');if(!text)fail(400,'Write a comment first');const c={id:id(),posterId:p.id,authorId:u.id,author:u.name,body:text,createdAt:now(),updatedAt:now()};run('INSERT INTO comments VALUES (?,?,?,?,?,?)',c.id,p.id,u.id,text,c.createdAt,c.updatedAt);if(u.id!==p.ownerId)community.notify(p.ownerId,'comment',u.name+' commented on your event',`/${p.universityId}/posters/${p.slug}`,'comment:'+c.id);wallChanged(p.universityId);return json(res,201,c);}
    }
    if(path==='/api/drafts') {
      const u=campusAccount(req);
      if(method==='GET')return json(res,200,posters.list({where:'(p.ownerId=? OR EXISTS(SELECT 1 FROM collaborators c WHERE c.posterId=p.id AND c.userId=?)) AND p.universityId=?',params:[u.id,u.id,u.universityId],order:'p.updatedAt DESC',privateView:true}));
      if(method==='POST'){const input=await body(req),uni=input.universityId;if(!get('SELECT 1 FROM universities WHERE id=?',uni||''))fail(400,'Choose a university');campusAccess(req,uni);const preset=input.preset?designPresets.find(p=>p.id===input.preset):null;if(input.preset&&!preset)fail(400,'Choose a valid design');const {id:ignoredId,name:ignoredName,note:ignoredNote,...presetDesign}=preset||{};const content={...designDefaults,...presetDesign,designVersion:'1',title:validate('title',input.title||''),subtitle:'',date:'',time:'',location:'',description:'',category:'Other',template:validate('template',preset?.template||input.template||'minimal'),style:validate('style',input.style||campusDetails[uni].style),alignment:'left',heroImageUrl:''};const posterId=id();run('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)',posterId,u.id,uni,`event-${posterId}`,'DRAFT',JSON.stringify(content),null,0,now(),now(),null);return json(res,201,view(record(posterId),true));}
    }
    const draft=path.match(/^\/api\/drafts\/([^/]+)(?:\/(fields|publish|unpublish|collaborators|image|canvas)(?:\/([^/]+))?)?$/);
    if(draft) {
      const u=authenticated(req),p=record(draft[1]);editor(p,u);const action=draft[2];
      if(method==='GET'&&!action)return json(res,200,view(p,true));
      if(action==='image'&&method==='POST')return json(res,201,await uploadImage(req,p.id));
      if(action==='canvas'&&method==='PATCH')return json(res,200,updateCanvas(p,u,await body(req)));
      if(action==='fields'&&method==='PATCH')return json(res,200,update(p,u,await body(req)));
      if(method==='DELETE'&&!action){owner(p,u);const images=all('SELECT file FROM uploads WHERE posterId=?',p.id);run('DELETE FROM posters WHERE id=?',p.id);for(const image of images)rmSync(join(uploadDir,image.file),{force:true});broadcast(p.id,'deleted',{});wallChanged(p.universityId);return json(res,200,{ok:true});}
      if((action==='publish'||action==='unpublish')&&method==='POST') {
        owner(p,u);const content=JSON.parse(p.content);
        if(action==='publish'){for(const field of ['title','date','location'])if(!content[field])fail(400,`Unable to publish: ${field} is missing`);run("UPDATE posters SET status='PUBLISHED',publicData=content,publishedAt=?,updatedAt=?,version=version+1 WHERE id=?",now(),now(),p.id);}
        else run("UPDATE posters SET status='DRAFT',publicData=NULL,publishedAt=NULL,updatedAt=?,version=version+1 WHERE id=?",now(),p.id);
        const saved=record(p.id);community.changedEvent(saved,action);const result=view(saved,true);broadcast(p.id,'poster:updated',{poster:result});wallChanged(p.universityId);return json(res,200,result);
      }
      if(action==='collaborators') {
        owner(p,u);
        if(method==='GET'&&draft[3]==='search'){
          const query=string(url.searchParams.get('q')||'',50,'Search').replace(/^@/,'').toLowerCase();
          return json(res,200,{users:query.length<2?[]:all("SELECT id,name,username FROM users WHERE id<>? AND universityId=? AND passwordHash<>'!disabled' AND (instr(lower(name),?)>0 OR instr(username,?)>0) ORDER BY name LIMIT 20",u.id,p.universityId,query,query)});
        }
        if(method==='GET')return json(res,200,all('SELECT u.id,u.name,u.email,c.role FROM collaborators c JOIN users u ON u.id=c.userId WHERE posterId=?',p.id));
        if(method==='POST'){const input=await body(req),invited=(input.userId?get('SELECT id,name,username,universityId FROM users WHERE id=? AND passwordHash<>?',string(input.userId,100,'Student'),'!disabled'):get('SELECT id,name,email,universityId FROM users WHERE email=?',string(input.email,254,'Email').toLowerCase()))||fail(404,'Ask your collaborator to register first');if(invited.id===u.id)fail(400,'You already own this poster');if(invited.universityId!==p.universityId)fail(403,'Collaborators must belong to this university');run('INSERT OR IGNORE INTO collaborators VALUES (?,?,?,?)',p.id,invited.id,'EDITOR',now());community.notify(invited.id,'collaboration',u.name+' invited you to design together','/studio/posters/'+p.id,'collab:'+p.id+':'+invited.id);return json(res,201,invited);}
        if(method==='DELETE'&&draft[3]){run('DELETE FROM collaborators WHERE posterId=? AND userId=?',p.id,draft[3]);broadcast(p.id,'access:changed',{});presence(p.id);return json(res,200,{ok:true});}
      }
    }
    if(path.startsWith('/api/'))fail(404,'Endpoint not found');if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed');
    const account=user(req),campusRoute=universities.find(([slug])=>slug===path.split('/')[1])?.[0];
    if(account&&!account.universityId&&path!=='/choose-campus'&&path!=='/login'&&!/\.[a-z]+$/.test(path)) {res.writeHead(302,{location:'/choose-campus','cache-control':'no-store'});return res.end();}
    if(account?.universityId&&campusRoute&&campusRoute!==account.universityId){res.writeHead(302,{location:`/${account.universityId}${path.endsWith('/clubs')?'/clubs':''}`,'cache-control':'no-store'});return res.end();}
    const campusPage=campusRoute&&new RegExp(`^/${campusRoute}(?:/(?:posters/[^/]+|clubs))?$`).test(path);
    if(!campusPage&&!/^\/(?:index.html|login|choose-campus|watch(?:\/[a-f0-9-]{36})?|people\/[a-f0-9-]{36}|community(?:\/[A-Za-z0-9_%.-]+){0,2}|messages|games(?:\/[a-f0-9-]{36})?|saved|my-posters|studio\/posters\/[^/]+)?$/.test(path))fail(404,'Page not found');
    await publicAssets.sendPage(req,res);
  } catch(error) {if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Unable to complete this request'});}
});
const wss=new WebSocketServer({noServer:true,maxPayload:16000});
server.on('upgrade',(req,socket,head)=>{
  try {
    sameOrigin(req);const url=new URL(req.url,'http://localhost');if(url.pathname!=='/ws')fail(404,'Not found');const posterId=url.searchParams.get('poster'),wall=url.searchParams.get('wall'),chat=url.searchParams.get('chat')==='1',inbox=url.searchParams.get('inbox')==='1',gameRoom=url.searchParams.get('game'),gameLobby=url.searchParams.get('games'),watchRoom=url.searchParams.get('watch'),watchLobby=url.searchParams.get('watchLobby'),social=url.searchParams.get('social')==='1';let u,chatCampus;
    if(social){if(posterId||wall||chat||inbox||gameRoom||gameLobby||watchRoom||watchLobby)fail(400,'Choose one community channel');u=campusAccount(req);}
    else if(watchRoom||watchLobby){if(posterId||wall||chat||inbox||gameRoom||gameLobby||watchRoom&&watchLobby)fail(400,'Invalid watch room');u=campusAccount(req);if(watchRoom)watch.checkCapacity(watch.access(watch.room(watchRoom),u),u);if(watchLobby&&watchLobby!==u.universityId)fail(403,'Watch together on your own university');}
    else if(gameRoom||gameLobby){if(posterId||wall||chat||inbox||gameRoom&&gameLobby)fail(400,'Invalid game room');u=campusAccount(req);if(gameRoom)games.access(games.room(gameRoom),u);if(gameLobby!==null&&gameLobby!==u.universityId)fail(403,'Games stay within your university');}
    else if(posterId){if(chat||inbox)fail(400,'Invalid room');u=authenticated(req);editor(record(posterId),u);}else{if(wall&&!get('SELECT 1 FROM universities WHERE id=?',wall))fail(400,'Invalid room');if(wall)campusAccess(req,wall);if(!wall&&!chat&&!inbox)fail(400,'Invalid room');if(inbox)u=campusAccount(req);}
    if(chat){chatCampus=wall||url.searchParams.get('university')||user(req)?.universityId;if(!get('SELECT 1 FROM universities WHERE id=?',chatCampus||''))fail(400,'Choose a university');campusAccess(req,chatCampus);u=user(req);}
    wss.handleUpgrade(req,socket,head,ws=>{
      ws.user=u;ws.sessionHash=hash(token(req));ws.posterId=posterId;ws.wall=wall;ws.chat=chat;ws.chatCampus=chatCampus;ws.inbox=inbox;ws.gameRoom=gameRoom;ws.gameLobby=gameLobby;ws.watchRoom=watchRoom;ws.watchLobby=watchLobby;ws.social=social;ws.callDevice=social&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(url.searchParams.get('device')||'')?url.searchParams.get('device'):null;ws.alive=true;sockets.add(ws);
      const observedChannel=posterId?'whiteboard':watchRoom||watchLobby?'watch':gameRoom||gameLobby?'games':social?'community':inbox?'inbox':chat?'chat':'wall';
      const observedResource=posterId||watchRoom||gameRoom;
      observation.websocket(req.observedActorId,observedChannel,observedResource,'connect',null,200);if(social)community.presenceChanged(u.id);
      if(posterId){send(ws,'poster:state',{poster:view(record(posterId),true)});presence(posterId);}
      if(chat)send(ws,'chat:state',{messages:chatHistory(chatCampus),limit:100,universityId:chatCampus});
      if(social)voiceCalls.sync(ws);
      if(inbox)send(ws,'inbox:state',{conversations:messaging.list(u)});
      if(watchRoom){send(ws,'watch:history',{messages:watch.history(watch.room(watchRoom))});watch.broadcast(watch.room(watchRoom));}
      if(watchLobby)send(ws,'watch:list',{rooms:watch.list(u)});
      if(gameRoom)games.broadcast(games.room(gameRoom));
      if(gameLobby)send(ws,'games:list',{rooms:games.list(u)});
      ws.on('pong',()=>{ws.alive=true;});
      ws.on('message',raw=>{let input,status=200,revision;const started=performance.now();try{
        if(!posterId||!validSocket(ws))fail(401,'Sign in to edit');input=JSON.parse(raw.toString());
        if(input.posterId!==posterId)fail(400,'Invalid room');const p=record(posterId);editor(p,u);
        if(input.type==='canvas:cursor'){if(ws.lastCursor&&Date.now()-ws.lastCursor<45)return;ws.lastCursor=Date.now();const cursor=input.cursor;if(cursor!==null&&(!cursor||!Number.isFinite(cursor.x)||!Number.isFinite(cursor.y)||Math.abs(cursor.x)>20000||Math.abs(cursor.y)>20000||cursor.selected!==null&&typeof cursor.selected!=='string'))fail(400,'Invalid cursor');let preview=null;if(cursor?.preview){if(typeof cursor.preview.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(cursor.preview.id)||!cursor.preview.props||Object.keys(cursor.preview.props).some(k=>!['x','y','width','height','rotation'].includes(k)))fail(400,'Invalid object preview');preview={id:cursor.preview.id,props:validateProps(cursor.preview.props)};}for(const peer of sockets)if(peer!==ws&&peer.posterId===posterId&&validSocket(peer)&&allowed(p,peer.user))send(peer,'canvas:cursor',{userId:u.id,name:u.name,cursor:cursor?{x:cursor.x,y:cursor.y,selected:cursor.selected?.slice(0,64)||null,preview}:null});return;}
        if(input.type==='canvas:operation'){revision=updateCanvas(p,u,input).version;return;}
        if(input.type==='poster:editing') {
          if(input.field!==null&&!Object.hasOwn(fields,input.field))fail(400,'Invalid editing field');
          ws.editingField=input.field;ws.editingUntil=Date.now()+Number(process.env.EDITING_TTL_MS||15000);presence(posterId);return;
        }
        if(input.type!=='poster:update')fail(400,'Invalid update');revision=update(p,u,input).version;
      }catch(error){status=error.status||400;const p=posterId&&get('SELECT * FROM posters WHERE id=?',posterId);send(ws,'error',{field:input?.field,requestId:input?.requestId,message:error.status?error.message:'Invalid update',status:error.status||400,poster:p&&validSocket(ws)&&allowed(p,u)?view(p,true):undefined});}finally{observation.websocket(req.observedActorId,observedChannel,observedResource,input?.type,input,status,started,revision);}});
      ws.on('close',code=>{observation.websocket(req.observedActorId,observedChannel,observedResource,'disconnect',null,code===4003?403:code===4001?401:200);sockets.delete(ws);if(social)community.presenceChanged(u.id);if(posterId)presence(posterId);if(gameRoom)games.broadcast(games.room(gameRoom));if(watchRoom)watch.broadcast(watch.room(watchRoom));});ws.on('error',()=>ws.close());
    });
  } catch(error){observation.record({actorId:req.observedActorId,action:'websocket.connect',transport:'websocket',status:error.status||400});socket.end(`HTTP/1.1 ${error.status||400} Rejected\r\nConnection: close\r\n\r\n`);}
});
setInterval(()=>{for(const ws of sockets){if((ws.social||ws.posterId||ws.inbox||ws.gameRoom||ws.gameLobby||ws.watchRoom||ws.watchLobby||ws.chat&&ws.user)&&!validSocket(ws)){ws.close(4001,'Session expired');continue;}if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);run('DELETE FROM sessions WHERE expiresAt<?',Date.now());},30000).unref();
setInterval(()=>{try{voiceCalls.tick();}catch(error){observation.record({actorId:'system',action:'calls.tick',status:500});}},1000).unref();
setInterval(()=>{try{community.remind();}catch(error){observation.record({actorId:'system',action:'community.reminders',status:500});}},60000).unref();
setInterval(()=>{try{games.tick();}catch(error){observation.record({actorId:'system',action:'games.tick',status:500});}},500).unref();
setInterval(()=>{const rooms=new Set();for(const ws of sockets)if(ws.editingField&&ws.editingUntil<=Date.now()){ws.editingField=null;rooms.add(ws.posterId);}for(const room of rooms)presence(room);},1000).unref();
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('CampusWall listening'));




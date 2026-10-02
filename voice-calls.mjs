// Audio travels between the participants; this server relays bounded signalling only.
export function createVoiceCalls({get,all,run,id,now,fail,body,json,campusAccount,sockets,send,validSocket,sessionHash}) {
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
 const live=new Map();
 run("UPDATE voice_calls SET status='ended',reason='server-restarted',endedAt=? WHERE status<>'ended'",now());
 const person=userId=>get('SELECT id,name,username,avatarId FROM users WHERE id=?',userId);
 function access(c,u){
  if(!c||![c.callerId,c.calleeId].includes(u.id))fail(404,'Call not found');
  const p=person(c.callerId),q=person(c.calleeId);
  if(!p||!q||get('SELECT universityId FROM users WHERE id=?',c.callerId)?.universityId!==u.universityId||get('SELECT universityId FROM users WHERE id=?',c.calleeId)?.universityId!==u.universityId)fail(404,'Call not found');
  return c;
 }
 const record=callId=>get('SELECT * FROM voice_calls WHERE id=?',callId);
 function view(c){const state=live.get(c.id);return {...c,caller:person(c.callerId),callee:person(c.calleeId),callerDevice:state?.caller.device||null,calleeDevice:state?.callee?.device||null};}
 function broadcast(c){for(const ws of sockets)if(ws.social&&[c.callerId,c.calleeId].includes(ws.user?.id)&&validSocket(ws))send(ws,'call:state',{call:view(c)});}
 function finish(c,reason){if(c.status==='ended')return c;run("UPDATE voice_calls SET status='ended',reason=?,endedAt=? WHERE id=? AND status<>'ended'",reason,now(),c.id);c=record(c.id);broadcast(c);live.delete(c.id);return c;}
 function online(userId,device,hash){return [...sockets].some(ws=>ws.social&&ws.user?.id===userId&&(!device||ws.callDevice===device)&&(!hash||ws.sessionHash===hash)&&validSocket(ws)&&ws.readyState===1);}
 function device(req,input,u){if(!uuid(input.device))fail(400,'Invalid call device');const hash=sessionHash(req);if(!online(u.id,input.device,hash))fail(409,'Reconnect to campus updates before calling');return {device:input.device,hash,userId:u.id};}
 function current(u){const c=all("SELECT * FROM voice_calls WHERE (callerId=? OR calleeId=?) AND status<>'ended' ORDER BY createdAt DESC LIMIT 1",u.id,u.id)[0];return c?view(access(c,u)):null;}
 let iceServers=[{urls:['stun:stun.l.google.com:19302']}];
 // A private TURN service can be configured without committing its credentials.
 if(process.env.VOICE_ICE_SERVERS){const v=JSON.parse(process.env.VOICE_ICE_SERVERS);if(!Array.isArray(v)||v.length>8||v.some(s=>!s||![s.urls].flat().every(url=>typeof url==='string'&&/^(stun|stuns|turn|turns):/.test(url))))throw Error('Invalid VOICE_ICE_SERVERS');iceServers=v;}
 async function handle(req,res,url){
  let u=campusAccount(req);const path=url.pathname,method=req.method;
  if(path==='/api/calls'&&method==='GET')return json(res,200,{call:current(u),iceServers,relayAvailable:iceServers.some(s=>[s.urls].flat().some(url=>/^turns?:/.test(url)))});
  if(path==='/api/calls'&&method==='POST'){
   const input=await body(req);u=campusAccount(req);const caller=device(req,input,u);
   if(!uuid(input.clientId)||!uuid(input.conversationId))fail(400,'Invalid call request');
   const conversation=get('SELECT * FROM conversations WHERE id=? AND (user1=? OR user2=?)',input.conversationId,u.id,u.id)||fail(404,'Conversation not found');
   const calleeId=conversation.user1===u.id?conversation.user2:conversation.user1;
   if(get('SELECT universityId FROM users WHERE id=?',calleeId)?.universityId!==u.universityId)fail(403,'Voice calls stay within your university');
   const previous=get('SELECT * FROM voice_calls WHERE callerId=? AND clientId=?',u.id,input.clientId);
   if(previous){if(previous.conversationId!==input.conversationId)fail(409,'This request already started a different call');return json(res,200,{call:view(previous)});}
   if(all("SELECT id FROM voice_calls WHERE status<>'ended' AND (callerId IN (?,?) OR calleeId IN (?,?))",u.id,calleeId,u.id,calleeId).length)fail(409,'One of you is already in a call');
   if(!online(calleeId))fail(409,'This person is offline. Try again when they are online.');
   if(get('SELECT COUNT(*) n FROM voice_calls WHERE callerId=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=5)fail(429,'Please wait before calling again');
   const callId=id();run("INSERT INTO voice_calls (id,conversationId,callerId,calleeId,clientId,status,createdAt) VALUES (?,?,?,?,?,'ringing',?)",callId,conversation.id,u.id,calleeId,input.clientId,now());
   live.set(callId,{caller,callee:null,created:Date.now(),deadline:Date.now()+35000,connected:new Set(),offers:0,answers:0,signals:new Map(),offline:new Map()});
   const c=record(callId);broadcast(c);return json(res,201,{call:view(c)});
  }
  const match=path.match(/^\/api\/calls\/([a-f0-9-]{36})(?:\/(signal))?$/);
  if(!match)fail(404,'Call operation not found');
  let c=access(record(match[1]),u);
  if(method==='GET'&&!match[2])return json(res,200,{call:view(c)});
  if(method!=='POST')fail(405,'Call operation not available');
  const input=await body(req);u=campusAccount(req);c=access(record(c.id),u);
  const selected=device(req,input,u),state=live.get(c.id),side=u.id===c.callerId?'caller':'callee';
  if(c.status==='ended')return match[2]?fail(409,'This call has ended'):json(res,200,{call:view(c)});
  if(!state)fail(409,'This call is no longer available');
  const owner=state[side];
  if(owner&&(owner.device!==selected.device||owner.hash!==selected.hash))fail(409,'This call is open on another device');
  if(match[2]){
   if(!state.callee||!['connecting','active'].includes(c.status))fail(409,'Wait for the call to be answered');
   if(!uuid(input.clientId))fail(400,'Invalid signalling request');
   const prior=state.signals.get(input.clientId),serial=JSON.stringify(input.signal);
   if(prior){if(prior!==serial)fail(409,'Conflicting signalling retry');return json(res,200,{ok:true});}
   if(state.signals.size>=320)fail(429,'Too many connection updates');
   const signal=input.signal;
   if(signal?.description){const s=signal.description;if(typeof s.sdp!=='string'||s.sdp.length>12000||!s.sdp.startsWith('v=0')||!/\bm=audio\s/.test(s.sdp)||/\bm=(video|application)\s/.test(s.sdp))fail(400,'Invalid audio description');if(side==='caller'&&s.type==='offer'&&!state.offers)state.offers++;else if(side==='callee'&&s.type==='answer'&&state.offers&&!state.answers)state.answers++;else fail(409,'Unexpected audio negotiation');}
   else if(signal&&Object.hasOwn(signal,'candidate')){const v=signal.candidate;if(v!==null&&(!v||typeof v.candidate!=='string'||v.candidate.length>2000||!/^candidate:/.test(v.candidate)||v.sdpMid!==null&&v.sdpMid!==undefined&&(typeof v.sdpMid!=='string'||v.sdpMid.length>30)||v.sdpMLineIndex!==null&&v.sdpMLineIndex!==undefined&&(!Number.isInteger(v.sdpMLineIndex)||v.sdpMLineIndex<0||v.sdpMLineIndex>5)||v.usernameFragment!==undefined&&v.usernameFragment!==null&&(typeof v.usernameFragment!=='string'||v.usernameFragment.length>256)))fail(400,'Invalid audio connection candidate');}
   else fail(400,'Invalid audio signal');
   const target=state[side==='caller'?'callee':'caller'];if(!online(target.userId,target.device,target.hash))fail(409,'The other person disconnected');
   state.signals.set(input.clientId,serial);
   for(const ws of sockets)if(ws.social&&ws.user?.id===target.userId&&ws.callDevice===target.device&&ws.sessionHash===target.hash&&validSocket(ws))send(ws,'call:signal',{callId:c.id,signal});
   return json(res,200,{ok:true});
  }
  if(input.action==='accept'){
   if(side!=='callee')fail(403,'Only the recipient can answer');
   if(c.status==='ringing'){state.callee=selected;state.deadline=Date.now()+45000;run("UPDATE voice_calls SET status='connecting',answeredAt=? WHERE id=?",now(),c.id);}
   c=record(c.id);broadcast(c);return json(res,200,{call:view(c)});
  }
  if(input.action==='reject'){
   if(side!=='callee'||c.status!=='ringing')fail(403,'Only the recipient can decline a ringing call');
   return json(res,200,{call:view(finish(c,'declined'))});
  }
  if(!owner)fail(403,'Answer the call on this device first');
  if(input.action==='hangup'||input.action==='failed')return json(res,200,{call:view(finish(c,input.action==='failed'?'connection-failed':c.status==='ringing'?'cancelled':'completed'))});
  if(input.action==='connected'){
   if(c.status==='ringing'||!state.answers)fail(409,'Audio negotiation is not ready');
   state.connected.add(u.id);if(state.connected.size===2&&c.status!=='active')run("UPDATE voice_calls SET status='active',connectedAt=? WHERE id=?",now(),c.id);
   c=record(c.id);broadcast(c);return json(res,200,{call:view(c)});
  }
  fail(400,'Unknown call action');
 }
 function sync(ws){const c=current(ws.user);if(c)send(ws,'call:state',{call:c});}
 function tick(){for(const [callId,state] of live){const c=record(callId);if(!c||c.status==='ended'){live.delete(callId);continue;}
   if(c.status!=='active'&&Date.now()>state.deadline){finish(c,c.status==='ringing'?'missed':'connection-failed');continue;}
   for(const side of ['caller','callee']){const v=state[side];if(!v)continue;if(online(v.userId,v.device,v.hash)){state.offline.delete(side);continue;}if(!state.offline.has(side))state.offline.set(side,Date.now());if(Date.now()-state.offline.get(side)>6000){finish(c,'disconnected');break;}}
  }}
 return {handle,sync,tick};
}

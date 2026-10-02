import {escapeHtml as esc} from './ui-utils.js';
import {avatar} from './chat-ui.js';
import {createAudioTransport} from './voice-transport.js';
export const voiceDevice=crypto.randomUUID();
let controller;
export function startVoiceCall(conversationId){if(!controller)throw Error('Sign in to make a voice call');return controller.start(conversationId);}
export function mountVoiceCalls(options){
 if(controller?.userId===options.user?.id)return;
 controller?.destroy();controller=null;if(!options.user)return;
 controller=createVoiceController(options);
}
export function createVoiceController({user,api,toast,navigate,media=globalThis.navigator?.mediaDevices,makeTransport=createAudioTransport}){
 let active=true,call=null,transport=null,stream=null,muted=false,acquiring=false,generation=0,offerStarted=false,reported=false,pendingCall=false,busy=false,status='',lastVersion='',signalQueue=Promise.resolve(),socketReady=false;
 const signals=[];
 const root=document.createElement('section');root.className='voice-call-panel';root.setAttribute('aria-label','Voice call');root.hidden=true;
 const remote=document.createElement('audio');remote.autoplay=true;remote.setAttribute('playsinline','');document.body.append(root,remote);
 const changed=()=>window.dispatchEvent(new CustomEvent('campus:voice',{detail:{busy:pendingCall||!!call&&call.status!=='ended',ready:socketReady}}));
 const request=(path,method='GET',data)=>api('/api/calls'+path,method,data);
 async function command(action){if(!call)return;const value=await request('/'+call.id,'POST',{action,device:voiceDevice});receive(value.call);}
 function release(){generation++;transport?.close();transport=null;for(const track of stream?.getTracks()||[])track.stop();stream=null;remote.pause();remote.srcObject=null;muted=false;offerStarted=false;signals.length=0;reported=false;}
 function errorText(error){return error.name==='NotAllowedError'?'Microphone access was not allowed. Enable it in your browser to call.':error.name==='NotFoundError'?'No microphone was found on this device.':error.message||'Unable to start audio.';}
 async function failure(error){if(!active)return;status=errorText(error);toast(status);release();if(call&&call.status!=='ended')try{await command('failed');}catch{}render();}
 async function microphone(){
  if(!media?.getUserMedia||!globalThis.isSecureContext)throw Error('Voice calls need a supported browser on HTTPS.');
  const version=generation;acquiring=true;changed();render();
  try{const obtained=await media.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});if(!active||version!==generation){obtained.getTracks().forEach(t=>t.stop());throw Error('The call was cancelled.');}stream=obtained;return obtained;}finally{acquiring=false;changed();render();}
 }
 function prepare(iceServers){
  transport=makeTransport({stream,iceServers,onSignal:signal=>request('/'+call.id+'/signal','POST',{device:voiceDevice,clientId:crypto.randomUUID(),signal}),onTrack:e=>{remote.srcObject=e.streams[0]||new MediaStream([e.track]);remote.play().catch(()=>{status='Tap Enable sound to hear your friend.';render();});},onConnected:()=>{reported=true;render();return command('connected');},onFailed:failure});
  for(const signal of signals.splice(0))transport.receive(signal);
 }
 const ownDevice=c=>c.callerId===user.id?c.callerDevice:c.calleeDevice;
 function receive(value){
  if(!active||!value)return;
  if(call?.id===value.id&&['ringing','connecting','active','ended'].indexOf(call.status)>['ringing','connecting','active','ended'].indexOf(value.status))return;
  if(call&&call.id!==value.id&&call.status!=='ended')return;
  const first=call?.id!==value.id;call=value;
  if(first){status='';lastVersion='';}
  if(value.status==='ended'){release();}
  else if(ownDevice(value)&&ownDevice(value)!==voiceDevice){release();root.hidden=true;changed();return;}
  if(value.status==='connecting'&&value.callerId===user.id&&transport&&!offerStarted){offerStarted=true;transport.offer().catch(failure);}
  render();changed();
 }
 const duration=()=>call?.connectedAt?Math.max(0,Math.floor(((call.endedAt?Date.parse(call.endedAt):Date.now())-Date.parse(call.connectedAt))/1000)):0;
 const clock=()=>{const n=duration();return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
 const reasons={'declined':'Call declined','cancelled':'Call cancelled','missed':'No answer','connection-failed':'Audio connection failed','disconnected':'Connection ended','server-restarted':'Call ended after reconnection','completed':'Call ended'};
 function render(){
  if(!active)return;if(!call&&!acquiring){root.hidden=true;return;}
  if(call&&call.status!=='ended'&&ownDevice(call)&&ownDevice(call)!==voiceDevice){root.hidden=true;return;}
  root.hidden=false;const incoming=call?.calleeId===user.id&&call.status==='ringing',ended=call?.status==='ended',peer=call?(call.callerId===user.id?call.callee:call.caller):null;
  const version=[call?.id,call?.status,incoming,acquiring,muted,status,reported].join(':');if(version===lastVersion)return;lastVersion=version;
  root.innerHTML=`<div class="voice-call-top"><span class="voice-call-label">${incoming?'INCOMING VOICE CALL':ended?'VOICE CALL':'A LITTLE CLOSER'}</span>${ended?'<button class="voice-dismiss" aria-label="Dismiss call">×</button>':''}</div><div class="voice-call-person">${peer?avatar(peer,'',false):'<span class="voice-symbol">♫</span>'}<div><h2>${esc(peer?.name||'Preparing your microphone')}</h2><p role="status">${esc(acquiring?'Waiting for microphone access…':ended?reasons[call.reason]||'Call ended':incoming?'Would you like to answer?':call?.status==='ringing'?'Calling…':reported?'Connected · '+clock():'Connecting audio…')}</p></div>${call?.status==='active'?'<span class="voice-live-dot" aria-hidden="true"></span>':''}</div>${status?`<p class="voice-call-error" role="status">${esc(status)}</p>`:''}<div class="voice-call-actions">${incoming?`<button class="voice-decline" ${acquiring?'disabled':''}>Decline</button><button class="primary voice-answer" ${acquiring?'disabled':''}>Answer call</button>`:ended?'<button class="voice-conversation">Open conversation ↗</button>':`${transport?`<button class="voice-mute" aria-pressed="${muted}">${muted?'Unmute':'Mute microphone'}</button>`:''}<button class="voice-hangup">${call?.status==='ringing'?'Cancel call':'End call'}</button>`}${reported?'<button class="voice-sound" aria-label="Enable call sound">Enable sound</button>':''}</div><p class="voice-privacy">Audio only · Your microphone stops when the call ends.</p>`;
  root.querySelector('.voice-answer')?.addEventListener('click',answer);
  root.querySelector('.voice-decline')?.addEventListener('click',()=>control('reject'));
  root.querySelector('.voice-hangup')?.addEventListener('click',()=>{release();if(call)control('hangup');else{pendingCall=false;root.hidden=true;changed();}});
  root.querySelector('.voice-mute')?.addEventListener('click',()=>{muted=!muted;transport?.mute(muted);render();});
  root.querySelector('.voice-sound')?.addEventListener('click',()=>remote.play().then(()=>{status='';render();}).catch(e=>toast(errorText(e))));
  root.querySelector('.voice-dismiss')?.addEventListener('click',()=>{call=null;lastVersion='';root.hidden=true;changed();});
  root.querySelector('.voice-conversation')?.addEventListener('click',()=>navigate('/messages?conversation='+call.conversationId));
 }
 async function control(action){if(busy)return;busy=true;try{await command(action);}catch(e){toast(errorText(e));await refresh();}finally{busy=false;}}
 async function answer(){if(acquiring||busy||!call)return;busy=true;const callId=call.id;try{const config=await request('');await microphone();if(call?.id!==callId||call.status!=='ringing')return release();prepare(config.iceServers);await command('accept');}catch(error){if(call?.status==='ringing'){status=errorText(error);toast(status);release();render();}else await failure(error);}finally{busy=false;}}
 async function start(conversationId){
  if(pendingCall||call&&call.status!=='ended')throw Error('Finish your current call first.');if(!socketReady)throw Error('Wait for the live connection before calling.');
  pendingCall=true;call=null;lastVersion='';status='';changed();const version=++generation;
  try{const config=await request('');if(config.call)throw Error('You already have a call on another device.');await microphone();if(!active||version!==generation)return;prepare(config.iceServers);const value=await request('','POST',{conversationId,clientId:crypto.randomUUID(),device:voiceDevice});if(!active||version!==generation){await request('/'+value.call.id,'POST',{action:'hangup',device:voiceDevice});return;}receive(value.call);}
  catch(error){release();if(call&&call.status!=='ended'&&ownDevice(call)===voiceDevice)try{await command('failed');}catch{}root.hidden=true;throw Error(errorText(error));}finally{pendingCall=false;changed();}
 }
 async function refresh(){try{const result=await request('');if(active){if(result.call)receive(result.call);else if(call&&call.status!=='ended'){const ended=await request('/'+call.id);receive(ended.call);}}}catch(e){if(e.status===401){release();root.hidden=true;}}}
 function social(event){const value=event.detail;if(value.type==='social:connected'){socketReady=true;changed();refresh();}if(value.type==='social:disconnected'){socketReady=false;changed();}if(value.type==='call:state')receive(value.call);if(value.type==='call:signal'&&value.callId===call?.id&&ownDevice(call)===voiceDevice){signalQueue=signalQueue.then(()=>transport?transport.receive(value.signal):signals.push(value.signal));signalQueue.catch(failure);}}
 window.addEventListener('campus:community',social);const timer=setInterval(()=>{const p=root.querySelector('.voice-call-person [role=status]');if(p&&call?.status==='active')p.textContent='Connected · '+clock();},1000);
 const unload=()=>{release();if(call&&call.status!=='ended'&&ownDevice(call)===voiceDevice)fetch('/api/calls/'+call.id,{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({action:'hangup',device:voiceDevice})}).catch(()=>{});};window.addEventListener('pagehide',unload);
 return {userId:user.id,start,destroy(){active=false;unload();clearInterval(timer);window.removeEventListener('campus:community',social);window.removeEventListener('pagehide',unload);root.remove();remote.remove();},receive};
}

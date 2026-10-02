import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountWatch} from '../public/watch.js';
import {mountPlayer} from '../public/watch-player.js';

async function fixture({host=true}={}){
 const dom=new JSDOM('<main id="app"></main>',{url:'https://campus.example/watch/11111111-1111-1111-1111-111111111111',pretendToBeVisual:true});
 const keys=['window','document','location','WebSocket','setInterval','clearInterval'];const previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]])),oldNow=Date.now;let time=1700000000000,tick,provider,socket;
 Date.now=()=>time;Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}});
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const user={id:'alex',name:'Alex',universityId:'anu'},peer={id:'riley',name:'Riley'},roomId='11111111-1111-1111-1111-111111111111';
 let room={id:roomId,title:'Player regression fixture',hostId:host?user.id:peer.id,host:host?user:peer,online:[user,peer],media:{kind:'youtube',videoId:'M7lc1UVf-VE'},position:0,playing:false,buffering:false,anchorAt:time,serverTime:time,version:0,closed:false};
 const requests=[];let pending,hold=false;
 const snapshot=()=>({...room,serverTime:time});
 class FakePlayer{
  constructor(root,options){provider=this;this.events=options.events;this.position=0;this.state=-1;this.duration=600;this.plays=0;this.pauses=0;this.seeks=[];queueMicrotask(()=>this.events.onReady({target:this}));}
  getCurrentTime(){return this.position;}getDuration(){return this.duration;}getPlayerState(){return this.state;}mute(){}unMute(){}destroy(){}
  emit(state){this.state=state;this.events.onStateChange({data:state,target:this});}
  playVideo(){this.plays++;this.emit(1);}pauseVideo(){this.pauses++;this.emit(2);}seekTo(t){this.seeks.push(t);this.position=t;}
 }
 window.YT={Player:FakePlayer};
 globalThis.WebSocket=class{constructor(){socket=this;queueMicrotask(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'watch:history',messages:[]})});this.onmessage?.({data:JSON.stringify({type:'watch:state',room:snapshot()})});});}close(){}};
 async function api(path,method='GET',data){if(method==='GET')return {room:snapshot()};assert.ok(host,'Viewer must not publish room controls');requests.push(data);if(hold)await new Promise(resolve=>pending=resolve);assert.equal(data.version,room.version);room={...room,position:data.position,playing:data.action==='play'?true:data.action==='pause'?false:room.playing,buffering:data.action==='buffer'?data.buffering:['play','pause'].includes(data.action)?false:room.buffering,anchorAt:time,version:room.version+1};return {room:snapshot()};}
 const panel=mountWatch(document.querySelector('#app'),{user,campus:{shortName:'ANU'},api,navigate(){},toast(){},onAuthExpired(){throw Error('Unexpected auth expiry');},roomId});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};await flush();
 return {provider,requests,publish(props){room={...room,...props,version:room.version+1};socket.onmessage({data:JSON.stringify({type:'watch:state',room:snapshot()})});},closeRoom(){room={...room,closed:true,playing:false,version:room.version+1};socket.onmessage({data:JSON.stringify({type:'watch:state',room:snapshot()})});socket.onclose({code:4003});},get root(){return document.querySelector('#app');},get room(){return room;},async advance(seconds=1){time+=seconds*1000;if(provider.state===1)provider.position+=seconds;tick();await flush();},hold(){hold=true;},async release(){hold=false;pending?.();await flush();},flush,destroy(){panel.destroy();Date.now=oldNow;Object.assign(globalThis,previous);dom.window.close();}};
}

test('clicking the embedded host play/pause controls publishes room state and keeps playing after the sync timer',async()=>{
 const f=await fixture();try{f.provider.emit(1);await f.flush();assert.equal(f.room.playing,true);assert.equal(f.requests[0].action,'play');for(let i=0;i<45;i++)await f.advance();assert.equal(f.provider.state,1);assert.equal(f.provider.position,45);assert.equal(f.provider.pauses,0);assert.equal(f.provider.seeks.length,0);f.provider.emit(2);await f.flush();assert.equal(f.room.playing,false);assert.equal(f.requests.at(-1).action,'pause');await f.advance(2);assert.equal(f.provider.state,2);assert.equal(f.provider.position,45);}finally{f.destroy();}
});

test('buffering never starts a repeated play/seek loop; resumed host time reanchors viewers without ending the film early',async()=>{
 const f=await fixture();try{f.provider.emit(1);await f.flush();await f.advance(5);const before=f.provider.position;f.provider.emit(3);for(let i=0;i<12;i++)await f.advance();assert.equal(f.provider.position,before);assert.equal(f.provider.seeks.length,0);assert.equal(f.provider.plays,0);assert.equal(f.room.playing,true);f.provider.duration=10;f.provider.emit(1);await f.advance();assert.equal(f.provider.state,1,'Clock elapsed during buffering must not end the actual host video');f.provider.duration=600;assert.equal(f.room.position,before);assert.equal(f.requests.at(-1).action,'buffer');assert.equal(f.requests.at(-1).buffering,false);assert.equal(f.provider.seeks.length,0);f.provider.position=595;await f.advance(1);assert.equal(f.provider.state,1,'Wall clock cannot end a buffered host before its actual playhead');f.provider.position=2;f.provider.emit(0);await f.flush();assert.equal(f.room.playing,true,'A provider ended event far from the end must not pause everyone');await f.advance();assert.equal(f.provider.state,1);f.provider.position=600;f.provider.emit(0);await f.flush();assert.equal(f.room.playing,false,'A genuine video ending pauses the room');}finally{f.destroy();}
});

test('slow host acknowledgements do not fight user playback and viewers cannot take over room controls',async()=>{
 let f=await fixture();try{f.hold();f.provider.emit(1);await f.advance(2);assert.equal(f.provider.pauses,0);assert.equal(f.provider.state,1);await f.release();assert.equal(f.room.playing,true);assert.equal(f.provider.position,2,'A delayed acknowledgement must not rewind the host');assert.equal(f.provider.seeks.length,0);assert.equal(f.requests.length,1);}finally{f.destroy();}
 f=await fixture({host:false});try{f.provider.emit(1);await f.advance();assert.equal(f.provider.state,2);assert.equal(f.requests.length,0);assert.equal(f.room.playing,false);}finally{f.destroy();}
});


async function lobbyFixture({reject=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://campus.example/watch',pretendToBeVisual:true});const keys=['window','document','location','WebSocket'],previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
 const user={id:'alex',name:'Alex',universityId:'anu'},own={id:'11111111-1111-1111-1111-111111111111',title:'My screening',host:user,media:{kind:'file'},playing:false,online:[]},other={...own,id:'22222222-2222-2222-2222-222222222222',title:'Friend screening',host:{id:'riley',name:'Riley'}};let rooms=[own,other],socket,release;const requests=[],toasts=[];
 globalThis.WebSocket=class{constructor(){socket=this;queueMicrotask(()=>this.onopen?.());}close(){}};
 async function api(path,method='GET',data){if(method==='GET')return path==='/api/watch/rooms'?{rooms}:{room:{...own,version:12}};requests.push({path,data});if(reject)throw Object.assign(Error('Only the host can close this room'),{status:403});await new Promise(resolve=>release=resolve);rooms=[other];socket.onmessage({data:JSON.stringify({type:'watch:list',rooms})});return {room:{...own,closed:true}};}
 const root=document.querySelector('main'),panel=mountWatch(root,{user,campus:{shortName:'ANU'},api,navigate(){throw Error('Close must not navigate into the room');},toast:message=>toasts.push(message),onAuthExpired(){throw Error('Unexpected auth expiry');}});const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};await flush();return {root,requests,toasts,flush,rerender(){socket.onmessage({data:JSON.stringify({type:'watch:list',rooms})});},async release(){release();await flush();},destroy(){panel.destroy();Object.assign(globalThis,previous);dom.window.close();}};
}

test('lobby close is visible only on the host card, survives live rerenders, and removes the card after acceptance',async()=>{
 const f=await lobbyFixture();try{const button=f.root.querySelector('[data-close-room]');assert.equal(f.root.querySelectorAll('[data-close-room]').length,1);assert.equal(button.closest('a'),null);assert.match(button.getAttribute('aria-label'),/My screening/);button.click();await f.flush();assert.equal(f.requests.length,1);assert.equal(f.requests[0].data.action,'close');assert.equal(f.requests[0].data.version,12,'Closing uses the latest room revision');f.rerender();const busy=f.root.querySelector('[data-close-room]');assert.ok(busy.disabled);busy.click();assert.equal(f.requests.length,1);await f.release();assert.equal(f.root.querySelector('[data-close-room]'),null);assert.ok(!f.root.textContent.includes('My screening'));assert.ok(f.root.textContent.includes('Friend screening'));assert.equal(f.toasts.length,1);}finally{f.destroy();}
});

test('a rejected lobby close leaves the room visible, restores its button, and never reports success',async()=>{
 const f=await lobbyFixture({reject:true});try{f.root.querySelector('[data-close-room]').click();await f.flush();assert.ok(f.root.textContent.includes('My screening'));assert.equal(f.root.querySelector('[data-close-room]').disabled,false);assert.match(f.root.querySelector('.watch-error').textContent,/Only the host/);assert.equal(f.toasts.length,0);}finally{f.destroy();}
});


test('room closure stops playback and shows an ended state instead of reconnecting',async()=>{
 const f=await fixture();try{f.provider.emit(1);await f.flush();f.closeRoom();await f.advance(3);assert.equal(f.provider.state,2);assert.equal(f.root.querySelector('.watch-connection').textContent,'Room closed');for(const selector of ['.watch-play','.watch-close','.watch-source-button','.watch-seek','.watch-send'])assert.ok(f.root.querySelector(selector).disabled,selector+' must be disabled after closure');assert.match(f.root.querySelector('.watch-player-status').textContent,/host has closed/);assert.equal(f.requests.length,1);}finally{f.destroy();}
});

test('permission/presence revisions do not force seeks; unresolved drift correction is rate bounded',async()=>{
 const f=await fixture({host:false});try{
  f.publish({playing:true,position:20,anchorAt:Date.now()});await f.flush();
  const initial=f.provider.seeks.length;f.provider.position=18;
  for(let i=0;i<10;i++)f.publish({inviteOnly:!!(i%2)});
  assert.equal(f.provider.seeks.length,initial,'Non-playback revisions must not seek through small drift');
  // A provider can acknowledge a seek slowly while it remains nominally ready.
  f.provider.seekTo=t=>f.provider.seeks.push(t);f.provider.position=0;
  for(let i=0;i<12;i++){f.provider.position=0;await f.advance();}
  assert.ok(f.provider.seeks.length-initial<=3,'Seek retries must not run every sync tick');
  assert.equal(f.requests.length,0);
 }finally{f.destroy();}
});

test('host buffering freezes the shared clock and viewers resume from the saved playhead',async()=>{
 const f=await fixture({host:false});try{
  f.provider.state=1;f.publish({playing:true,position:7,anchorAt:Date.now(),buffering:true});await f.flush();
  const seeks=f.provider.seeks.length;await f.advance(20);
  assert.equal(f.provider.position,7);assert.equal(f.provider.state,2);
  assert.equal(f.provider.seeks.length,seeks);assert.match(f.root.querySelector('.watch-control-hint').textContent,/host is buffering/);
  f.publish({buffering:false,position:7,anchorAt:Date.now()});await f.flush();await f.advance(2);
  assert.equal(f.provider.state,1);assert.equal(f.provider.position,9);
  assert.equal(f.requests.length,0);
 }finally{f.destroy();}
});

test('autoplay denial waits for user activation instead of retrying on every timer tick',async()=>{
 const f=await fixture({host:false});try{
  f.publish({playing:true,position:0,anchorAt:Date.now()});await f.flush();
  f.provider.state=-1;f.provider.events.onAutoplayBlocked();const attempts=f.provider.plays;
  for(let i=0;i<30;i++)await f.advance();assert.equal(f.provider.plays,attempts);
  f.root.querySelector('.watch-unlock').click();await f.flush();assert.equal(f.provider.plays,attempts+1);
  assert.equal(f.provider.state,1);assert.equal(f.requests.length,0);
 }finally{f.destroy();}
});

test('a host pause during buffering remains paused after the buffering acknowledgement',async()=>{
 const f=await fixture();try{
  f.provider.emit(1);await f.flush();f.provider.emit(3);await f.flush();
  assert.equal(f.room.buffering,true);f.provider.emit(2);await f.flush();await f.advance(5);
  assert.equal(f.room.playing,false);assert.equal(f.room.buffering,false);assert.equal(f.provider.state,2);
  assert.equal(f.requests.at(-1).action,'pause');
 }finally{f.destroy();}
});

test('HLS uses a worker and bounded buffers; known live playlists avoid VOD clock corrections',async()=>{
 const dom=new JSDOM('<div id="player"></div>',{url:'https://campus.example/watch',pretendToBeVisual:true});
 const keys=['window','document','location'],previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));let player,instance,config;
 try{
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
  const proto=window.HTMLMediaElement.prototype;proto.canPlayType=()=>'';proto.pause=()=>{};proto.load=()=>{};
  window.Hls=class{static Events={LEVEL_LOADED:'level',ERROR:'error'};static isSupported(){return true;}constructor(value){config=value;instance=this;this.events={};}on(name,fn){this.events[name]=fn;}loadSource(){}attachMedia(){}destroy(){}};
  player=mountPlayer(document.querySelector('#player'),{kind:'hls',url:'https://example.com/stream.m3u8'},{onReady(){},onError(){},onEnded(){},onStatus(){}});
  for(let i=0;i<10;i++)await Promise.resolve();const video=document.querySelector('video');
  Object.defineProperty(video,'duration',{value:120});
  assert.equal(config.enableWorker,true);assert.equal(config.lowLatencyMode,false);assert.equal(config.backBufferLength,30);assert.equal(video.preload,'auto');
  instance.events.level(null,{details:{live:true}});assert.equal(player.live,true);
  instance.events.level(null,{details:{live:false}});assert.equal(player.live,false);
 }finally{player?.destroy();Object.assign(globalThis,previous);dom.window.close();}
});

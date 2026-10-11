import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPlayer} from '../public/watch-player.js';
import {mountWatch} from '../public/watch.js';

const variants=[
 {width:0,height:0,bitrate:96000,audioCodec:'mp4a.40.2'},
 {width:640,height:360,bitrate:750000,videoCodec:'avc1.42e01e',audioCodec:'mp4a.40.2'},
 {width:1280,height:720,bitrate:2200000,videoCodec:'avc1.4d401f',audioCodec:'mp4a.40.2'},
 {width:1280,height:720,bitrate:3600000,videoCodec:'avc1.4d401f',audioCodec:'mp4a.40.2'}
];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

async function fixture({kind='hls',native=false}={}){
 const dom=new JSDOM('<div id="player"></div>',{url:'https://campus.example/watch/quality-test',pretendToBeVisual:true});
 const keys=['window','document','location'],previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
 const mediaCalls={plays:0,pauses:0,loads:0,timeWrites:[]},notices=[],errors=[],statuses=[],playbacks=[],instances=[],players=[],deprecatedCalls=[];
 const proto=window.HTMLMediaElement.prototype;
 proto.canPlayType=type=>native&&type==='application/vnd.apple.mpegurl'?'probably':'';
 proto.play=async()=>{mediaCalls.plays++;};proto.pause=()=>{mediaCalls.pauses++;};proto.load=()=>{mediaCalls.loads++;};
 if(native)window.ManagedMediaSource=class{};
 window.Hls=class{
  static Events={MANIFEST_PARSED:'manifest',LEVEL_SWITCHED:'switched',LEVELS_UPDATED:'updated',LEVEL_LOADED:'loaded',ERROR:'error'};
  static isSupported(){return true;}
  constructor(config){this.config=config;this.events=new Map();this.levels=[];this.manualLevel=-1;this.levelWrites=[];this.immediateWrites=[];this.destroyed=false;instances.push(this);}
  on(name,fn){const handlers=this.events.get(name)||[];handlers.push(fn);this.events.set(name,handlers);}
  emit(name,data={}){for(const fn of this.events.get(name)||[])fn(name,data);}
  get nextLevel(){return this.manualLevel;}
  set nextLevel(value){this.levelWrites.push(value);this.manualLevel=value;}
  get currentLevel(){return this.actualLevel??-1;}
  set currentLevel(value){this.immediateWrites.push(value);this.actualLevel=value;}
  get autoLevelEnabled(){return this.manualLevel===-1;}
  loadSource(url){this.url=url;}attachMedia(video){this.video=video;}
  destroy(){this.destroyed=true;}
 };
 window.YT={Player:class{
  constructor(element,options){this.options=options;this.position=45.25;this.playCalls=0;this.pauseCalls=0;this.seeks=[];this.rate=1;this.rateRequests=[];this.muted=true;this.destroyed=false;players.push(this);queueMicrotask(()=>options.events.onReady({target:this}));}
  getCurrentTime(){return this.position;}getDuration(){return 600;}getPlayerState(){return 1;}
  isMuted(){return this.muted;}mute(){this.muted=true;}unMute(){this.muted=false;}playVideo(){this.playCalls++;}pauseVideo(){this.pauseCalls++;}seekTo(value){this.seeks.push(value);this.position=value;}
  setPlaybackRate(value){this.rateRequests.push(value);this.rate=value;this.options.events.onPlaybackRateChange?.({data:value,target:this});}
  setPlaybackQuality(){deprecatedCalls.push('setPlaybackQuality');throw Error('Deprecated YouTube quality setting must not be called');}
  getAvailableQualityLevels(){deprecatedCalls.push('getAvailableQualityLevels');throw Error('Deprecated YouTube quality discovery must not be called');}
  getPlaybackQuality(){deprecatedCalls.push('getPlaybackQuality');throw Error('Deprecated YouTube quality polling must not be called');}
  destroy(){this.destroyed=true;}
 }};
 const root=document.querySelector('#player'),media=kind==='youtube'?{kind,videoId:'M7lc1UVf-VE'}:{kind,url:kind==='hls'?'https://video.example/master.m3u8':'https://video.example/film.mp4'};
 let player=mountPlayer(root,media,{onReady(){},onError:message=>errors.push(message),onEnded(){},onStatus:message=>statuses.push(message),onPlayback:value=>playbacks.push(value),onQualityChange:value=>notices.push(value)});
 await flush();const video=root.querySelector('video');let time=45.25;
 if(video){Object.defineProperties(video,{currentTime:{configurable:true,get:()=>time,set:value=>{mediaCalls.timeWrites.push(value);time=value;}},duration:{configurable:true,value:600},readyState:{configurable:true,value:4},paused:{configurable:true,value:false},ended:{configurable:true,value:false}});video.dispatchEvent(new window.Event('loadedmetadata'));}
 return {root,player,video,mediaCalls,notices,errors,statuses,playbacks,instances,players,deprecatedCalls,get hls(){return instances.at(-1);},get youtube(){return players.at(-1);},parse(levels=variants){this.hls.levels=levels.map(level=>({...level}));this.hls.emit(window.Hls.Events.MANIFEST_PARSED,{levels:this.hls.levels});},flush,destroy(){player?.destroy();player=null;Object.assign(globalThis,previous);dom.window.close();}};
}

test('HLS quality options use actual video variants and preserve their original manifest indices',async()=>{
 const f=await fixture();try{
  assert.equal(f.player.quality.mode,'hls');
  assert.deepEqual(f.player.quality.options.filter(option=>option.value!=='-1'),[],'No fabricated options exist before a manifest arrives');
  f.parse();const quality=f.player.quality;
  assert.deepEqual(quality.options.map(option=>option.value),['-1','1','2','3']);
  assert.match(quality.options[0].label,/auto/i);assert.match(quality.options[1].label,/360/);
  assert.match(quality.options[2].label,/720/);assert.match(quality.options[3].label,/720/);
  assert.equal(quality.selected,'-1');assert.ok(f.notices.length>0,'Manifest discovery announces the available source qualities');
  assert.deepEqual(f.errors,[]);
 }finally{f.destroy();}
});

test('manual HLS quality changes are non-disruptive and Auto restores adaptive selection',async()=>{
 const f=await fixture();try{
  f.parse();const before={...f.mediaCalls,timeWrites:[...f.mediaCalls.timeWrites]},writes=f.hls.levelWrites.length;
  assert.equal(f.player.setQuality('2'),true);assert.equal(f.hls.levelWrites.at(-1),2);assert.equal(f.player.quality.selected,'2');
  f.hls.actualLevel=2;f.hls.emit(window.Hls.Events.LEVEL_SWITCHED,{level:2});assert.match(f.player.quality.current,/720/);
  assert.equal(f.player.setQuality('-1'),true);assert.equal(f.hls.levelWrites.at(-1),-1);assert.equal(f.player.quality.selected,'-1');
  assert.equal(f.hls.levelWrites.length-writes,2);assert.deepEqual(f.hls.immediateWrites,[],'Quality changes must not flush the current buffer');
  assert.deepEqual(f.mediaCalls,before,'Quality changes must not seek, pause, reload or restart playback');assert.equal(f.player.time,45.25);
 }finally{f.destroy();}
});

test('updated HLS variants refresh available options and actual quality without restarting playback',async()=>{
 const f=await fixture();try{
  f.parse();f.player.setQuality('2');const before={...f.mediaCalls,timeWrites:[...f.mediaCalls.timeWrites]},writes=[...f.hls.levelWrites],notices=f.notices.length;
  f.hls.levels=[variants[0],variants[1],{width:1920,height:1080,bitrate:4500000,videoCodec:'avc1.640028'}];
  f.hls.emit(window.Hls.Events.LEVELS_UPDATED,{levels:f.hls.levels});assert.deepEqual(f.player.quality.options.map(option=>option.value),['-1','1','2']);
  assert.match(f.player.quality.options[2].label,/1080/);assert.equal(f.player.quality.selected,'2');
  f.hls.emit(window.Hls.Events.LEVEL_SWITCHED,{level:2});assert.match(f.player.quality.current,/1080/);assert.ok(f.notices.length>=notices+2);
  assert.deepEqual(f.mediaCalls,before);assert.deepEqual(f.hls.levelWrites,writes);assert.deepEqual(f.hls.immediateWrites,[]);
 }finally{f.destroy();}
});

test('unknown, malformed and audio-only quality values cannot select a video level',async()=>{
 const f=await fixture();try{
  f.parse();f.player.setQuality('1');const writes=[...f.hls.levelWrites],quality=f.player.quality.selected,before={...f.mediaCalls,timeWrites:[...f.mediaCalls.timeWrites]};
  for(const value of ['0','99','1.5','01','NaN','Infinity','',null,undefined,{}]){
   assert.equal(f.player.setQuality(value),false);
   assert.deepEqual(f.hls.levelWrites,writes,`Invalid quality ${String(value)} must not reach HLS`);
   assert.equal(f.player.quality.selected,quality);
  }
  assert.deepEqual(f.hls.immediateWrites,[]);assert.deepEqual(f.mediaCalls,before);
 }finally{f.destroy();}
});

test('destroyed source callbacks cannot update quality or announce options for another player',async()=>{
 const f=await fixture();try{
  f.parse();const stale=f.hls;f.player.destroy();const notices=f.notices.length;
  const nextRoot=document.createElement('div');document.body.append(nextRoot);let nextNotices=0;
  const next=mountPlayer(nextRoot,{kind:'file',url:'https://video.example/second.mp4'},{onReady(){},onError(){},onEnded(){},onStatus(){},onQualityChange(){nextNotices++;}});
  try{
   await flush();const nextBefore=structuredClone(next.quality),nextCount=nextNotices;
   stale.levels=[{width:3840,height:2160,bitrate:12000000,videoCodec:'avc1.640033'}];
   stale.emit(window.Hls.Events.MANIFEST_PARSED,{levels:stale.levels});stale.emit(window.Hls.Events.LEVEL_SWITCHED,{level:0});stale.emit(window.Hls.Events.LEVELS_UPDATED,{levels:stale.levels});
   assert.ok(stale.destroyed);assert.equal(f.notices.length,notices,'Stale quality events must not notify a room');
   assert.deepEqual(next.quality,nextBefore);assert.equal(nextNotices,nextCount);
   const writes=stale.levelWrites.length;assert.equal(f.player.setQuality('0'),false);
   assert.equal(stale.levelWrites.length,writes,'A destroyed player must not send new level changes');
  }finally{next.destroy();}
 }finally{f.destroy();}
});

test('YouTube offers its native settings and observes quality without deprecated control APIs',async()=>{
 const f=await fixture({kind:'youtube'});try{
  const youtube=f.youtube;assert.equal(youtube.options.playerVars.controls,1,'YouTube settings must remain available in the embedded player');
  assert.equal(youtube.options.playerVars.hl,'en','The embedded settings should request English labels');
  assert.equal(youtube.options.playerVars.fs,0,'Application fullscreen must retain its shared-screen overlays');
  assert.equal(f.player.quality.mode,'youtube');assert.deepEqual(f.player.quality.options,[]);
  youtube.options.events.onPlaybackQualityChange({data:'hd720',target:youtube});assert.match(f.player.quality.current,/720/);
  assert.ok(f.notices.length>0);const calls={play:youtube.playCalls,pause:youtube.pauseCalls,seeks:[...youtube.seeks]};
  assert.equal(f.player.setQuality('small'),false);
  assert.deepEqual({play:youtube.playCalls,pause:youtube.pauseCalls,seeks:youtube.seeks},calls);
  assert.equal(f.player.time,45.25);const before=structuredClone(f.player.quality),notices=f.notices.length;
  f.player.destroy();youtube.options.events.onPlaybackQualityChange({data:'small',target:youtube});
  assert.ok(youtube.destroyed);assert.equal(f.notices.length,notices);assert.deepEqual(f.player.quality,before,'A stale YouTube event cannot change quality state');
  assert.deepEqual(f.deprecatedCalls,[]);assert.deepEqual(f.errors,[]);
 }finally{f.destroy();}
});

test('YouTube native speed changes restore normal room speed without an acknowledgement loop or playback controls',async()=>{
 const f=await fixture({kind:'youtube'});try{
  const youtube=f.youtube;youtube.rate=2;youtube.options.events.onPlaybackRateChange({data:2,target:youtube});
  assert.equal(youtube.rate,1);assert.deepEqual(youtube.rateRequests,[1]);assert.equal(f.statuses.length,1);assert.match(f.statuses[0],/normal playback speed.*sync/i);
  youtube.options.events.onPlaybackRateChange({data:1,target:youtube});assert.deepEqual(youtube.rateRequests,[1]);assert.equal(f.statuses.length,1,'A normal-speed acknowledgement must not issue another command or status');
  assert.equal(youtube.playCalls,0);assert.equal(youtube.pauseCalls,0);assert.deepEqual(youtube.seeks,[]);assert.equal(f.player.time,45.25);assert.deepEqual(f.playbacks,[],'Restoring speed must not publish a room play/pause signal');
  f.player.destroy();youtube.options.events.onPlaybackRateChange({data:.5,target:youtube});
  assert.deepEqual(youtube.rateRequests,[1]);assert.equal(f.statuses.length,1);assert.deepEqual(f.playbacks,[]);assert.deepEqual(f.errors,[]);
 }finally{f.destroy();}
});

test('personal sound toggles observe changes made through the native player volume controls',async()=>{
 for(const kind of ['youtube','file']){
  const f=await fixture({kind});try{
   assert.equal(f.player.muted,true);if(f.youtube)f.youtube.muted=false;else f.video.muted=false;
   assert.equal(f.player.muted,false,'Native sound changes must be reflected by the custom sound button');
   assert.equal(f.player.sound(),true);assert.equal(f.player.muted,true);assert.equal(f.player.sound(),false);assert.equal(f.player.muted,false);
   assert.equal(f.player.time,45.25);assert.deepEqual(f.mediaCalls.timeWrites,[]);
   if(f.youtube){assert.equal(f.youtube.playCalls,0);assert.equal(f.youtube.pauseCalls,0);assert.deepEqual(f.youtube.seeks,[]);}
  }finally{f.destroy();}
 }
});

test('direct files and browser-native HLS do not fabricate selectable resolutions',async()=>{
 for(const options of [{kind:'file'},{kind:'hls',native:true}]){
  const f=await fixture(options);try{
   assert.equal(f.player.quality.mode,options.native?'native':'file');assert.deepEqual(f.player.quality.options,[]);
   assert.equal(f.instances.length,0,'Native playback must not create an HLS.js controller');
   const before={...f.mediaCalls,timeWrites:[...f.mediaCalls.timeWrites]};assert.equal(f.player.setQuality('720'),false);
   assert.deepEqual(f.mediaCalls,before);assert.equal(f.player.time,45.25);assert.deepEqual(f.errors,[]);
  }finally{f.destroy();}
 }
});

async function roomFixture(){
 const dom=new JSDOM('<main id="first"></main><main id="second"></main>',{url:'https://campus.example/watch/11111111-1111-1111-1111-111111111111',pretendToBeVisual:true});
 const keys=['window','document','location','WebSocket','setInterval','clearInterval'],previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,setInterval:()=>1,clearInterval(){}});
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const instances=[],sockets=[],requests=[],mounted=[],mediaCalls=[];
 const proto=window.HTMLMediaElement.prototype;proto.canPlayType=()=>'';
 proto.pause=function(){mediaCalls.push({action:'pause',video:this});};proto.play=async function(){mediaCalls.push({action:'play',video:this});};proto.load=function(){mediaCalls.push({action:'load',video:this});};
 window.Hls=class{
  static Events={MANIFEST_PARSED:'manifest',LEVEL_SWITCHED:'switched',LEVELS_UPDATED:'updated',LEVEL_LOADED:'loaded',ERROR:'error'};static isSupported(){return true;}
  constructor(){this.events=new Map();this.levels=[];this.manualLevel=-1;this.levelWrites=[];this.destroyed=false;instances.push(this);}
  on(name,fn){const handlers=this.events.get(name)||[];handlers.push(fn);this.events.set(name,handlers);}emit(name,data={}){for(const fn of this.events.get(name)||[])fn(name,data);}
  set nextLevel(value){this.manualLevel=value;this.levelWrites.push(value);}get nextLevel(){return this.manualLevel;}
  set currentLevel(value){assert.fail('Room quality changes must not flush a buffered HLS level: '+value);}
  loadSource(){}attachMedia(video){this.video=video;}destroy(){this.destroyed=true;}
 };
 const users=[{id:'viewer-first',name:'First viewer',universityId:'anu'},{id:'viewer-second',name:'Second viewer',universityId:'anu'}],host={id:'host',name:'Room host',universityId:'anu'},roomId='11111111-1111-1111-1111-111111111111';
 let room={id:roomId,title:'Quality regression TEST',hostId:host.id,host,online:[host,...users],media:{kind:'hls',url:'https://video.example/master.m3u8'},position:0,playing:false,buffering:false,anchorAt:Date.now(),serverTime:Date.now(),version:0,closed:false};
 globalThis.WebSocket=class{constructor(){sockets.push(this);queueMicrotask(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'watch:history',messages:[]})});this.onmessage?.({data:JSON.stringify({type:'watch:state',room})});});}close(){}};
 async function api(path,method='GET',data){if(method==='GET')return {room};requests.push({path,method,data});throw Error('Viewer quality must not publish room control requests');}
 const roots=[document.querySelector('#first'),document.querySelector('#second')];
 for(let i=0;i<roots.length;i++)mounted.push(mountWatch(roots[i],{user:users[i],campus:{shortName:'ANU'},api,roomId,navigate(){},toast(){},onAuthExpired(){throw Error('Unexpected auth expiry');}}));
 await flush();
 for(const instance of instances){Object.defineProperties(instance.video,{duration:{configurable:true,value:600},readyState:{configurable:true,value:4},paused:{configurable:true,value:true}});instance.video.dispatchEvent(new window.Event('loadedmetadata'));instance.levels=variants.map(level=>({...level}));instance.emit(window.Hls.Events.MANIFEST_PARSED,{levels:instance.levels});}
 await flush();
 return {roots,instances,sockets,requests,mediaCalls,flush,get room(){return room;},publish(props){room={...room,...props,serverTime:Date.now(),version:room.version+1};for(const socket of sockets)socket.onmessage({data:JSON.stringify({type:'watch:state',room})});},destroy(){for(const panel of mounted)panel.destroy();Object.assign(globalThis,previous);dom.window.close();}};
}

test('each viewer can choose a personal HLS quality without changing the shared room or another viewer',async()=>{
 const f=await roomFixture();try{
  const first=f.roots[0].querySelector('select.watch-quality'),second=f.roots[1].querySelector('select.watch-quality');
  assert.equal(first.getAttribute('aria-label'),'Video quality');assert.equal(first.disabled,false);assert.equal(first.closest('.watch-quality-select-label').hidden,false);
  assert.deepEqual([...first.options].map(option=>option.value),['-1','1','2','3']);assert.equal(first.value,'-1');assert.equal(second.value,'-1');
  const beforeCalls=[...f.mediaCalls],beforeRoom=structuredClone(f.room);first.value='1';first.dispatchEvent(new window.Event('change'));await f.flush();
  assert.equal(f.instances[0].manualLevel,1);assert.equal(first.value,'1');assert.equal(f.instances[1].manualLevel,-1);assert.equal(second.value,'-1');
  assert.deepEqual(f.requests,[]);assert.deepEqual(f.mediaCalls,beforeCalls);assert.deepEqual(f.room,beforeRoom);
  first.value='-1';first.dispatchEvent(new window.Event('change'));assert.equal(f.instances[0].manualLevel,-1);assert.deepEqual(f.requests,[]);
 }finally{f.destroy();}
});

test('source replacement removes obsolete room quality choices and ignores callbacks from the destroyed stream',async()=>{
 const f=await roomFixture();try{
  const stale=[...f.instances];f.publish({media:{kind:'file',url:'https://video.example/second.mp4'}});await f.flush();
  for(const root of f.roots){const video=root.querySelector('video');Object.defineProperties(video,{duration:{value:600},readyState:{value:4},paused:{value:true}});video.dispatchEvent(new window.Event('loadedmetadata'));}
  const hints=f.roots.map(root=>root.querySelector('.watch-quality-hint').textContent);
  for(const root of f.roots){assert.equal(root.querySelector('.watch-quality-select-label').hidden,true);assert.equal(root.querySelector('.watch-quality').disabled,true);assert.equal(root.querySelector('.watch-quality').options.length,0);assert.match(root.querySelector('.watch-quality-hint').textContent,/one quality/i);}
  for(const instance of stale){assert.ok(instance.destroyed);instance.levels=[{height:2160,width:3840,bitrate:12000000,videoCodec:'avc1.640033'}];instance.emit(window.Hls.Events.MANIFEST_PARSED,{levels:instance.levels});instance.emit(window.Hls.Events.LEVEL_SWITCHED,{level:0});}
  assert.deepEqual(f.roots.map(root=>root.querySelector('.watch-quality-hint').textContent),hints);assert.deepEqual(f.requests,[]);
  for(const root of f.roots)assert.equal(root.querySelector('.watch-quality').options.length,0);
 }finally{f.destroy();}
});

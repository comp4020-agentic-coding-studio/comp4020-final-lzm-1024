import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudioTransport} from '../public/voice-transport.js';

function fixture(options={}){let pc,stops=0;const track={enabled:true,stop(){stops++;}},stream={getAudioTracks:()=>[track],getTracks:()=>[track]},sent=[],received=[],failures=[];let connections=0;
 class Peer{constructor(){pc=this;this.remoteDescription=null;this.connectionState='new';}addTrack(){}async createOffer(options){this.offerOptions=options;return {type:'offer',sdp:'caller'};}async createAnswer(){return {type:'answer',sdp:'recipient'};}async setLocalDescription(v){this.localDescription=v;this.onicecandidate({candidate:{toJSON:()=>({candidate:'early local candidate'})}});}async setRemoteDescription(v){this.remoteDescription=v;}async addIceCandidate(v){received.push(v);}close(){this.closed=true;}}
 const transport=createAudioTransport({...options,stream,iceServers:[],PeerConnection:Peer,onSignal:async value=>sent.push(value),onTrack:()=>{},onConnected:()=>{connections++;},onFailed:e=>failures.push(e)});
 return {transport,sent,received,failures,track,pc:()=>pc,stops:()=>stops,connections:()=>connections};
}
test('caller publishes offer before early local ICE and only negotiates once',async()=>{const f=fixture();await f.transport.offer();await f.transport.offer();assert.deepEqual(f.sent.map(s=>s.description?.type||'ice'),['offer','ice']);f.transport.close();assert.equal(f.stops(),1);});
test('recipient queues incoming ICE until offer, emits answer and accepts later ICE',async()=>{const f=fixture();await f.transport.receive({candidate:{candidate:'remote early'}});assert.equal(f.received.length,0);await f.transport.receive({description:{type:'offer',sdp:'caller'}});assert.equal(f.received.length,1);assert.equal(f.sent[0].description.type,'answer');await f.transport.receive({candidate:null});assert.equal(f.received.at(-1),null);f.transport.close();});
test('mute affects the actual audio track; connection signals once; close stops audio and late signals',async()=>{const f=fixture();f.transport.mute(true);assert.equal(f.track.enabled,false);f.transport.mute(false);assert.equal(f.track.enabled,true);f.pc().connectionState='connected';f.pc().onconnectionstatechange();f.pc().onconnectionstatechange();assert.equal(f.connections(),1);f.transport.close();f.transport.close();await f.transport.receive({candidate:{candidate:'too late'}});assert.equal(f.received.length,0);assert.equal(f.stops(),1);assert.equal(f.pc().closed,true);});

test('connection report exposes only bounded state and media counters, never network addresses or SDP',async()=>{
 const f=fixture();try{f.pc().getStats=async()=>new Map([['path',{type:'transport',selectedCandidatePairId:'private-pair-id'}],['video',{type:'inbound-rtp',kind:'video',bytesReceived:1200,framesDecoded:4,ip:'192.168.1.2',sdp:'private-description'}],['candidate',{type:'local-candidate',address:'10.0.0.1',usernameFragment:'secret'}]]);const report=await f.transport.diagnostics();assert.equal(report.networkPath,true);assert.equal(report.videoBytesReceived,1200);assert.equal(report.videoFramesDecoded,4);assert.doesNotMatch(JSON.stringify(report),/192\.168|10\.0|private|secret/);}finally{f.transport.close();}
});

test('video transport sends both tracks, camera mute does not mute audio, and close releases both',()=>{let pc;const audio={kind:'audio',enabled:true,stops:0,stop(){this.stops++;}},video={kind:'video',enabled:true,stops:0,stop(){this.stops++;}},stream={getAudioTracks:()=>[audio],getVideoTracks:()=>[video],getTracks:()=>[audio,video]};class Peer{constructor(){pc=this;this.tracks=[];}addTrack(track){this.tracks.push(track);}close(){}}const t=createAudioTransport({stream,mode:'video',iceServers:[],PeerConnection:Peer,onSignal(){},onTrack(){},onConnected(){},onFailed(){}});assert.deepEqual(pc.tracks,[audio,video]);t.camera(false);assert.equal(video.enabled,false);assert.equal(audio.enabled,true);t.mute(true);t.camera(true);assert.equal(audio.enabled,false);assert.equal(video.enabled,true);t.close();t.close();assert.equal(audio.stops,1);assert.equal(video.stops,1);});

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function timers(){const jobs=new Map();let id=0;return {jobs,setTimer:(fn,ms)=>{jobs.set(++id,{fn,ms});return id;},clearTimer:id=>jobs.delete(id),fire(ms){const entry=[...jobs].find(([,v])=>v.ms===ms);assert.ok(entry);jobs.delete(entry[0]);entry[1].fn();}};}
test('a connection stuck in setup attempts recovery without waiting forever for a failed event',async()=>{
 const clock=timers(),f=fixture(clock);try{await f.transport.offer();await f.transport.receive({description:{type:'answer',sdp:'recipient'}});clock.fire(16000);await settle();assert.equal(f.sent.filter(s=>s.description?.type==='offer').length,2);assert.deepEqual(f.pc().offerOptions,{iceRestart:true});assert.equal(f.failures.length,0);}finally{f.transport.close();}assert.equal(clock.jobs.size,0);
});
test('brief disconnection recovers without another offer; failure restarts ICE with bounded retries and stops timers',async()=>{
 const clock=timers(),states=[],f=fixture({...clock,onState:s=>states.push(s)});
 try{await f.transport.offer();await f.transport.receive({description:{type:'answer',sdp:'recipient'}});const pc=f.pc();pc.connectionState='connected';pc.onconnectionstatechange();
  pc.connectionState='disconnected';pc.onconnectionstatechange();assert.equal(clock.jobs.size,1);pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(clock.jobs.size,0);assert.equal(f.sent.filter(s=>s.description).length,1);
  pc.connectionState='failed';pc.onconnectionstatechange();await settle();assert.deepEqual(pc.offerOptions,{iceRestart:true});assert.equal(f.sent.filter(s=>s.description).length,2);
  await f.transport.receive({description:{type:'answer',sdp:'restarted'}});pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(f.connections(),1);assert.equal(clock.jobs.size,0);assert.equal(states.at(-1),'connected');
  pc.connectionState='failed';pc.onconnectionstatechange();await settle();clock.fire(12000);await settle();assert.equal(f.failures.length,1);assert.equal(f.sent.filter(s=>s.description).length,3);assert.equal(clock.jobs.size,0);
 }finally{f.transport.close();}assert.equal(clock.jobs.size,0);
});
test('recipient requests caller-owned recovery and forwards empty end-of-candidates markers',async()=>{
 const clock=timers(),f=fixture(clock);try{await f.transport.receive({description:{type:'offer',sdp:'caller'}});f.pc().onicecandidate({candidate:{toJSON:()=>({candidate:'',sdpMid:'0',sdpMLineIndex:0})}});await settle();assert.equal(f.sent.at(-1).candidate.candidate,'');
  f.pc().connectionState='failed';f.pc().onconnectionstatechange();await settle();assert.deepEqual(f.sent.at(-1),{restart:true});assert.equal(f.sent.filter(s=>s.description?.type==='offer').length,0);
 }finally{f.transport.close();}assert.equal(clock.jobs.size,0);
});
test('video encoder budget preserves audio and tolerates unsupported encoder controls',async()=>{
 const settings=[];const audio={kind:'audio',stop(){}},video={kind:'video',stop(){}};
 class Peer{addTrack(){}getSenders(){return [{track:audio,getParameters(){throw Error('Audio must not be changed');}},{track:video,getParameters:()=>({encodings:[{}]}),setParameters:async p=>settings.push(p)}];}async createOffer(){return {type:'offer',sdp:'video'};}async setLocalDescription(d){this.localDescription=d;}close(){}}
 const t=createAudioTransport({stream:{getAudioTracks:()=>[audio],getVideoTracks:()=>[video],getTracks:()=>[audio,video]},mode:'video',iceServers:[],PeerConnection:Peer,onSignal(){},onTrack(){},onConnected(){},onFailed:assert.fail});try{await t.offer();assert.deepEqual(settings,[{encodings:[{maxBitrate:600000,maxFramerate:24}]}]);}finally{t.close();}
});

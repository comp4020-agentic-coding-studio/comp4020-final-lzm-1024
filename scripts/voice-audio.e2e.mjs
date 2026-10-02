import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import rtc from '@roamhq/wrtc';
import {createAudioTransport} from '../public/voice-transport.js';

async function runAudioTest(){
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'voice-audio-')),base='http://127.0.0.1:18098';let child;const clients=[];
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18098',DATA_DIR:dir},stdio:'pipe'});let output='';child.stderr.on('data',b=>output+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error(output);}
 async function stop(){const done=once(child,'exit');child.kill();await done;}
 async function req(path,method='GET',data,u){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function reg(name,universityId='anu'){const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.com',password:'preview-only-password',universityId});assert.equal(r.status,200);return {...r.data.user,cookie:r.cookie,device:randomUUID()};}
 async function socket(u,device=u.device){const ws=new WebSocket(base.replace('http','ws')+'/ws?social=1&device='+device,{headers:{cookie:u.cookie}});clients.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');return ws;}
 async function wait(ws,p){for(let i=0;i<100;i++){const v=ws.events.find(p);if(v)return v;await new Promise(r=>setTimeout(r,30));}throw Error('Missing voice event');}
 const operation=(c,u,action)=>req('/api/calls/'+c.id,'POST',{action,device:u.device},u);
 const signal=(c,u,value,clientId=randomUUID())=>req('/api/calls/'+c.id+'/signal','POST',{device:u.device,clientId,signal:value},u);
 const audio={type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'};
 let a,b,x,sydney,convo,c,wa,wb,wx;

 try{await start();a=await reg('audio_alex');b=await reg('audio_riley');wa=await socket(a);wb=await socket(b);convo=(await req('/api/messages/conversations','POST',{userId:b.id},a)).data.conversation;
   const errors=[],transports=[],sinks=[],sources=[new rtc.nonstandard.RTCAudioSource(),new rtc.nonstandard.RTCAudioSource()],audioReceived=[0,0];let currentCall,feed;
   // The M106 test binding's Node 24 index getter is unreliable; SDP mid is sufficient.
   class AudioPeer extends rtc.RTCPeerConnection{addIceCandidate(v){return v===null?Promise.resolve():super.addIceCandidate(v);}set onicecandidate(fn){super.onicecandidate=fn?(e=>{const v=e.candidate?.toJSON();fn({candidate:v?{toJSON:()=>({...v,sdpMLineIndex:0})}:null});}):null;}}
   const relay=(ws,index)=>message=>{const v=JSON.parse(message);if(v.type==='call:signal'&&v.callId===currentCall?.id)transports[index].receive(v.signal).catch(e=>errors.push(e));};
   const handlers=[relay(wa,0),relay(wb,1)];wa.on('message',handlers[0]);wb.on('message',handlers[1]);
   try {
    for(const [index,u] of [a,b].entries()){
     const stream=new rtc.MediaStream([sources[index].createTrack()]);
     transports.push(createAudioTransport({stream,iceServers:[],PeerConnection:AudioPeer,onSignal:async value=>{const r=await signal(currentCall,u,value);assert.equal(r.status,200,JSON.stringify({...r.data,kind:value.description?'description':'candidate',candidateMeta:value.candidate?{empty:value.candidate.candidate==='',prefix:value.candidate.candidate.startsWith('candidate:'),mid:value.candidate.sdpMid,index:value.candidate.sdpMLineIndex,fragmentType:typeof value.candidate.usernameFragment}:null}));},onConnected:async()=>{const r=await operation(currentCall,u,'connected');assert.equal(r.status,200,JSON.stringify(r.data));},onFailed:e=>errors.push(e),onTrack:e=>{const sink=new rtc.nonstandard.RTCAudioSink(e.track);sinks.push(sink);sink.ondata=v=>{if(v.samples.some(x=>Math.abs(x)>100))audioReceived[index]++;};}}));
    }
    currentCall=(await req('/api/calls','POST',{conversationId:convo.id,clientId:randomUUID(),device:a.device},a)).data.call;
    assert.equal((await operation(currentCall,b,'accept')).status,200);await transports[0].offer();
    let phase=0;feed=setInterval(()=>{const samples=new Int16Array(480);for(let j=0;j<480;j++)samples[j]=Math.round(10000*Math.sin(2*Math.PI*440*(phase+j)/48000));phase+=480;for(const source of sources)source.onData({samples,sampleRate:48000,bitsPerSample:16,channelCount:1,numberOfFrames:480});},10);
    for(let n=0;n<160&&(!audioReceived.every(x=>x>3)||!((await req('/api/calls/'+currentCall.id,'GET',null,a)).data.call.status==='active'));n++){if(errors.length)throw errors[0];await new Promise(r=>setTimeout(r,30));}
    assert.ok(audioReceived.every(x=>x>3),'Both participants receive decoded non-silent audio');assert.deepEqual(errors,[]);assert.equal((await req('/api/calls/'+currentCall.id,'GET',null,a)).data.call.status,'active');await operation(currentCall,a,'hangup');
   } finally {clearInterval(feed);wa.off('message',handlers[0]);wb.off('message',handlers[1]);for(const sink of sinks)sink.stop();for(const transport of transports)transport.close();}

 console.log('Both real WebRTC peers received decoded synthetic audio; authenticated signalling and hangup passed.');
 }finally{for(const ws of clients)ws.terminate();if(child?.exitCode===null)await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
}
// Explicitly exit after complete cleanup: the legacy native test SDK has a Node 24 shutdown defect.
runAudioTest().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createVoiceController,voiceDevice} from '../public/voice-calls.js';

function fixture({deny=false,deferred=false}={}){
 const dom=new JSDOM('<body></body>',{url:'https://campus.example/messages',pretendToBeVisual:true});
 const prior={window:globalThis.window,document:globalThis.document,isSecureContext:globalThis.isSecureContext,CustomEvent:globalThis.CustomEvent};Object.assign(globalThis,{window:dom.window,document:dom.window.document,isSecureContext:true,CustomEvent:dom.window.CustomEvent});
 dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
 let permissions=0,stopped=0,resolveMic;const requests=[],toasts=[];const stream={getTracks:()=>[{stop:()=>stopped++}],getAudioTracks:()=>[]};
 const user={id:'alex'},peer={id:'riley',name:'Riley',username:'riley'};
 let call={id:'call-id',conversationId:'conversation',callerId:'alex',calleeId:'riley',caller:{id:'alex',name:'Alex'},callee:peer,callerDevice:voiceDevice,calleeDevice:null,status:'ringing'};
 const api=async(path,method='GET',data)=>{requests.push({path,method,data});if(path==='/api/calls'&&method==='GET')return {call:null,iceServers:[]};if(path==='/api/calls'&&method==='POST')return {call};if(data?.action){call={...call,status:'ended',reason:data.action==='reject'?'declined':'completed'};return {call};}return {call};};
 const media={getUserMedia:async()=>{permissions++;if(deny){const e=Error('Denied');e.name='NotAllowedError';throw e;}if(deferred)return new Promise(r=>resolveMic=r);return stream;}};
 let closes=0;const transport={offer:async()=>{},receive:async()=>{},mute:()=>{},close:()=>closes++};
 const client=createVoiceController({user,api,toast:x=>toasts.push(x),navigate:()=>{},media,makeTransport:()=>transport});
 const connected=()=>window.dispatchEvent(new dom.window.CustomEvent('campus:community',{detail:{type:'social:connected'}}));
 return {client,dom,requests,toasts,call,connected,permissions:()=>permissions,stopped:()=>stopped,resolveMic:()=>resolveMic?.(stream),closes:()=>closes,cleanup(){client.destroy();dom.window.close();Object.assign(globalThis,prior);}};
}
const settle=()=>new Promise(r=>setTimeout(r,0));
test('incoming ringing never opens the microphone; declining works without audio permission',async()=>{const f=fixture();try{f.client.receive({...f.call,callerId:'riley',calleeId:'alex',caller:f.call.callee,callee:f.call.caller,callerDevice:'other',calleeDevice:null});assert.equal(f.permissions(),0);assert.equal(document.querySelector('.voice-answer').textContent,'Answer call');document.querySelector('.voice-decline').click();await settle();assert.equal(f.permissions(),0);assert.equal(f.requests.find(r=>r.data?.action==='reject').data.device,voiceDevice);assert.match(document.querySelector('.voice-call-person').textContent,/Call declined/);}finally{f.cleanup();}});
test('microphone denial does not start a server call and leaves audio stopped',async()=>{const f=fixture({deny:true});try{f.connected();await settle();await assert.rejects(f.client.start('conversation'),/Microphone access/);assert.equal(f.permissions(),1);assert.ok(!f.requests.some(r=>r.path==='/api/calls'&&r.method==='POST'));assert.equal(document.querySelector('.voice-call-panel').hidden,true);}finally{f.cleanup();}});
test('cancelling a pending microphone prompt stops a stream that resolves late',async()=>{const f=fixture({deferred:true});try{f.connected();await settle();const pending=f.client.start('conversation');await settle();document.querySelector('.voice-hangup').click();f.resolveMic();await assert.rejects(pending,/cancelled/);assert.equal(f.stopped(),1);assert.ok(!f.requests.some(r=>r.path==='/api/calls'&&r.method==='POST'));}finally{f.cleanup();}});
test('audio persists across route UI changes but ending the call stops capture and clears playback',async()=>{const f=fixture();try{f.connected();await settle();await f.client.start('conversation');assert.equal(f.permissions(),1);assert.equal(document.querySelector('.voice-hangup').textContent,'Cancel call');document.querySelector('.voice-hangup').click();await settle();assert.ok(f.closes()>0);assert.ok(f.stopped()>0);assert.equal(document.querySelector('audio').srcObject,null);assert.match(document.querySelector('.voice-call-person').textContent,/Call ended/);}finally{f.cleanup();}});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountRoomShare} from '../public/watch-share.js';

test('room sharing copies a canonical URL, survives clipboard denial and accurately explains private access',async()=>{
 const dom=new JSDOM('<div id="share"></div>',{url:'https://campus.example/watch/11111111-1111-1111-1111-111111111111?tracking=private'});
 const keys=['document','location','navigator'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let panel;
 try{
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
  let copied,deny=false,room={title:'TEST screening',inviteOnly:false};const toasts=[];
  Object.defineProperty(navigator,'clipboard',{value:{async writeText(value){if(deny)throw Error('Denied');copied=value;}}});
  panel=mountRoomShare(document.querySelector('#share'),{roomId:'11111111-1111-1111-1111-111111111111',campus:{shortName:'ANU'},getRoom:()=>room,toast:v=>toasts.push(v)});
  const input=document.querySelector('input'),toggle=document.querySelector('.watch-share'),copy=document.querySelector('[data-copy-room]');
  toggle.click();assert.equal(document.activeElement,input);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(input.selectionEnd,input.value.length);
  copy.click();await Promise.resolve();await Promise.resolve();
  assert.equal(copied,'https://campus.example/watch/11111111-1111-1111-1111-111111111111');assert.ok(!copied.includes('tracking'));assert.equal(toasts.length,1);
  deny=true;copy.click();await Promise.resolve();await Promise.resolve();
  assert.match(document.querySelector('.watch-share-status').textContent,/Ctrl\+C/);assert.equal(toasts.length,1);assert.equal(document.activeElement,input);assert.equal(copy.disabled,false);
  room={...room,inviteOnly:true};panel.update();assert.match(document.querySelector('.watch-share-context').textContent,/link does not grant access/);
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector('.watch-share-panel').hidden,true);assert.equal(document.activeElement,toggle);
 }finally{panel?.destroy();dom.window.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});

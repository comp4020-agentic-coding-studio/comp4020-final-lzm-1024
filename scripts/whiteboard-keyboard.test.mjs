import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountWhiteboard} from '../public/whiteboard.js';
import {objectDefaults} from '../public/canvas-model.js';

test('keyboard selection survives redraws, arrow moves queue, and native button space remains available',()=>{
 const dom=new JSDOM('<main><div class="designer-layout"><div class="image-picker"></div><div class="presence-panel"></div></div><div id="studio-panel-event"></div><div id="studio-people"></div><button id="studio-undo"></button><button id="studio-redo"></button></main>',{pretendToBeVisual:true});
 const keys=['document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let board;
 try{
  globalThis.document=dom.window.document;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const id='e1c1efed-0d29-4048-904e-5e171b1f7145',sent=[];
  const draft={id:'b1c1efed-0d29-4048-904e-5e171b1f7145',version:0,canvas:{width:2400,height:1600,background:'#ffffff',objects:[{...objectDefaults,id,type:'sticky',text:'Keyboard note',x:20,y:30}]}};
  board=mountWhiteboard(document.querySelector('main'),{getDraft:()=>draft,isConnected:()=>true,send:value=>sent.push(value),onPending(){},toast(){},async flushAll(){}});
  const dispatch=(target,key,code=key)=>{const event=new dom.window.KeyboardEvent('keydown',{key,code,bubbles:true,cancelable:true});target.dispatchEvent(event);return event;};
  let item=document.querySelector('[data-canvas-item]');item.focus();dispatch(item,'Enter');
  assert.equal(document.querySelector('#wb-properties').hidden,false);
  assert.equal(document.activeElement.dataset.canvasItem,id);
  dispatch(document.activeElement,'ArrowRight');assert.equal(sent.at(-1).props.x,21);
  assert.equal(document.activeElement.dataset.canvasItem,id);
  assert.equal(dispatch(document.querySelector('#wb-fit'),' ','Space').defaultPrevented,false);
  assert.equal(dispatch(document.querySelector('#wb-stage'),' ','Space').defaultPrevented,true);
  dispatch(document.activeElement,'Escape');assert.equal(document.querySelector('#wb-properties').hidden,true);
 }finally{board?.destroy();dom.window.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountWhiteboard,ensurePublicationDetails} from '../public/whiteboard.js';
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

test('publishing missing event details opens the visible panel, focuses the missing field and preserves the canvas',()=>{
 const dom=new JSDOM('<main><div class="designer-layout"><div class="image-picker"></div><div class="presence-panel"></div><div id="readiness">Poster readiness</div></div><div id="studio-panel-event"><label>Title<input data-field="title"></label><label>Date<input data-field="date" type="date"></label><label>Location<input data-field="location"></label></div><div id="studio-people"></div><button id="studio-undo"></button><button id="studio-redo"></button></main>',{pretendToBeVisual:true});
 const keys=['document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let board;
 try{
  globalThis.document=dom.window.document;globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const draft={id:'b1c1efed-0d29-4048-904e-5e171b1f7145',version:0,title:'',date:'',location:'',canvas:{width:2400,height:1600,background:'#ffffff',objects:[{...objectDefaults,id:'e1c1efed-0d29-4048-904e-5e171b1f7145',type:'text',text:'21 October 2026'}]}},notices=[],canvas=JSON.stringify(draft.canvas);
  board=mountWhiteboard(document.querySelector('main'),{getDraft:()=>draft,isConnected:()=>true,send(){},onPending(){},toast(){},async flushAll(){}});
  assert(document.querySelector('#wb-event').hidden);assert.equal(document.querySelector('#readiness').parentElement.id,'wb-event');
  assert.equal(ensurePublicationDetails(draft,board,text=>notices.push(text)),false);assert.equal(document.activeElement.dataset.field,'title');draft.title='Test event';
  assert.equal(ensurePublicationDetails(draft,board,text=>notices.push(text)),false);assert.equal(document.activeElement.dataset.field,'date');assert.equal(draft.date,'','A date drawn on the canvas must not invent an event date');assert.match(notices.at(-1),/event date/);
  assert.equal(document.querySelector('#wb-event').hidden,false);assert.equal(document.querySelector('#wb-event-details').getAttribute('aria-expanded'),'true');draft.date='2026-10-23';
  assert.equal(ensurePublicationDetails(draft,board,text=>notices.push(text)),false);assert.equal(document.activeElement.dataset.field,'location');draft.location='Test venue';
  assert.equal(ensurePublicationDetails(draft,board,text=>notices.push(text)),true);assert.equal(notices.length,3);assert.equal(JSON.stringify(draft.canvas),canvas);
  document.querySelector('[data-board-tool="elements"]').click();assert(document.querySelector('#wb-event').hidden);document.querySelector('#wb-event-details').click();assert.equal(document.querySelector('#wb-event').hidden,false);assert.equal(document.activeElement.dataset.field,'date');
 }finally{board?.destroy();dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

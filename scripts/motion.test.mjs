import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('motion never changes request results and settles overlapping failures',{timeout:5000},async t=>{
  const dom=new JSDOM('<main id="app"></main><button class="primary">Submit</button>',{pretendToBeVisual:true});
  const globals=['window','document','Element','MutationObserver','matchMedia','requestAnimationFrame'];
  const previous=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let reduced=false,onPreference,animationCalls=0;
  const media={get matches(){return reduced;},addEventListener(_name,listener){onPreference=listener;}};
  for(const key of ['window','document','Element','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]||dom.window});
  globalThis.matchMedia=()=>media;globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
  dom.window.HTMLElement.prototype.animate=function(){animationCalls++;return {finished:Promise.resolve(),cancel(){}};};
  const motion=await import('../public/motion.js?lifecycle-test');
  try{
    motion.installMotion();const button=document.querySelector('button'),progress=document.querySelector('.motion-progress');
    await t.test('a failed request removes busy feedback and preserves the exact rejection',async()=>{
      button.click();const failure=new Error('Permission denied');
      await assert.rejects(motion.withRequestMotion(()=>Promise.reject(failure)),error=>error===failure);
      assert.equal(button.classList.contains('motion-busy'),false);
      await new Promise(r=>setTimeout(r,240));assert.equal(progress.hidden,true);
    });
    await t.test('finishing one of two requests does not clear the remaining request feedback',async()=>{
      button.click();let resolveFirst,resolveSecond;
      const first=motion.withRequestMotion(()=>new Promise(resolve=>{resolveFirst=resolve;}));
      const second=motion.withRequestMotion(()=>new Promise(resolve=>{resolveSecond=resolve;}));
      await new Promise(r=>setTimeout(r,160));assert.equal(progress.hidden,false);
      resolveFirst('first');assert.equal(await first,'first');assert.equal(progress.hidden,false);assert.equal(button.classList.contains('motion-busy'),true);
      resolveSecond('second');assert.equal(await second,'second');assert.equal(button.classList.contains('motion-busy'),false);
      await new Promise(r=>setTimeout(r,240));assert.equal(progress.hidden,true);
    });
    await t.test('reduced motion keeps controls operable and closes dialogs immediately',async()=>{
      reduced=true;onPreference();const calls=animationCalls;button.click();
      const dialog=document.createElement('dialog');document.body.append(dialog);dialog.open=true;dialog.close=()=>{dialog.open=false;};
      motion.closeDialog(dialog);assert.equal(dialog.open,false);assert.equal(animationCalls,calls);assert.equal(document.querySelectorAll('.motion-ripple').length,0);
      assert.equal(await motion.withRequestMotion(async()=>42),42);
      await new Promise(r=>setTimeout(r,240));assert.equal(progress.hidden,true);
    });
  }finally{dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

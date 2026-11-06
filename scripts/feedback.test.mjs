import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createFeedback,publicationHelp,explainFeedback} from '../public/feedback.js';

function fixture(){
 const dom=new JSDOM('<button id="publish">Publish</button><input id="date" type="date"><div id="toast"></div>',{pretendToBeVisual:true}),doc=dom.window.document,jobs=new Map();let id=0;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('[autofocus]')?.focus();};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 const feedback=createFeedback({node:doc.querySelector('#toast'),document:doc,setTimer:fn=>{jobs.set(++id,fn);return id;},clearTimer:key=>jobs.delete(key)});
 return {dom,doc,jobs,feedback,close(){feedback.closeHelp();feedback.dismiss();dom.window.close();}};
}
test('save and connection errors give contextual instructions and persist until dismissed',()=>{
 const f=fixture();try{const trigger=f.doc.querySelector('#publish');trigger.focus();f.feedback.show('Changes are still saving. Please try again.');const notice=f.doc.querySelector('#toast');assert.equal(notice.getAttribute('role'),'alert');assert.match(notice.textContent,/Connected · Saved/);assert.match(notice.textContent,/may not be kept/);assert.equal(f.jobs.size,0);assert.equal(f.doc.activeElement,trigger);notice.querySelector('button').focus();notice.querySelector('button').click();assert.equal(notice.hidden,true);assert.equal(f.doc.activeElement,trigger);
 assert.doesNotMatch(explainFeedback('Wait for the live connection before calling.').steps.join(' '),/editor|Saved/);
 }finally{f.close();}
});
test('ordinary feedback expires, pauses for reading, and renders text without HTML execution',()=>{
 const f=fixture();try{f.feedback.show('<img src=x onerror=alert(1)>');const notice=f.doc.querySelector('#toast');assert.equal(notice.querySelector('img'),null);assert.match(notice.textContent,/<img/);assert.equal(f.jobs.size,1);notice.dispatchEvent(new f.dom.window.Event('pointerenter'));assert.equal(f.jobs.size,0);notice.dispatchEvent(new f.dom.window.Event('pointerleave'));assert.equal(f.jobs.size,1);[...f.jobs.values()][0]();assert.equal(notice.hidden,true);}finally{f.close();}
});
test('keyboard reading stays paused even when the pointer leaves, and dismissal never restarts a hidden timer',async()=>{
 const f=fixture();try{f.feedback.show('Profile photo saved.');const notice=f.doc.querySelector('#toast'),button=notice.querySelector('button');button.focus();assert.equal(f.jobs.size,0);notice.dispatchEvent(new f.dom.window.Event('pointerleave'));assert.equal(f.jobs.size,0);button.blur();await Promise.resolve();assert.equal(f.jobs.size,1);button.focus();f.feedback.dismiss();await Promise.resolve();assert.equal(f.jobs.size,0);}finally{f.close();}
});
test('publication help explains metadata, waits for an explicit action and focuses the actual field',()=>{
 const f=fixture();try{const trigger=f.doc.querySelector('#publish');trigger.focus();let actions=0;const go=()=>{actions++;f.doc.querySelector('#date').focus();};f.feedback.help(publicationHelp('date'),go);const dialog=f.doc.querySelector('dialog');assert.equal(dialog.getAttribute('role'),'alertdialog');assert.match(dialog.textContent,/canvas does not fill the Date field/);assert.match(dialog.textContent,/Publish again/);assert.equal(actions,0);assert.equal(f.jobs.size,0);dialog.querySelector('.primary').click();assert.equal(actions,1);assert.equal(f.doc.querySelector('dialog'),null);assert.equal(f.doc.activeElement.id,'date');
 f.feedback.help(publicationHelp('location'),go);let canvasKeys=0;f.doc.addEventListener('keydown',()=>canvasKeys++);f.doc.querySelector('dialog button').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(canvasKeys,0,'A modal shortcut must not edit the canvas behind it');const cancel=new f.dom.window.Event('cancel',{cancelable:true});f.doc.querySelector('dialog').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(actions,1);assert.equal(f.doc.querySelector('dialog'),null);
 for(const field of ['title','date','location'])f.feedback.help(publicationHelp(field),go);assert.equal(f.doc.querySelectorAll('dialog').length,1);f.feedback.closeHelp();assert.equal(f.doc.querySelector('dialog'),null);
 }finally{f.close();}
});

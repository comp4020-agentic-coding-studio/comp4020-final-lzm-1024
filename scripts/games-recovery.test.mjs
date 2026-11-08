import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountGames} from '../public/games.js';

test('create dialog recovers forgotten rooms and keeps retry controls usable',async()=>{
  const dom=new JSDOM('<main id="app"></main>',{url:'http://localhost/games'});
  const keys=['window','document','localStorage','location','WebSocket'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let mounted,creates=0,leaves=0,navigation;
  try{
    for(const key of keys.slice(0,4))Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
    globalThis.WebSocket=class{close(){}};
    dom.window.HTMLDialogElement.prototype.showModal=function(){};
    dom.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new dom.window.Event('close'));};
    const user={id:'alice',universityId:'anu'};
    mounted=mountGames(document.querySelector('main'),{user,campus:{shortName:'ANU'},navigate:path=>navigation=path,onAuthExpired(){},api:async(path,method)=>{
      if(path.startsWith('/api/games/rooms/active?'))return {room:{id:'previous-room'}};
      if(path==='/api/games/rooms/leave-active'){
        if(++leaves===1)throw Object.assign(new Error('Connection failed'),{status:503});
        return {left:10};
      }
      if(method==='POST'){
        if(++creates===1)throw Object.assign(new Error('Finish or close an existing room before creating another'),{status:429});
        return {room:{id:'new-room'}};
      }
      return {rooms:[]};
    }});
    await new Promise(resolve=>setTimeout(resolve,0));
    document.querySelector('[data-game="gomoku"]').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    const resume=document.querySelector('.game-resume-active');assert.equal(resume.hidden,false);
    const form=document.querySelector('.game-create-form'),leave=form.querySelector('.game-leave-active'),create=form.querySelector('[type=submit]');
    await form.onsubmit({preventDefault(){}});
    assert.match(form.querySelector('.game-create-error').textContent,/existing room/);
    await leave.onclick();
    assert.match(form.querySelector('[role=status]').textContent,/Connection failed/);
    assert.equal(leave.disabled,false);assert.equal(create.disabled,false);
    await leave.onclick();
    assert.equal(form.querySelector('.game-create-error').textContent,'');
    assert.match(form.querySelector('[role=status]').textContent,/can create/);
    assert.equal(resume.hidden,true);
    await form.onsubmit({preventDefault(){}});
    assert.equal(navigation,'/games/new-room');
  }finally{
    mounted?.destroy();dom.window.close();
    for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }
});

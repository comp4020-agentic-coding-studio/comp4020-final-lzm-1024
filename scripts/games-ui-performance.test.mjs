import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {newGame,publicGame} from '../game-engine.mjs';
import {mountGames} from '../public/games.js';

test('game snapshots preserve focused controls, avoid duplicate HTTP and suspend offscreen artwork',async()=>{
  const dom=new JSDOM('<main id="app"></main>',{url:'http://localhost/games/room'});
  const keys=['window','document','localStorage','location','IntersectionObserver','WebSocket'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const observers=[],requests=[];
  let mounted;
  try{
    for(const k of ['window','document','localStorage','location'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
    class Observer{constructor(callback){this.callback=callback;this.nodes=[];observers.push(this);}observe(node){this.nodes.push(node);}disconnect(){this.nodes=[];}}
    globalThis.IntersectionObserver=dom.window.IntersectionObserver=Observer;
    class Socket{constructor(){Socket.instance=this;}close(){}}
    globalThis.WebSocket=Socket;
    const user={id:'a',name:'Alice',username:'alice',universityId:'anu'};
    let room={id:'room',version:1,game:'connect4',serverTime:Date.now(),status:'waiting',matchNumber:1,players:[user,null],player:0,online:[true,false],ready:[false,false],rematch:[false,false],state:null};
    const root=document.querySelector('#app');
    mounted=mountGames(root,{user,campus:{shortName:'ANU'},roomId:'room',api:async path=>{requests.push(path);return {room};},navigate(){},onAuthExpired(){}});
    await new Promise(r=>setTimeout(r,0));
    Socket.instance.onopen();
    const ready=root.querySelector('[data-operation=ready]'),hud=root.querySelector('.arena-hud-values>div'),player=root.querySelector('.game-player');
    ready.focus();
    for(let i=0;i<20;i++)Socket.instance.onmessage({data:JSON.stringify({type:'game:state',room})});
    assert.equal(requests.length,1,'socket opening does not refetch the HTTP snapshot');
    assert.equal(root.querySelector('[data-operation=ready]'),ready);
    assert.equal(document.activeElement,ready);
    assert.equal(root.querySelector('.arena-hud-values>div'),hud);
    assert.equal(root.querySelector('.game-player'),player);
    const observer=observers[0],art=root.querySelector('.arena-waiting-stage');
    observer.callback([{target:art,isIntersecting:false}]);assert(art.classList.contains('arcade-offscreen'));
    observer.callback([{target:art,isIntersecting:true}]);assert(!art.classList.contains('arcade-offscreen'));
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));
    assert(root.querySelector('.arcade-hidden'));
    Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new dom.window.Event('visibilitychange'));
    assert.equal(root.querySelector('.arcade-hidden'),null);
    room={...room,version:2,status:'playing',players:[user,{id:'b',name:'Bob',username:'bob'}],ready:[true,true],state:publicGame('connect4',newGame('connect4'),0)};
    Socket.instance.onmessage({data:JSON.stringify({type:'game:state',room})});
    assert.equal(root.querySelector('.arena-waiting-stage'),null);
    assert.equal(root.querySelectorAll('.board-connect4 .board-cell').length,42);
    assert.equal(root.querySelector('[data-column="0"]').disabled,false);
    room={...room,version:3,game:'quiz',state:publicGame('quiz',newGame('quiz'),0)};
    Socket.instance.onmessage({data:JSON.stringify({type:'game:state',room})});
    assert.match(root.querySelector('.game-clock').textContent,/\d+s/);
    room={...room,version:4,state:{...room.state,ownAnswer:0,answered:[true,false]}};
    Socket.instance.onmessage({data:JSON.stringify({type:'game:state',room})});
    assert.match(root.querySelector('.game-clock').textContent,/\d+s/,'new timer DOM is filled even within the same second');
    mounted.destroy();mounted=null;assert.equal(observer.nodes.length,0);
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
  }finally{
    mounted?.destroy();dom.window.close();
    for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }
});

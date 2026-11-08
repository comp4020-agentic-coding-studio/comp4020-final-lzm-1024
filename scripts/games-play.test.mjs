import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {newGame,moveGame,publicGame} from '../game-engine.mjs';
import {mountGames} from '../public/games.js';

// Found while playing every game with two local accounts: chess moves had no
// numbers, a host could send the same invitation repeatedly, and the
// cooperative Draw & Guess summary was printed twice.
async function withRoom(room,api,run){
  const dom=new JSDOM('<main id="app"></main>',{url:'http://localhost/games/room'});
  const keys=['window','document','localStorage','location','IntersectionObserver','WebSocket','crypto'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let mounted;
  try{
    for(const k of ['window','document','localStorage','location'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
    globalThis.IntersectionObserver=dom.window.IntersectionObserver=class{observe(){}disconnect(){}};
    dom.window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});
    class Socket{constructor(){Socket.instance=this;}close(){}}
    globalThis.WebSocket=Socket;
    const user=room.players[room.player];
    mounted=mountGames(document.querySelector('#app'),{user,campus:{shortName:'ANU'},roomId:room.id,api:api||(async()=>({room})),navigate(){},onAuthExpired(){}});
    await new Promise(r=>setTimeout(r,0));Socket.instance.onopen();
    await run(document.querySelector('#app'),Socket.instance);
  }finally{
    mounted?.destroy();dom.window.close();
    for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
  }
}
const alice={id:'a',name:'Alice',username:'alice',universityId:'anu'},bob={id:'b',name:'Bob',username:'bob',universityId:'anu'};
const base={id:'room',version:5,serverTime:Date.now(),matchNumber:1,players:[alice,bob],player:0,online:[true,true],ready:[true,true],rematch:[false,false],invitee:null};

test('chess move history numbers each white move, also once older moves scroll away',async()=>{
  let s=newGame('chess');
  for(const [player,from,to] of [[0,'f2','f3'],[1,'e7','e5'],[0,'g2','g4'],[1,'d8','h4']])s=moveGame('chess',s,player,{from,to});
  await withRoom({...base,game:'chess',status:'finished',state:publicGame('chess',s,0)},null,async root=>{
    assert.deepEqual([...root.querySelectorAll('.chess-moves span')].map(x=>x.textContent),['1. f3','e5','2. g4','Qh4#']);
  });
  const long={...publicGame('chess',newGame('chess'),0),history:Array.from({length:43},(_,i)=>`m${i+1}`)};
  await withRoom({...base,game:'chess',status:'playing',state:long},null,async root=>{
    const shown=[...root.querySelectorAll('.chess-moves span')].map(x=>x.textContent);
    assert.equal(shown[0],'2. m3','the list starts on a white move so columns stay aligned');
    assert.equal(shown.at(-1),'22. m43');assert.equal(shown.at(-2),'m42');
  });
});

test('the host invites someone in the games room once, and a message only when asked',async()=>{
  let room={...base,game:'connect4',status:'waiting',ready:[false,false],players:[alice,null],invitee:null,state:null};const calls=[];
  await withRoom(room,async(path,method,data)=>{calls.push({path,method:method||'GET',data});if(path==='/api/games/online')return {users:[{...bob,playing:false}]};if(path.endsWith('/invite'))room={...room,version:room.version+1,invitee:bob};return {room};},async root=>{
    await new Promise(r=>setTimeout(r,0));
    assert.equal(root.querySelector('[data-operation=invite]'),null,'the old Messages-only button is gone');
    const panel=root.querySelector('.game-invite-panel');assert.ok(panel,'the host sees the invite panel while the seat is empty');
    const button=panel.querySelector('.invite-online [data-invite-id="b"]');assert.equal(button.textContent,'Invite');
    button.click();await new Promise(r=>setTimeout(r,0));
    const invites=calls.filter(c=>c.path.endsWith('/invite'));assert.equal(invites.length,1);
    assert.equal(invites[0].data.userId,'b');assert.equal(invites[0].data.message,false,'no message unless the host asks for one');
    const sent=root.querySelector('.game-invite-panel [data-invite-id="b"]');assert.equal(sent.textContent,'Invited ✓');assert.equal(sent.disabled,true);
    sent.click();await new Promise(r=>setTimeout(r,0));
    assert.equal(calls.filter(c=>c.path.endsWith('/invite')).length,1,'a held seat is not re-sent by a second click');
    assert.match(root.querySelector('.invite-status').textContent,/Invited Bob/);
  });
});

test('guests and seated opponents never see the invite panel',async()=>{
  await withRoom({...base,game:'connect4',status:'waiting',ready:[false,false],player:1,state:null},async(path)=>path==='/api/games/online'?{users:[]}:{room:{...base,game:'connect4',status:'waiting',ready:[false,false],player:1,state:null}},async root=>{
    await new Promise(r=>setTimeout(r,0));assert.equal(root.querySelector('.game-invite-panel'),null);
  });
});

test('the cooperative Draw & Guess summary appears once when the match ends',async()=>{
  const state={...publicGame('draw',newGame('draw'),0),finished:true,winner:null,notice:'Together you guessed 3 of 4 words.',result:null};
  await withRoom({...base,game:'draw',status:'finished',state},null,async root=>{
    const note=root.querySelector('.game-finish-note');
    assert.equal(note.textContent.split('Together you guessed 3 of 4 words.').length-1,1);
  });
  const chess={...publicGame('chess',newGame('chess'),0),finished:true,winner:1,notice:'Opponent resigned.'};
  await withRoom({...base,game:'chess',status:'finished',state:chess},null,async root=>{
    assert.match(root.querySelector('.game-finish-note').textContent,/Bob takes this one\.Opponent resigned\./,'other notices still explain the result');
  });
});

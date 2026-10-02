import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';

test('real two-player campus games',{timeout:45000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'games-')),base='http://127.0.0.1:18087',clients=[];let child,a,b,third,foreign,persisted;
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18087',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',c=>errors+=c);for(let i=0;i<150;i++){try{await fetch(base+'/api/health');return;}catch{}if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,30));}throw Error(errors||'Server did not start');}
  async function stop(){const done=once(child,'exit');child.kill();await done;}
  async function req(path,method='GET',data,u){const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name,campus){const r=await req('/api/auth/register','POST',{name,email:randomUUID()+'@'+(campus==='anu'?'anu.edu.au':'sydney.edu.au'),password:'games-test-password',universityId:campus});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};}
  async function create(game,inviteeId){const r=await req('/api/games/rooms','POST',{game,inviteeId,clientId:randomUUID()},a);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.room;}
  const input=(r,action)=>({clientId:randomUUID(),version:r.version,matchNumber:r.matchNumber,round:r.game==='rps'?r.state?.rounds.length:r.state?.round,...(action?{action}:{})});
  async function op(r,operation,u,action,status=200){const result=await req(`/api/games/rooms/${r.id}/${operation}`,'POST',input(r,action),u);assert.equal(result.status,status,JSON.stringify(result.data));return result.data.room;}
  async function joined(r){return op(r,'join',b);}
  async function playing(r){r=await joined(r);const results=await Promise.all([req(`/api/games/rooms/${r.id}/ready`,'POST',input(r),a),req(`/api/games/rooms/${r.id}/ready`,'POST',input(r),b)]);assert.deepEqual(results.map(r=>r.status),[200,200]);r=(await req(`/api/games/rooms/${r.id}`,'GET',null,a)).data.room;assert.equal(r.status,'playing');return r;}
  async function socket(query,u){const ws=new WebSocket(base.replace('http','ws')+'/ws?'+query,{headers:{origin:base,...(u?{cookie:u.cookie}:{})}});clients.push(ws);ws.messages=[];ws.on('message',data=>ws.messages.push(JSON.parse(data)));await once(ws,'open');return ws;}
  async function wait(ws,type,predicate=()=>true){for(let i=0;i<150;i++){const index=ws.messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return ws.messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,20));}throw Error('Socket update not received: '+type);}
  async function rejectSocket(query,u){const ws=new WebSocket(base.replace('http','ws')+'/ws?'+query,{headers:{origin:base,...(u?{cookie:u.cookie}:{})}});return new Promise((resolve,reject)=>{ws.on('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});ws.on('error',()=>{});ws.on('open',()=>{ws.terminate();reject(Error('Forbidden game socket accepted'));});});}
  function editState(r,change){const store=new DatabaseSync(join(dir,'campuswall.sqlite')),s=JSON.parse(store.prepare('SELECT state FROM game_rooms WHERE id=?').get(r.id).state);change(s);store.prepare('UPDATE game_rooms SET state=? WHERE id=?').run(JSON.stringify(s),r.id);store.close();}
  try{
    await start();a=await register('Games Alice','anu');b=await register('Games Bob','anu');third=await register('Games Charlie','anu');foreign=await register('Games Sydney','usyd');
    await t.test('ten guest-readable games, protected rooms, scoped user search and campus checks',async()=>{
      const catalog=(await req('/api/games/catalog')).data.games;assert.equal(catalog.length,10);assert.equal(new Set(catalog.map(g=>g.id)).size,10);
      for(const path of ['/games','/games.js','/game-catalog.js','/games.css'])assert.equal((await fetch(base+path)).status,200);
      for(const path of ['/api/games/rooms','/api/games/players?q=Games'])assert.equal((await req(path)).status,401);
      assert.equal((await req('/api/games/rooms','POST',{game:'gomoku',clientId:randomUUID()})).status,401);
      const users=(await req('/api/games/players?q=Games','GET',null,a)).data.users;assert.equal(users.length,2);assert.ok(users.every(u=>u.id!==foreign.id&&!u.email));
      assert.equal((await req('/api/games/players?id='+foreign.id,'GET',null,a)).data.users.length,0);
      assert.equal((await req('/api/games/rooms','POST',{game:'invalid',clientId:randomUUID()},a)).status,400);
      assert.equal((await req('/api/games/rooms','POST',{game:'gomoku',inviteeId:foreign.id,clientId:randomUUID()},a)).status,400);
      const r=await create('gomoku');assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,foreign)).status,403);assert.equal(await rejectSocket('game='+r.id,foreign),403);assert.equal(await rejectSocket('games=usyd',a),403);assert.equal(await rejectSocket('game='+r.id),401);assert.equal(await rejectSocket('game='+r.id+'&inbox=1',a),400);await op(r,'leave',a);
    });
    await t.test('private invitations require an explicit send, produce one DM and exclude other players',async()=>{
      let r=await create('tictactoe',b.id);assert.equal((await req('/api/messages/conversations','GET',null,b)).data.conversations.length,0);
      assert.ok(!(await req('/api/games/rooms','GET',null,third)).data.rooms.some(x=>x.id===r.id));assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,third)).status,404);assert.equal(await rejectSocket('game='+r.id,third),404);
      const invite=input(r),path=`/api/games/rooms/${r.id}/invite`;let sent=await req(path,'POST',invite,a);assert.equal(sent.status,200);r=sent.data.room;assert.equal((await req(path,'POST',invite,a)).status,200);
      r=await op(r,'invite',a);const inbox=(await req('/api/messages/conversations','GET',null,b)).data.conversations;assert.equal(inbox.length,1);const messages=(await req(`/api/messages/conversations/${inbox[0].id}/messages`,'GET',null,b)).data.messages;assert.equal(messages.length,1);assert.ok(messages[0].body.includes('/games/'+r.id));
      assert.ok((await req('/api/games/rooms','GET',null,b)).data.rooms.some(x=>x.id===r.id&&x.invited));r=await playing(r);await op(r,'leave',a);
    });
    await t.test('one open seat, simultaneous ready, turn validation, idempotent moves and private live state',async()=>{
      let r=await create('tictactoe');const watcher=await socket('game='+r.id,third);await wait(watcher,'game:state');const joins=await Promise.all([req(`/api/games/rooms/${r.id}/join`,'POST',input(r),b),req(`/api/games/rooms/${r.id}/join`,'POST',input(r),third)]);assert.deepEqual(joins.map(x=>x.status).sort(),[200,404]);
      const joinedUser=joins[0].status===200?b:third,outsider=joinedUser===b?third:b;r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,outsider)).status,404);r=await op(r,'ready',a);r=await op(r,'ready',joinedUser);assert.equal(r.status,'playing');assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,outsider)).status,404);
      const ws=await socket('game='+r.id,joinedUser);await wait(ws,'game:state');assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room.online[1],true);await op(r,'move',joinedUser,{index:0},400);
      const action=input(r,{index:0}),path=`/api/games/rooms/${r.id}/move`,first=await req(path,'POST',action,a);assert.equal(first.status,200);assert.equal((await req(path,'POST',action,a)).data.room.state.moves,1);assert.equal((await req(path,'POST',{...action,action:{index:1}},a)).status,409);
      const update=await wait(ws,'game:state',m=>m.room.state?.moves===1);assert.equal(update.room.state.board[0],1);assert.equal(update.room.player,1);await op(r,'move',joinedUser,{index:1},409);r=first.data.room;await op(r,'move',joinedUser,{index:0},400);r=await op(r,'move',joinedUser,{index:1});await op(r,'leave',a);ws.close();watcher.close();
    });
    await t.test('RPS choices remain private over HTTP and sockets; same-version simultaneous submissions work',async()=>{
      let r=await playing(await create('rps'));const ws=await socket('game='+r.id,b);await wait(ws,'game:state');const old=r;r=await op(r,'move',a,{choice:1});const hidden=await wait(ws,'game:state',m=>m.room.state?.chosen[0]);assert.equal(hidden.room.state.ownChoice,null);assert.ok(!Object.hasOwn(hidden.room.state,'choices'));assert.equal((await req('/api/games/rooms/'+r.id,'GET',null,b)).data.room.state.ownChoice,null);
      r=await op(old,'move',b,{choice:0});assert.deepEqual(r.state.scores,[1,0]);await op(old,'move',a,{choice:1},409);
      const results=await Promise.all([req(`/api/games/rooms/${r.id}/move`,'POST',input(r,{choice:1}),a),req(`/api/games/rooms/${r.id}/move`,'POST',input(r,{choice:0}),b)]);assert.deepEqual(results.map(x=>x.status),[200,200]);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.status,'finished');assert.equal(r.state.winner,0);
      const oldMatch=r;const rematches=await Promise.all([req(`/api/games/rooms/${r.id}/rematch`,'POST',input(r),a),req(`/api/games/rooms/${r.id}/rematch`,'POST',input(r),b)]);assert.deepEqual(rematches.map(x=>x.status),[200,200]);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.matchNumber,2);assert.equal(r.status,'waiting');assert.deepEqual(r.ready,[false,false]);await op(oldMatch,'ready',a,undefined,409);await op(r,'leave',a);ws.close();
    });
    await t.test('memory masking and server-driven mismatch reveal do not leak unseen cards',async()=>{
      let r=await playing(await create('memory'));assert.ok(r.state.cards.every(v=>v===null));const store=new DatabaseSync(join(dir,'campuswall.sqlite')),cards=JSON.parse(store.prepare('SELECT state FROM game_rooms WHERE id=?').get(r.id).state).cards;store.close();const different=cards.findIndex(v=>v!==cards[0]);r=await op(r,'move',a,{index:0});r=await op(r,'move',a,{index:different});assert.equal(r.state.cards.filter(v=>v!==null).length,2);editState(r,s=>s.hideAt=Date.now()-1);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.state.turn,1);assert.ok(r.state.cards.every(v=>v===null));await op(r,'leave',a);
    });
    await t.test('both captains can place simultaneously and opponent fleet stays hidden',async()=>{
      let r=await playing(await create('battleship'));const fleet={type:'fleet',ships:[{row:0,col:0,direction:'horizontal'},{row:2,col:0,direction:'horizontal'},{row:4,col:0,direction:'horizontal'}]};const placed=await Promise.all([req(`/api/games/rooms/${r.id}/move`,'POST',input(r,fleet),a),req(`/api/games/rooms/${r.id}/move`,'POST',input(r,fleet),b)]);assert.deepEqual(placed.map(x=>x.status),[200,200]);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.state.phase,'battle');assert.equal(r.state.ownFleet.length,9);assert.equal(r.state.opponentFleet,null);assert.ok(!Object.hasOwn(r.state,'fleets'));r=await op(r,'move',a,{index:0});assert.equal(r.state.ownShots[0].hit,true);r=await op(r,'leave',b);assert.equal(r.state.opponentFleet.length,9);
    });
    await t.test('quiz answers stay secret, concurrent choices reveal once and deadlines advance server-side',async()=>{
      let r=await playing(await create('quiz')),old=r;r=await op(r,'move',a,{choice:0});const hidden=(await req('/api/games/rooms/'+r.id,'GET',null,b)).data.room.state;assert.equal(hidden.ownAnswer,null);assert.equal(hidden.result,null);assert.ok(!Object.hasOwn(hidden,'questions'));r=await op(old,'move',b,{choice:1});assert.ok(Number.isInteger(r.state.result.correct));editState(r,s=>s.nextAt=Date.now()-1);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.state.round,1);await op(old,'move',a,{choice:2},409);editState(r,s=>s.deadline=Date.now()-1);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.ok(r.state.result);await op(r,'leave',a);
    });
    await t.test('drawing artist and guesser have different private views and independent actions survive concurrency',async()=>{
      let r=await playing(await create('draw'));assert.ok(r.state.word);const guesser=(await req('/api/games/rooms/'+r.id,'GET',null,b)).data.room;assert.equal(guesser.state.word,null);assert.ok(!Object.hasOwn(guesser.state,'wordList'));await op(r,'move',b,{type:'stroke',points:[[0,0],[1,1]],colour:'#001b44',width:5},400);
      const results=await Promise.all([req(`/api/games/rooms/${r.id}/move`,'POST',input(r,{type:'stroke',points:[[.1,.2],[.7,.8]],colour:'#001b44',width:5}),a),req(`/api/games/rooms/${r.id}/move`,'POST',input(r,{type:'guess',word:'incorrect-answer'}),b)]);assert.deepEqual(results.map(x=>x.status),[200,200]);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.state.strokes.length,1);assert.deepEqual(r.state.guesses,['incorrect-answer']);r=await op(r,'move',b,{type:'guess',word:r.state.word});assert.equal(r.state.result.correct,true);editState(r,s=>s.nextAt=Date.now()-1);r=(await req('/api/games/rooms/'+r.id,'GET',null,a)).data.room;assert.equal(r.state.artist,1);assert.equal(r.state.word,null);await op(r,'leave',a);
    });
    await t.test('gomoku, connect four, reversi and chess accept legal moves with authoritative boards',async()=>{
      for(const [game,action,verify] of [['gomoku',{index:112},s=>s.board[112]===1],['connect4',{column:3},s=>s.board[38]===1],['reversi',{index:19},s=>s.board[27]===1],['chess',{from:'e2',to:'e4'},s=>s.board[36]?.type==='p'&&s.history[0]==='e4']]){let r=await playing(await create(game));r=await op(r,'move',a,action);assert.ok(verify(r.state),game);assert.equal(r.state.turn,1);if(game==='chess')persisted=r;else await op(r,'leave',a);}
    });
    await t.test('rooms and exact board history persist across restart; logout closes private live access',async()=>{
      for(const ws of clients)ws.close();await stop();await start();let r=(await req('/api/games/rooms/'+persisted.id,'GET',null,a)).data.room;assert.equal(r.status,'playing');assert.deepEqual(r.state.history,['e4']);assert.equal(r.state.board[36].type,'p');const ws=await socket('game='+r.id,b);await wait(ws,'game:state');const closed=once(ws,'close');await req('/api/auth/logout','POST',{},b);r=await op(r,'move',b,{from:'e7',to:'e5'},401);persisted=(await req('/api/games/rooms/'+persisted.id,'GET',null,a)).data.room;await op(persisted,'leave',a);assert.equal((await closed)[0],4001);assert.equal(await rejectSocket('games=anu',b),401);const store=new DatabaseSync(join(dir,'campuswall.sqlite'));assert.equal(store.prepare('PRAGMA user_version').get().user_version,13);store.close();
    });
  }finally{for(const ws of clients)ws.terminate();if(child&&child.exitCode===null)await stop();const target=resolve(dir);assert.ok(target.startsWith(root+sep));rmSync(target,{recursive:true,force:true});}
});

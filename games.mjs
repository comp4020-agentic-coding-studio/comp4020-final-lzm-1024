import {gameCatalog} from './public/game-catalog.js';
import {newGame,moveGame,settleGame,publicGame} from './game-engine.mjs';

export function createGames({blocks={guard(){},between(){return false;}},db,get,all,run,id,now,fail,string,campusAccount,body,json,sockets,send,validSocket,messaging,recordGame=()=>{},notify=()=>{},emit=()=>{}}){
  const room=id=>get('SELECT * FROM game_rooms WHERE id=?',id)||fail(404,'Game room not found');
  const seat=(r,u)=>r.hostId===u.id?0:r.guestId===u.id?1:-1;
  const identity=userId=>userId?get('SELECT id,name,username FROM users WHERE id=?',userId):null;
  function access(r,u){if(r.universityId!==u.universityId)fail(403,'Games stay within your university');if(seat(r,u)<0&&(r.status!=='waiting'||r.guestId||r.inviteeId&&r.inviteeId!==u.id))fail(404,'This room is private to its players');return r;}
  function view(r,u){access(r,u);const player=seat(r,u),state=JSON.parse(r.state);return {id:r.id,universityId:r.universityId,game:r.game,status:r.status,players:[identity(r.hostId),identity(r.guestId)],invitee:identity(r.inviteeId),ready:[!!r.ready1,!!r.ready2],rematch:[!!r.rematch1,!!r.rematch2],version:r.version,matchNumber:r.matchNumber,player,canJoin:r.status==='waiting'&&!r.guestId&&player<0,updatedAt:r.updatedAt,state:player>=0&&r.status!=='waiting'?publicGame(r.game,state,player):null,online:[r.hostId,r.guestId].map(p=>!!p&&[...sockets].some(ws=>ws.gameRoom===r.id&&ws.user?.id===p&&ws.readyState===1&&validSocket(ws))),serverTime:Date.now()};}
  function list(u){return all("SELECT * FROM game_rooms WHERE universityId=? AND ((status='waiting' AND guestId IS NULL AND (inviteeId IS NULL OR inviteeId=?)) OR hostId=? OR guestId=?) ORDER BY updatedAt DESC LIMIT 40",u.universityId,u.id,u.id,u.id).map(r=>({id:r.id,game:r.game,status:r.status,host:identity(r.hostId),opponent:identity(r.guestId),mine:seat(r,u)>=0,invited:r.inviteeId===u.id,matchNumber:r.matchNumber,updatedAt:r.updatedAt}));}
  function broadcast(r){recordGame(r,JSON.parse(r.state));for(const ws of sockets){if(ws.gameRoom===r.id){if(!validSocket(ws)){ws.close(4001,'Session expired');continue;}try{send(ws,'game:state',{room:view(r,ws.user)});}catch{ws.close(4003,'Room access changed');}}if(ws.gameLobby===r.universityId){if(validSocket(ws))send(ws,'games:list',{rooms:list(ws.user)});else ws.close(4001,'Session expired');}}}
  function persist(r,state,changes={}){const next={...r,...changes,state:JSON.stringify(state),status:state.finished?'finished':changes.status||r.status,version:r.version+1,updatedAt:now()};run('UPDATE game_rooms SET inviteeId=?,guestId=?,status=?,state=?,ready1=?,ready2=?,rematch1=?,rematch2=?,version=?,matchNumber=?,updatedAt=? WHERE id=?',next.inviteeId??null,next.guestId,next.status,next.state,next.ready1,next.ready2,next.rematch1,next.rematch2,next.version,next.matchNumber,next.updatedAt,next.id);return next;}
  function tickOne(r){if(r.status==='playing'){const state=JSON.parse(r.state);if(settleGame(r.game,state)){r=persist(r,state);broadcast(r);}}return r;}
  function validClient(input){if(typeof input.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.clientId))fail(400,'Invalid game request');}
  function limit(u){if(get('SELECT COUNT(*) n FROM game_requests WHERE userId=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=150)fail(429,'Take a short break before sending more game actions');}
  async function handle(req,res,url){
    const path=url.pathname,method=req.method;
    if(path==='/api/games/catalog'&&method==='GET')return json(res,200,{games:gameCatalog});
    let u=campusAccount(req);
    if(path==='/api/games/players'&&method==='GET'){const q=string(url.searchParams.get('q')||'',50,'Search').replace(/^@/,'').toLowerCase(),peerId=url.searchParams.get('id');return json(res,200,{users:peerId?all("SELECT id,name,username FROM users WHERE id=? AND universityId=? AND id<>? AND passwordHash<>'!disabled'",peerId,u.universityId,u.id):q.length<2?[]:all("SELECT id,name,username FROM users WHERE universityId=? AND id<>? AND passwordHash<>'!disabled' AND (instr(lower(name),?)>0 OR instr(lower(username),?)>0) ORDER BY name LIMIT 20",u.universityId,u.id,q,q)});}
    // Who is in the games area right now: same campus, not blocked, never emails.
    if(path==='/api/games/online'&&method==='GET'){const here=new Set();for(const ws of sockets){const p=ws.user;if(!p||p.id===u.id||p.universityId!==u.universityId||!(ws.gameLobby||ws.gameRoom)||ws.readyState!==1||here.has(p.id)||!validSocket(ws)||blocks.between(u.id,p.id))continue;here.add(p.id);}
      const people=[...here].slice(0,60).map(identity).filter(Boolean).map(p=>({...p,playing:!!get("SELECT 1 FROM game_rooms WHERE status='playing' AND (hostId=? OR guestId=?)",p.id,p.id)})).sort((a,b)=>a.playing-b.playing||a.name.localeCompare(b.name)).slice(0,30);return json(res,200,{users:people});}
    if(path==='/api/games/rooms/active'&&method==='GET'){
      const game=url.searchParams.get('game');
      if(!gameCatalog.some(g=>g.id===game))fail(400,'Choose an available game');
      const candidates=all("SELECT * FROM game_rooms WHERE universityId=? AND (hostId=? OR guestId=?) AND game=? AND status IN ('waiting','playing') ORDER BY updatedAt DESC",u.universityId,u.id,u.id,game);
      for(const candidate of candidates){const current=tickOne(candidate);if(['waiting','playing'].includes(current.status))return json(res,200,{room:view(current,u)});}
      return json(res,200,{room:null});
    }
    // Recover forgotten rooms without needing their IDs or the lobby's limited list.
    if(path==='/api/games/rooms/leave-active'&&method==='POST'){
      const input=await body(req);u=campusAccount(req);validClient(input);limit(u);
      const previous=all("SELECT * FROM game_rooms WHERE universityId=? AND (hostId=? OR guestId=?) AND status IN ('waiting','playing')",u.universityId,u.id,u.id);
      for(const r of previous){
        const state=JSON.parse(r.state),player=seat(r,u);let changes={};
        state.endedBy=player;changes={ready1:0,ready2:0,rematch1:0,rematch2:0};
        if(r.status==='waiting'){changes.status='cancelled';state.notice='A player left. This table is closed.';}
        else{state.finished=true;state.winner=1-player;state.notice='A player left. This match has ended.';}
        broadcast(persist(r,state,changes));
      }
      return json(res,200,{left:previous.length});
    }
    if(path==='/api/games/rooms'){
      if(method==='GET')return json(res,200,{rooms:list(u)});
      if(method==='POST'){
        const input=await body(req);u=campusAccount(req);validClient(input);const payload=JSON.stringify({game:input.game,inviteeId:input.inviteeId||null});
        const previous=get('SELECT * FROM game_requests WHERE userId=? AND clientId=?',u.id,input.clientId);if(previous){if(previous.operation!=='create'||previous.payload!==payload)fail(409,'This request already created another room');return json(res,200,{room:view(room(previous.roomId),u)});}
        limit(u);if(!gameCatalog.some(g=>g.id===input.game))fail(400,'Choose an available game');
        if(input.inviteeId){const peer=get("SELECT id FROM users WHERE id=? AND universityId=? AND passwordHash<>'!disabled'",input.inviteeId,u.universityId);if(!peer||peer.id===u.id)fail(400,'Invite another user from your university');blocks.guard(u.id,peer.id);}
        if(get("SELECT COUNT(*) n FROM game_rooms WHERE hostId=? AND status IN ('waiting','playing')",u.id).n>=10)fail(429,'Finish or close an existing room before creating another');
        const roomId=id(),time=now();db.exec('BEGIN');try{run('INSERT INTO game_rooms (id,universityId,game,hostId,inviteeId,state,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',roomId,u.universityId,input.game,u.id,input.inviteeId||null,JSON.stringify(newGame(input.game)),time,time);run('INSERT INTO game_requests VALUES (?,?,?,?,?,?)',u.id,input.clientId,roomId,'create',payload,time);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        const r=room(roomId);broadcast(r);return json(res,201,{room:view(r,u)});
      }
    }
    const match=path.match(/^\/api\/games\/rooms\/([a-f0-9-]{36})(?:\/(join|ready|move|rematch|leave|invite))?$/);if(!match)fail(404,'Game endpoint not found');
    let r=tickOne(access(room(match[1]),u));const operation=match[2];
    if(!operation&&method==='GET')return json(res,200,{room:view(r,u)});
    if(method!=='POST'||!operation)fail(405,'Game operation not available');
    const input=await body(req);u=campusAccount(req);r=tickOne(access(room(r.id),u));validClient(input);
    const payload=JSON.stringify({action:input.action||null,...(operation==='invite'&&input.userId?{userId:input.userId,message:!!input.message}:{})});const previous=get('SELECT * FROM game_requests WHERE userId=? AND clientId=?',u.id,input.clientId);
    if(previous){if(previous.roomId!==r.id||previous.operation!==operation||previous.payload!==payload)fail(409,'This request already performed another action');return json(res,200,{room:view(r,u)});}
    limit(u);let state=JSON.parse(r.state),changes={},player=seat(r,u);
    const round=r.game==='rps'?state.rounds.length:state.round;
    const parallel=operation==='move'&&(['rps','quiz','draw'].includes(r.game)||r.game==='battleship'&&input.action?.type==='fleet')||['ready','rematch'].includes(operation);
    if(!Number.isInteger(input.version)||input.version<0||input.version>r.version||input.version!==r.version&&!(parallel&&input.matchNumber===r.matchNumber&&(operation!=='move'||round===undefined||input.round===round)))fail(409,'The board changed. Reconnect and try your move again.');
    if(input.matchNumber!==undefined&&input.matchNumber!==r.matchNumber||operation==='move'&&round!==undefined&&input.round!==round)fail(409,'This round has changed. Use the current game state.');
    if(operation==='join'){
      if(r.status!=='waiting'||r.guestId||r.hostId===u.id)fail(409,'This room is already full or started');changes.guestId=u.id;changes.ready2=0;
    }else{
      if(player<0)fail(403,'Only the two players can use this room');
      if(operation==='ready'){
        if(r.status!=='waiting')fail(409,'This match already started');changes[player===0?'ready1':'ready2']=1;
        if(r.guestId&&(player===0?r.ready2:r.ready1)){state=newGame(r.game);changes.status='playing';}
      }else if(operation==='move'){
        if(r.status!=='playing')fail(409,'Both players must be ready first');state=moveGame(r.game,state,player,input.action);
      }else if(operation==='rematch'){
        if(Number.isInteger(state.endedBy))fail(409,'A player left. Create a new table to play again.');
        if(r.status!=='finished'||!r.guestId)fail(409,'Finish this match first');changes[player===0?'rematch1':'rematch2']=1;
        if(player===0?r.rematch2:r.rematch1){state=newGame(r.game);changes={status:'waiting',ready1:0,ready2:0,rematch1:0,rematch2:0,matchNumber:r.matchNumber+1};}
      }else if(operation==='leave'){
        if(r.status==='waiting'){if(player===0)changes.status='cancelled';else changes={guestId:null,ready1:0,ready2:0};}
        else if(r.status==='playing'){state.finished=true;state.winner=1-player;state.endedBy=player;state.notice='A player left. This match has ended.';changes={ready1:0,ready2:0,rematch1:0,rematch2:0};}else fail(409,'This room is already closed');
      }else if(operation==='invite'){
        if(player!==0||r.status!=='waiting'||r.guestId)fail(400,'Invite someone while your table is waiting for a second player');
        if(input.userId){const peer=get("SELECT id FROM users WHERE id=? AND universityId=? AND passwordHash<>'!disabled'",String(input.userId),u.universityId);if(!peer||peer.id===u.id)fail(400,'Invite another user from your university');blocks.guard(u.id,peer.id);changes.inviteeId=peer.id;}
        else if(!r.inviteeId)fail(400,'Choose someone to invite');
      }else fail(400,'Game action unavailable');
    }
    let notifyInvitation;const invitee=operation==='invite'?changes.inviteeId||r.inviteeId:null,gameName=gameCatalog.find(g=>g.id===r.game).name;db.exec('BEGIN');try{if(operation==='invite'&&(!input.userId||input.message))notifyInvitation=messaging.inviteGame(u,invitee,r.id,gameName);r=persist(r,state,changes);run('INSERT INTO game_requests VALUES (?,?,?,?,?,?)',u.id,input.clientId,r.id,operation,payload,now());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    notifyInvitation?.();broadcast(r);
    // The invited student hears about it on any page; the seat is held for them.
    if(invitee){notify(invitee,'game',`${u.name} invited you to play ${gameName}`,`/games/${r.id}`,`game-invite:${r.id}:${invitee}:${r.version}`);emit(invitee,'game:invite',{roomId:r.id,game:r.game,gameName,host:identity(u.id)});}
    return json(res,200,{room:view(r,u)});
  }
  function tick(){for(const r of all("SELECT * FROM game_rooms WHERE status='playing' AND game IN ('memory','quiz','draw')"))tickOne(r);}
  return {handle,list,room,access,view,broadcast,tick};
}

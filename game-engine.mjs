import {randomInt} from 'node:crypto';
import {Chess} from 'chess.js';
import {gameCatalog} from './public/game-catalog.js';
const check=(condition,message)=>{if(!condition){const error=new Error(message);error.status=400;throw error;}};
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const shuffled=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const words=[['library'],['coffee'],['bicycle','bike'],['graduation'],['backpack','rucksack'],['football','soccer'],['pizza'],['umbrella'],['guitar'],['book'],['tree'],['robot'],['basketball'],['camera'],['sun','sunshine'],['headphones','headset']];
const questions=[
 ['Which university is in Canberra?',['ANU','UWA','UQ','Monash'],0],['How many sides does a hexagon have?',['5','6','7','8'],1],['Which planet is called the Red Planet?',['Venus','Mars','Jupiter','Saturn'],1],['Which city is UWA based in?',['Sydney','Brisbane','Perth','Canberra'],2],['What is the chemical symbol for gold?',['Ag','Fe','Au','Cu'],2],['Which university uses purple as a signature colour?',['UQ','UNSW','ANU','UWA'],0],['Which ocean lies to the west of Australia?',['Pacific','Atlantic','Arctic','Indian'],3],['How many squares are on a chessboard?',['32','48','64','81'],2],['What is 7 × 8?',['48','54','56','64'],2],['Which instrument usually has 88 keys?',['Guitar','Piano','Violin','Flute'],1],['What does HTML describe?',['A webpage structure','A planet','A musical scale','A sport'],0],['Which piece moves in an L shape in chess?',['Bishop','Rook','King','Knight'],3],['What is the capital of Queensland?',['Perth','Brisbane','Adelaide','Darwin'],1],['Which is a renewable energy source?',['Coal','Oil','Solar','Natural gas'],2],['What is the largest mammal?',['Elephant','Blue whale','Giraffe','Polar bear'],1],['Which direction does the sun generally rise from?',['North','South','East','West'],2]
];
export function newGame(game,now=Date.now()){
  check(gameCatalog.some(g=>g.id===game),'Choose an available game');const s={turn:0,finished:false,winner:null,moves:0,notice:'',lastMove:null};
  if(['gomoku','connect4','tictactoe','reversi'].includes(game)){s.board=Array(game==='gomoku'?225:game==='connect4'?42:game==='reversi'?64:9).fill(0);if(game==='reversi'){s.board[27]=s.board[36]=2;s.board[28]=s.board[35]=1;}}
  if(game==='rps'){s.choices=[null,null];s.scores=[0,0];s.rounds=[];}
  if(game==='memory'){s.cards=shuffled([...Array(8).keys(),...Array(8).keys()]);s.matched=Array(16).fill(false);s.flipped=[];s.scores=[0,0];s.hideAt=null;}
  if(game==='battleship'){s.fleets=[null,null];s.shots=[[],[]];s.phase='placement';}
  if(game==='chess'){s.pgn='';s.fen=new Chess().fen();s.history=[];s.check=false;}
  if(game==='draw'){s.wordList=shuffled(words).slice(0,4);s.round=0;s.artist=0;s.strokes=[];s.guesses=[];s.scores=[0,0];s.deadline=now+60000;s.result=null;s.nextAt=null;}
  if(game==='quiz'){s.questions=shuffled(questions).slice(0,8);s.round=0;s.answers=[null,null];s.scores=[0,0];s.started=now;s.deadline=now+20000;s.result=null;s.nextAt=null;}
  return s;
}
function finish(s,winner,notice){s.finished=true;s.winner=winner;s.notice=notice;}
function scoreFinish(s,notice){finish(s,s.scores[0]===s.scores[1]?null:s.scores[0]>s.scores[1]?0:1,notice);}
function line(s,index,cols,rows,length){const r=Math.floor(index/cols),c=index%cols,value=s.board[index];for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){const cells=[index];for(const direction of [-1,1])for(let n=1;;n++){const y=r+dr*n*direction,x=c+dc*n*direction;if(y<0||y>=rows||x<0||x>=cols||s.board[y*cols+x]!==value)break;cells.push(y*cols+x);}if(cells.length>=length){s.winningCells=cells;finish(s,value-1,'A winning connection!');return;}}if(s.board.every(Boolean))finish(s,null,'The board is full. A draw.');}
export function reversiFlips(board,index,player){if(board[index])return [];const r=Math.floor(index/8),c=index%8,own=player+1,flips=[];for(const [dy,dx] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const ray=[];let y=r+dy,x=c+dx;while(y>=0&&y<8&&x>=0&&x<8){const i=y*8+x;if(board[i]===3-own)ray.push(i);else{if(board[i]===own&&ray.length)flips.push(...ray);break;}y+=dy;x+=dx;}}return flips;}
const legalReversi=(s,player)=>s.board.flatMap((_,i)=>reversiFlips(s.board,i,player).length?[i]:[]);
function chess(s){const c=new Chess();if(s.pgn)c.loadPgn(s.pgn);return c;}
function quizResult(s,now){const q=s.questions[s.round],scores=s.answers.map(a=>a&&a.choice===q[2]?100+Math.max(0,Math.floor(50*(1-(a.time-s.started)/20000))):0);for(let i=0;i<2;i++)s.scores[i]+=scores[i];s.result={correct:q[2],answers:s.answers.map(a=>a?.choice??null),points:scores};s.nextAt=now+2600;}
function drawResult(s,correct,now){s.result={correct,word:s.wordList[s.round][0]};if(correct){s.scores[0]++;s.scores[1]++;}s.nextAt=now+2400;}
export function settleGame(game,s,now=Date.now()){
  if(s.finished)return false;let changed=false;
  if(game==='memory'&&s.hideAt&&now>=s.hideAt){s.flipped=[];s.hideAt=null;s.turn=1-s.turn;changed=true;}
  if(game==='quiz'&&!s.result&&now>=s.deadline){quizResult(s,now);changed=true;}
  if(game==='draw'&&!s.result&&now>=s.deadline){drawResult(s,false,now);changed=true;}
  if((game==='quiz'||game==='draw')&&s.nextAt&&now>=s.nextAt){
    s.round++;s.nextAt=null;s.result=null;changed=true;
    if(s.round>=(game==='quiz'?8:4)){if(game==='quiz')scoreFinish(s,'Quiz complete.');else finish(s,null,`Together you guessed ${s.scores[0]} of 4 words.`);}
    else if(game==='quiz'){s.answers=[null,null];s.started=now;s.deadline=now+20000;}
    else{s.artist=s.round%2;s.strokes=[];s.guesses=[];s.deadline=now+60000;}
  }
  return changed;
}
export function moveGame(game,state,player,a,now=Date.now()){
  const s=structuredClone(state);check(!s.finished,'This match has finished');check(player===0||player===1,'Join the room to play');check(a&&typeof a==='object'&&!Array.isArray(a),'Invalid move');
  if(['gomoku','connect4','tictactoe','reversi','chess'].includes(game)){check(s.turn===player,'Wait for your turn');}
  if(['gomoku','connect4','tictactoe'].includes(game)){
    let index=a.index;const cols=game==='gomoku'?15:game==='connect4'?7:3,rows=game==='gomoku'?15:game==='connect4'?6:3;
    if(game==='connect4'){check(integer(a.column,0,6),'Choose a column');index=-1;for(let r=5;r>=0;r--)if(!s.board[r*7+a.column]){index=r*7+a.column;break;}check(index>=0,'That column is full');}
    check(integer(index,0,s.board.length-1)&&!s.board[index],'Choose an empty square');s.board[index]=player+1;s.lastMove=index;line(s,index,cols,rows,game==='gomoku'?5:game==='connect4'?4:3);s.turn=1-player;
  }else if(game==='reversi'){
    check(integer(a.index,0,63),'Choose a square');const flips=reversiFlips(s.board,a.index,player);check(flips.length,'Choose a highlighted legal move');s.board[a.index]=player+1;for(const i of flips)s.board[i]=player+1;s.lastMove=a.index;s.flips=flips;s.turn=1-player;s.notice='';
    if(!legalReversi(s,s.turn).length){if(legalReversi(s,player).length){s.turn=player;s.notice='Opponent has no legal move. Play again.';}else{s.scores=[s.board.filter(x=>x===1).length,s.board.filter(x=>x===2).length];scoreFinish(s,'No legal moves remain.');}}
  }else if(game==='rps'){
    check(integer(a.choice,0,2),'Choose rock, paper or scissors');check(s.choices[player]===null,'Your choice is already locked');s.choices[player]=a.choice;
    if(s.choices.every(x=>x!==null)){const [x,y]=s.choices,winner=x===y?null:(x-y+3)%3===1?0:1;s.rounds.push({choices:[x,y],winner});if(winner!==null)s.scores[winner]++;s.choices=[null,null];if(s.scores.some(n=>n===2))scoreFinish(s,'Best of three complete.');if(s.rounds.length>=100&&!s.finished)scoreFinish(s,'Match limit reached.');}
  }else if(game==='memory'){
    check(s.turn===player,'Wait for your turn');check(!s.hideAt,'Let both players see these cards first');check(integer(a.index,0,15)&&!s.matched[a.index]&&!s.flipped.includes(a.index),'Choose a face-down card');s.flipped.push(a.index);s.lastMove=a.index;
    if(s.flipped.length===2){const [x,y]=s.flipped;if(s.cards[x]===s.cards[y]){s.matched[x]=s.matched[y]=true;s.scores[player]++;s.flipped=[];if(s.matched.every(Boolean))scoreFinish(s,'Every pair found.');}else s.hideAt=now+1600;}
  }else if(game==='battleship'){
    if(s.phase==='placement'){
      check(a.type==='fleet'&&!s.fleets[player],'Place your fleet once');check(Array.isArray(a.ships)&&a.ships.length===3,'Place ships of lengths 4, 3 and 2');const fleet=[];
      for(let n=0;n<3;n++){const ship=a.ships[n];check(ship&&integer(ship.row,0,7)&&integer(ship.col,0,7)&&['horizontal','vertical'].includes(ship.direction),'Invalid ship position');for(let j=0;j<[4,3,2][n];j++){const r=ship.row+(ship.direction==='vertical'?j:0),c=ship.col+(ship.direction==='horizontal'?j:0);check(r<8&&c<8&&!fleet.includes(r*8+c),'Ships must fit and cannot overlap');fleet.push(r*8+c);}}
      s.fleets[player]=fleet;if(s.fleets.every(Boolean))s.phase='battle';
    }else{
      check(s.turn===player,'Wait for your turn');check(integer(a.index,0,63)&&!s.shots[player].some(x=>x.index===a.index),'Choose a square you have not fired at');const hit=s.fleets[1-player].includes(a.index);s.shots[player].push({index:a.index,hit});s.lastMove={index:a.index,player,hit};s.turn=1-player;if(s.shots[player].filter(x=>x.hit).length===9)finish(s,player,'The opposing fleet has sunk.');
    }
  }else if(game==='chess'){
    const c=chess(s);check(typeof a.from==='string'&&typeof a.to==='string'&&/^[a-h][1-8]$/.test(a.from)&&/^[a-h][1-8]$/.test(a.to),'Choose a piece and destination');check(a.promotion===undefined||['q','r','b','n'].includes(a.promotion),'Choose a promotion piece');let move;try{move=c.move({from:a.from,to:a.to,promotion:a.promotion||'q'});}catch{check(false,'That is not a legal chess move');}
    s.pgn=c.pgn();s.fen=c.fen();s.history=c.history();s.lastMove={from:move.from,to:move.to};s.turn=c.turn()==='w'?0:1;s.check=c.isCheck();
    if(c.isCheckmate())finish(s,player,'Checkmate.');else if(c.isDraw())finish(s,null,c.isStalemate()?'Stalemate.':'Draw: repetition, fifty-move rule or insufficient material.');
  }else if(game==='quiz'){
    check(!s.result&&now<s.deadline,'Wait for the next question');check(s.answers[player]===null&&integer(a.choice,0,3),'Your answer is already locked, or invalid');s.answers[player]={choice:a.choice,time:now};if(s.answers.every(Boolean))quizResult(s,now);
  }else if(game==='draw'){
    check(!s.result&&now<s.deadline,'Wait for the next drawing round');
    if(a.type==='stroke'){
      check(player===s.artist,'Only the artist can draw');check(s.strokes.length<250,'Drawing is full; clear it to continue');check(Array.isArray(a.points)&&a.points.length>=2&&a.points.length<=160,'Invalid stroke');check(s.strokes.reduce((n,stroke)=>n+stroke.points.length,0)+a.points.length<=6000,'Drawing is full; clear it to continue');check(a.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)),'Invalid drawing coordinates');check(['#001b44','#be830e','#e64626','#006dae','#51247a','#ffffff'].includes(a.colour)&&integer(a.width,2,18),'Choose a drawing colour and width');s.strokes.push({points:a.points,colour:a.colour,width:a.width});
    }else if(a.type==='clear'){check(player===s.artist,'Only the artist can clear');s.strokes=[];}
    else if(a.type==='guess'){
      check(player!==s.artist,'The artist cannot guess');check(typeof a.word==='string'&&a.word.trim().length>0&&a.word.length<=60,'Enter a short guess');check(s.guesses.length<40,'Too many guesses this round');const guess=a.word.trim(),normal=x=>x.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');s.guesses.push(guess);if(s.wordList[s.round].some(w=>normal(w)===normal(guess)))drawResult(s,true,now);
    }else check(false,'Choose a drawing action');
  }else check(false,'Game unavailable');
  s.moves++;return s;
}
export function publicGame(game,s,player){
  const result={turn:s.turn,finished:s.finished,winner:s.winner,notice:s.notice,moves:s.moves,lastMove:s.lastMove};
  if(s.scores)result.scores=s.scores;
  if(s.board){result.board=s.board;result.winningCells=s.winningCells||[];if(game==='reversi'){result.legal=legalReversi(s,s.turn);result.scores=[s.board.filter(x=>x===1).length,s.board.filter(x=>x===2).length];}}
  if(game==='rps')Object.assign(result,{ownChoice:s.choices[player],chosen:s.choices.map(x=>x!==null),rounds:s.rounds});
  if(game==='memory')Object.assign(result,{cards:s.cards.map((value,i)=>s.matched[i]||s.flipped.includes(i)||s.finished?value:null),matched:s.matched,flipped:s.flipped,hideAt:s.hideAt});
  if(game==='battleship')Object.assign(result,{phase:s.phase,placed:s.fleets.map(Boolean),ownFleet:s.fleets[player],opponentFleet:s.finished?s.fleets[1-player]:null,ownShots:s.shots[player],incomingShots:s.shots[1-player]});
  if(game==='chess'){const c=chess(s);Object.assign(result,{board:c.board().flat(),legal:c.moves({verbose:true}).map(m=>({from:m.from,to:m.to,promotion:m.promotion||null})),check:s.check,history:s.history});}
  if(game==='quiz'){const q=s.questions[Math.min(s.round,7)];Object.assign(result,{round:s.round,question:q[0],options:q[1],ownAnswer:s.answers[player]?.choice??null,answered:s.answers.map(Boolean),deadline:s.deadline,result:s.result,nextAt:s.nextAt});}
  if(game==='draw')Object.assign(result,{round:s.round,artist:s.artist,word:player===s.artist&&!s.finished?s.wordList[s.round]?.[0]:null,strokes:s.strokes,guesses:s.guesses,deadline:s.deadline,result:s.result,nextAt:s.nextAt});
  return result;
}

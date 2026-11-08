import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedCanvas,applyCanvasOperation,canvasInverse,canvasDisplayText,canvasPoster,objectDefaults,placeholderTexts} from '../public/canvas-model.js';
import {createTranslator} from '../translation.mjs';

// Found by playing through the whole site with several accounts.
const read=file=>readFileSync(file,'utf8');
const add=(canvas,props={})=>{const object={id:crypto.randomUUID(),type:'sticky',...objectDefaults,x:123.456,y:200.789,text:'Note',fill:'#f6df98',stroke:'#554521',width:280,height:220,fontSize:28,...props},op={action:'add',object};return {op,object,after:applyCanvasOperation(canvas,op)};};

test('undo works after a position that storage rounds',()=>{
  const start=seedCanvas({title:'t'}),{op,object,after}=add(start);
  const undoAdd=canvasInverse(op,start,after);
  assert.equal(applyCanvasOperation(after,undoAdd).objects.some(o=>o.id===object.id),false,'a new object placed at a fractional position can be undone');
  const move={action:'patch',id:object.id,props:{x:300.333,y:400.555}},moved=applyCanvasOperation(after,move),undoMove=canvasInverse(move,after,moved);
  const back=applyCanvasOperation(moved,undoMove).objects.find(o=>o.id===object.id);
  assert.deepEqual([back.x,back.y],[123.46,200.79],'a move returns the object to where it was');
});
test('undo still refuses to overwrite a friend’s real change',()=>{
  const start=seedCanvas({title:'t'}),{op,object,after}=add(start),friend=applyCanvasOperation(after,{action:'patch',id:object.id,props:{text:'Changed by a friend'}});
  assert.throws(()=>applyCanvasOperation(friend,canvasInverse(op,start,after)),/A friend changed this object/);
  const move={action:'patch',id:object.id,props:{x:300.333}},moved=applyCanvasOperation(after,move),undoMove=canvasInverse(move,after,moved),dragged=applyCanvasOperation(moved,{action:'patch',id:object.id,props:{x:900}});
  assert.throws(()=>applyCanvasOperation(dragged,undoMove),/A friend changed this object/);
});
test('undo covers layer order and board settings as well',()=>{
  let c=seedCanvas({title:'t'});const id=c.objects[0].id,front={action:'reorder',id,position:'front'},after=applyCanvasOperation(c,front);
  assert.equal(applyCanvasOperation(after,canvasInverse(front,c,after)).objects[0].id,id);
  const settings={action:'settings',props:{background:'#112233'}},changed=applyCanvasOperation(c,settings);
  assert.equal(applyCanvasOperation(changed,canvasInverse(settings,c,changed)).background,c.background);
});
test('artwork hides untouched starter text outside the editor and shows readable dates',()=>{
  const start=seedCanvas({title:'Trivia night',date:'2026-12-20',time:'18:30'}),{after}=add(start,{text:placeholderTexts[1]}),art=canvasPoster({title:'Trivia night',canvas:after});
  assert.ok(!art.includes(placeholderTexts[1]),'starter text is not on the public poster');
  assert.ok(after.objects.some(o=>o.text===placeholderTexts[1]),'the stored board is unchanged');
  assert.equal(canvasDisplayText({text:placeholderTexts[1]},true),placeholderTexts[1],'the editor still shows it');
  assert.equal(canvasDisplayText({text:'My real idea'}),'My real idea');
  assert.ok(art.includes('20 Dec 2026'),'the date reads naturally');assert.ok(!art.includes('2026-12-20'));
  assert.equal(canvasDisplayText({id:'base-when',text:'2026-12-20 · 18:30'}),'20 Dec 2026 · 18:30');
  assert.equal(canvasDisplayText({id:'base-when',text:'Date to come'}),'Date to come');
  assert.equal(canvasDisplayText({id:'other',text:'2026-12-20'}),'2026-12-20','only the event date field is reformatted');
  assert.ok(read('server.mjs').includes("category:['base-campus',"),'the artwork label follows the category');
});
test('game tables show their own state before an old invitation',()=>{
  const games=read('public/games.js'),label=/r\.status==='playing'\?'Resume':r\.status==='finished'\?'Results':r\.status==='cancelled'\?'Closed':r\.mine\?'Back to table':r\.invited\?'Invited':'Join table'/;
  assert.match(games,label);
});
test('an English message gets a clear answer, and a real outage stays an outage',async()=>{
  const reply=body=>async()=>new Response(JSON.stringify(body));
  const same=createTranslator({fetchImpl:reply({responseStatus:'403',responseData:{translatedText:'PLEASE SELECT TWO DISTINCT LANGUAGES'}})});
  await assert.rejects(same('Hello there','autodetect','a'),e=>e.status===422&&/already looks like English/.test(e.message));
  const down=createTranslator({fetchImpl:reply({responseStatus:'500',responseData:{translatedText:'INTERNAL ERROR'}})});
  await assert.rejects(down('Bonjour','fr','a'),e=>e.status===503&&/temporarily unavailable/.test(e.message));
  const works=createTranslator({fetchImpl:reply({responseStatus:200,responseData:{translatedText:'Hello'}})});
  assert.equal((await works('Bonjour','fr','a')).translatedText,'Hello');
});
test('the online status wording matches what the games room shows',()=>{
  const community=read('public/community.js');
  assert.ok(!community.includes('Only friends see your online status'));
  assert.ok(community.includes('Anyone at your university can also see you while you’re on the games pages.'));
  assert.ok(read('public/games.js').includes('students at your university can see your name'),'the games page says so too');
});
test('a block can be undone from Messages and from the account page',()=>{
  const messages=read('public/messages.js'),account=read('public/account.js');
  assert.ok(messages.includes("api('/api/blocks/'+peer.id,undo?'DELETE':'POST',{})"),'the same button blocks and unblocks');
  assert.ok(messages.includes("button.textContent=blocked?'Unblock':'Block'"));
  assert.ok(messages.includes("api('/api/blocks').then("),'an existing block is shown on opening the conversation');
  assert.ok(messages.includes("root.querySelectorAll('.dm-call').forEach(call=>{call.disabled=blocked;})"),'calls are unavailable while blocked');
  assert.ok(messages.includes('!root.querySelector(\'.dm-input\').value.trim()')&&messages.includes('||blockedPeer||'),'sending stays off while blocked');
  assert.ok(account.includes('id="blocked-list"')&&account.includes("api('/api/blocks/'+button.dataset.unblock,'DELETE',{})"),'the account page lists blocks');
});
test('the friend search button says what it does',()=>{
  const community=read('public/community.js');
  assert.ok(community.includes('data-pick="${p.id}">Add friend ♡</button>'));
  assert.ok(!community.includes('data-pick="${p.id}">Select</button>'));
});

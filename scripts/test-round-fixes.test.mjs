import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';

// Problems found by the two-person test round on 8 November 2026.
const read=file=>readFileSync(file,'utf8');
const games=read('public/games.js'),community=read('public/community.js'),app=read('public/app.js');

test('migration 019 gives upgraded test notices their own link and keeps the old one as an alias',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(read('migrations/001-campuswall.sql'));db.exec('COMMIT');
  db.exec("INSERT INTO universities VALUES ('anu','anu','Australian National University','ANU')");
  for(const [id,name] of [['campus-team','CampusWall team'],['student','A student']])db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id,name,id+'@example.test','!disabled','2026-10-01');
  const poster=(id,owner,slug,data)=>db.prepare("INSERT INTO posters VALUES (?,?,'anu',?,'PUBLISHED',?,?,3,'2026-10-01','2026-10-01','2026-10-01')").run(id,owner,slug,JSON.stringify(data),JSON.stringify(data));
  const sample=key=>({title:'Afterglow',isTest:true,photoPoster:{seedKey:key,edition:1}});
  poster('upgraded','campus-team','photography-walk-anu',sample('photo-test-afterglow-anu'));
  poster('current','campus-team','photo-test-slow-sunday-anu',sample('photo-test-slow-sunday-anu'));
  poster('taken','student','photo-test-field-notes-anu',{title:'A student poster that already uses the link'});
  poster('blocked','campus-team','find-your-people-anu',sample('photo-test-field-notes-anu'));
  poster('student-copy','student','my-own-link',sample('photo-test-long-table-anu'));
  const before=db.prepare("SELECT * FROM posters WHERE id IN ('current','taken','blocked','student-copy') ORDER BY id").all();
  db.exec(read('migrations/019-poster-slug-aliases.sql'));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,19);
  assert.equal(db.prepare("SELECT slug FROM posters WHERE id='upgraded'").get().slug,'photo-test-afterglow-anu');
  assert.deepEqual(db.prepare('SELECT slug,posterId FROM poster_slug_aliases').all().map(r=>({...r})),[{slug:'photography-walk-anu',posterId:'upgraded'}]);
  assert.deepEqual(db.prepare("SELECT * FROM posters WHERE id IN ('current','taken','blocked','student-copy') ORDER BY id").all(),before,'matching links, links already taken and student posters are untouched');
  db.prepare("DELETE FROM posters WHERE id='upgraded'").run();assert.equal(db.prepare('SELECT COUNT(*) n FROM poster_slug_aliases').get().n,0,'aliases go with their poster');
  db.close();
  assert.ok(read('initialize-database.mjs').includes("'018-moderation-accounts','019-poster-slug-aliases']"));
  assert.ok(read('server.mjs').includes("const posterLink='(id=? OR slug=? OR id=(SELECT posterId FROM poster_slug_aliases WHERE slug=?))';"));
});

test('game counters use the singular, the lobby and leaderboard show names, and a wrong guess clears',()=>{
  assert.ok(games.includes("${s.moves} ${room.game==='draw'?(s.moves===1?'action':'actions'):(s.moves===1?'move':'moves')}"));
  assert.ok(games.includes("action('move',{type:'guess',word}).then(ok=>{if(ok&&input.value===word){input.value='';input.focus();}})"));
  assert.ok(community.includes("<strong>${esc(gameName(r.game))}</strong>"),'not the raw id such as tictactoe');
  assert.ok(community.includes("const gameName=id=>gameCatalog.find(g=>g.id===id)?.name||id;"));
});

test('every notification kind and group type the server creates has a readable label',()=>{
  const server=['server.mjs','community.mjs','messaging.mjs','profiles.mjs'].map(read).join('\n');
  const kinds=new Set([...server.matchAll(/notify\([^,]+,'([a-z]+)'/g)].map(m=>m[1]));
  const labels=JSON.parse(community.match(/const kindLabels=(\{[^}]+\})/)[1].replace(/(\w+):/g,'"$1":').replace(/'/g,'"'));
  assert.ok(kinds.size>=10);for(const kind of kinds)assert.ok(labels[kind],`label for ${kind}`);
  const groups=JSON.parse(community.match(/const groupLabels=(\{[^}]+\})/)[1].replace(/(\w+):/g,'"$1":').replace(/'/g,'"'));
  for(const type of ['manual','event','team'])assert.ok(groups[type],type);
  assert.ok(community.includes("<span>${esc(kindLabels[n.kind]||'Update')}</span> · <time>${date(n.createdAt)}</time>"));
  assert.ok(community.includes("const memberCount=n=>n===1?'1 member':`${n} members`;"));
});

test('confirmations use a translated dialog; no browser confirm remains',async()=>{
  for(const file of readdirSync('public').filter(f=>f.endsWith('.js')))assert.doesNotMatch(read('public/'+file),/(^|[^.\w])confirm\(/,`${file} uses window.confirm`);
  const dom=new JSDOM('<body></body>',{url:'http://localhost/'});globalThis.document=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  try{
    const {confirmAction,blockPrompt}=await import('../public/ui-utils.js');
    let pending=confirmAction(blockPrompt);let d=document.querySelector('dialog');
    assert.equal(d.querySelector('h2').textContent,'Block this student?');assert.ok(d.querySelector('[data-cancel]').hasAttribute('autofocus'),'the safe choice has focus');
    d.querySelector('[data-cancel]').click();assert.equal(await pending,false);assert.equal(document.querySelector('dialog'),null);
    pending=confirmAction({title:'Remove this comment?',message:'It will disappear for everyone. This can’t be undone.',confirm:'Remove comment'});d=document.querySelector('dialog');
    d.querySelector('[data-confirm]').click();assert.equal(await pending,true);
    pending=confirmAction(blockPrompt);document.querySelector('dialog').close();assert.equal(await pending,false,'Escape cancels');
  }finally{delete globalThis.document;dom.window.close();}
});

test('dates follow the interface language, and the test-collection label can be translated',async()=>{
  const dom=new JSDOM('<html lang="zh-CN"><body></body></html>');globalThis.document=dom.window.document;
  try{
    const {dateLocale}=await import('../public/ui-utils.js'),{formatEventDate}=await import('../public/event-utils.js');
    assert.equal(dateLocale(),'zh-CN');assert.match(formatEventDate('2026-11-15'),/11月15日/);
    document.documentElement.lang='en-AU';assert.equal(dateLocale(),'en-AU');assert.equal(formatEventDate('2026-11-15'),'15 Nov');
  }finally{delete globalThis.document;dom.window.close();}
  for(const file of ['app.js','chat.js','messages.js','profile.js','watch.js','community.js','event-utils.js'])assert.doesNotMatch(read('public/'+file),/'en-AU'/,file);
  assert.ok(app.includes('<div class="card-author${p.isTest?\' card-author-test\':\'\'}">'));assert.ok(read('public/i18n.js').includes('.card-author:not(.card-author-test)'));
});

test('every new label is translated in all four catalogues',async()=>{
  const keys=['CampusWall test collection','Your next campus moment starts with a poster.','Invited','Resume','Results','Closed','Join table','Match {0} · {1} moves','Match {0} · {1} move','Match {0} · {1} actions','Match {0} · {1} action','Win','Loss','Draw / shared game','First match','First win','Regular player','Ten wins','New message','Group chat','Event update','Event reminder','Club update','Team update','Screening','Profile note','New comment','Poster invitation','Update','Friends group','Event chat','Team chat','1 member','{0} members','Block this student?','You will not be able to message, call, befriend or invite each other. They will not be told.','Remove this comment?','It will disappear for everyone. This can’t be undone.','Remove comment','Block','Cancel'];
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const key of keys)assert.ok(catalogue[key],`${language}: ${key}`);}
});

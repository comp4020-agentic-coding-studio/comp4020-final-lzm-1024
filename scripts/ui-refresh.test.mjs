import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {blankCanvas,placeholderTexts} from '../public/canvas-model.js';
import {mountGames} from '../public/games.js';

// UI review, 7 November 2026: the wall looked empty, the games used a second
// visual language, decorative slogans crowded useful text and some labels were
// below 11px. These checks keep the fixes in place.
const app=readFileSync('public/app.js','utf8'),gamesCss=readFileSync('public/games.css','utf8'),mobile=readFileSync('public/mobile.css','utf8'),styles=readFileSync('public/styles.css','utf8');
const object=(type,props={})=>({id:crypto.randomUUID(),type,text:'',...props});

test('only an untouched canvas is replaced by a cover made from the event details',()=>{
  assert.equal(blankCanvas({objects:[]}),true,'nothing drawn');
  assert.equal(blankCanvas({objects:[object('text',{text:placeholderTexts[0]}),object('sticky',{text:placeholderTexts[1]})]}),true,'starter text only');
  assert.equal(blankCanvas({objects:[object('text',{text:'Quiz night'})]}),false,'the creator wrote something');
  for(const type of ['rect','ellipse','line','arrow','image','path'])assert.equal(blankCanvas({objects:[object(type)]}),false,type+' is artwork');
  assert.equal(blankCanvas(null),false,'posters without a canvas are unaffected');
  assert.match(app,/if\(p\.canvas&&!blankCanvas\(p\.canvas\)\)return canvasPoster\(p,large\);/);
  const board=readFileSync('public/whiteboard.js','utf8');assert.match(board,/text:placeholderTexts\[0\]/);assert.match(board,/text:placeholderTexts\[1\]/);
  assert.match(app,/if\(blankCanvas\(draft\?\.canvas\)\)toast\('Your artwork was blank, so the wall shows a cover made from your event details\.'\)/,'the creator is told after publishing');
});

test('a quiet week shows recent posters, and the test note appears only beside test posters',()=>{
  const wall=app.slice(app.indexOf('async function wall('),app.indexOf('function login('));
  assert.doesNotMatch(wall,/A campus full of possibilities/);
  assert.match(wall,/\$\('#gallery-note'\)\.hidden=!list\.some\(p=>p\.isTest\)/);
  assert.match(wall,/range==='upcoming'&&!category&&!params\.get\('q'\)&&list\.length<4/);
  assert.match(wall,/\.slice\(-6\)\.reverse\(\)/,'most recent first');
  assert.match(wall,/\$\('#recent-note'\)\.hidden=!recent\.some\(p=>p\.isTest\)/);
  assert.ok(wall.indexOf('id="results"')<wall.indexOf('id="wall-recent"')&&wall.indexOf('id="wall-recent"')<wall.indexOf('id="campus-chat"'));
  const tabs=[...wall.matchAll(/data-date="(\w*)">([^<]+)</g)].map(m=>[m[1],m[2]]),options=[...wall.matchAll(/<option value="(\w*)"(?: selected)?>([^<]+)</g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(options,tabs,'the phone menu offers exactly the date filters');
  assert.match(wall,/\$\('\.date-select'\)\.onchange=e=>pickDate\(e\.target\.value\)/);
  assert.match(styles,/\.date-select\{display:none\}/,'desktop keeps the tabs');
  assert.match(mobile,/\.wall-community-shortcuts\{[^}]*flex-wrap:nowrap;overflow-x:auto/);
});

test('games share the CampusWall style without slogans or the dark arcade layer',async()=>{
  for(const removed of ['#171128','arcade-marquee','arena-ribbon','arena-side-sticker','arena-equalizer','arcade-topline'])assert.ok(!gamesCss.includes(removed),removed);
  assert.match(gamesCss,/\.games-page\.arcade-still/,'effects can still be paused');
  assert.match(gamesCss,/prefers-reduced-motion:reduce/);
  const dom=new JSDOM('<main id="app"></main>',{url:'http://localhost/games'}),previous=new Map(['window','document','localStorage','location','IntersectionObserver','WebSocket'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let mounted;
  try{
    for(const k of ['window','document','localStorage','location'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
    globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.WebSocket=class{close(){}};
    mounted=mountGames(document.querySelector('#app'),{user:null,campus:{shortName:'ANU'},api:async()=>({}),navigate(){},onAuthExpired(){}});
    await new Promise(r=>setTimeout(r,0));
    const text=document.querySelector('#app').textContent;
    for(const slogan of ['PRESS PLAY','MAKE A RIVAL','main-character energy','CHALLENGE ACCEPTED','BATTLE STATION','PLAYER TWO WANTED'])assert.ok(!text.includes(slogan),slogan);
    assert.match(text,/ANU · CAMPUS GAMES/);assert.ok(document.querySelector('.arcade-effects'),'pause control remains');
    assert.equal(document.querySelectorAll('.game-card').length,10);
  }finally{mounted?.destroy();dom.window.close();for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  const games=readFileSync('public/games.js','utf8');
  for(const slogan of ['MISSION BRIEF','GOOD GAME.','GAME DECK','Your challenger era','Back to arcade','ROUND COMPLETE'])assert.ok(!games.includes(slogan),slogan);
});

test('small print stays readable on phones and desktop',()=>{
  assert.match(styles,/\.chat-broadcast-heading,\.chat-broadcast-heading button\{font-size:11px\}footer,footer>span\{font-size:12px\}/);
  const phone=gamesCss.slice(gamesCss.lastIndexOf('@media(max-width:760px){.games-hero-art{display:none}'));
  const readable=phone.match(/\}(\.game-card-tag,[^{]*)\{font-size:12px\}/)?.[1]||'';
  for(const selector of ['.game-card-tag','.game-card-foot','.game-player small','.arena-steps span','.memory-back','.timed-round','.game-copy'])assert.ok(readable.split(',').includes(selector),selector);
  assert.match(gamesCss,/\.game-player \.arena-fighter-label\{white-space:normal/,'turn status is not cut off');
});

test('every new label is translated in each interface language',async()=>{
  const labels=['Recently on campus','{0} · CAMPUS GAMES','Play together,','right on campus.','Ten two-player games in real time. Challenge a campus friend or take an open seat.','A seat is open for you.','Both seats are filled.','Waiting for a second player.','Match status','Your artwork was blank, so the wall shows a cover made from your event details.','All games','How to play','Match feed'];
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of labels)assert.ok(catalogue[label],`${language}: ${label}`);}
});

test('the wall opens with the getting-started guide until it is read or set aside',async()=>{
  const wall=app.slice(app.indexOf('async function wall('),app.indexOf('function login('));
  assert.ok(wall.indexOf('${guideBanner()}')>=0&&wall.indexOf('${guideBanner()}')<wall.indexOf('class="hero wall-hero'),'the banner comes before the headline');
  assert.match(app,/if\(guideSeen\(\)\|\|welcomeCard\(\)\)return '';/,'one introduction at a time, and none after the guide was seen');
  assert.match(app,/<a class="button primary" href="\/guide" data-nav>Read the guide ↗<\/a><button type="button" class="quiet" data-guide-later>Explore first<\/button>/);
  assert.match(app,/if\(path==='\/guide'\)\{markGuideSeen\(\);/,'opening the guide from anywhere counts as reading it');
  assert.match(app,/\[data-guide-later\]'\)\.onclick=\(\)=>\{markGuideSeen\(\);banner\.remove\(\);\$\('\.wall-tagline'\)\?\.insertAdjacentHTML\('beforeend',guideLink\);/,'setting it aside leaves a small link');
  assert.match(app,/const guideSeen=\(\)=>\{try\{return localStorage\.getItem\('campuswall-guide-seen'\)==='1';\}catch\{return false;\}\};/,'storage failures still show the guide');
  assert.match(styles,/\.guide-banner-actions \.button,\.guide-banner-actions button\{[^}]*min-height:44px/);
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of ['NEW HERE?','First time on CampusWall? Start with the guide.','A short tour of what you can do, what needs an account and where to get help. Then explore.','Read the guide','Explore first','Getting started'])assert.ok(catalogue[label],`${language}: ${label}`);}
});

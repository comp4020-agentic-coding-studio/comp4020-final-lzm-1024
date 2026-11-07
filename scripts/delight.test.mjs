import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {greeting,mountDelight} from '../public/delight.js';

// The wall's warm decorative motion must stay optional, quiet for assistive
// technology, pausable and tied to real results.
const css=readFileSync('public/delight.css','utf8'),app=readFileSync('public/app.js','utf8');
const wall=`<main id="app"><section class="guide-banner"><span class="guide-banner-mark" aria-hidden="true">✳</span></section><section class="hero wall-hero"><div><span class="eyebrow">THE ANU NOTICEBOARD</span><h1>Your campus</h1></div><p class="wall-tagline"><a href="#campus-chat">Join the campus chat ↓</a></p></section><section class="wall-controls"><button data-category="Social">Social</button></section><span id="count">3</span><button data-save="p1">Save</button></main>`;

async function withWall({reduce=false,stored=null}={},run){
  const dom=new JSDOM(wall,{url:'http://localhost/anu',pretendToBeVisual:true});
  const keys=['window','document','localStorage','matchMedia','IntersectionObserver','MutationObserver','PointerEvent'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let delight;
  try{
    for(const k of ['window','document','localStorage','MutationObserver'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
    if(stored)localStorage.setItem('campuswall:arcade-effects',stored);
    globalThis.matchMedia=()=>({matches:reduce,addEventListener(){},removeEventListener(){}});
    globalThis.IntersectionObserver=class{observe(){}disconnect(){}};
    delight=mountDelight(document.querySelector('#app'));
    await run(delight,document.querySelector('#app'),dom.window);
  }finally{delight?.destroy();dom.window.close();for(const [key,value] of previous)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}

test('the greeting follows the visitor\'s time of day',()=>{
  assert.equal(greeting(8)[1],'Good morning! Lovely to see you.');
  assert.equal(greeting(14)[1],'Good afternoon! Lovely to see you.');
  assert.equal(greeting(21)[1],'Good evening! Lovely to see you.');assert.equal(greeting(2)[1],'Good evening! Lovely to see you.');
});

test('decorations are hidden from assistive technology and never take input',async()=>{
  await withWall({},async(delight,root)=>{
    assert.match(root.querySelector('.delight-greeting').textContent,/Lovely to see you\./);
    for(const selector of ['.delight-sky','.delight-parade','.delight-greeting-icon','.delight-mascot'])assert.equal(root.querySelector(selector).getAttribute('aria-hidden'),'true',selector);
    assert.equal(root.querySelectorAll('.delight-sky span').length,14);
    assert.ok(root.classList.contains('delight-on'));
  });
  for(const selector of ['.delight-sky{','.delight-parade{','.delight-particle{'])assert.match(css.slice(css.indexOf(selector)).split('}')[0],/pointer-events:none/,selector);
});

test('one shared Effects control pauses everything and is remembered',async()=>{
  await withWall({},async(delight,root)=>{
    const toggle=root.querySelector('.delight-toggle');assert.equal(toggle.textContent,'✦ Effects on · Pause');
    toggle.click();
    assert.equal(localStorage.getItem('campuswall:arcade-effects'),'off','same preference as the games');
    assert.ok(root.classList.contains('delight-still'));assert.equal(toggle.getAttribute('aria-pressed'),'false');
    delight.celebrate(root.querySelector('[data-save]'));assert.equal(document.querySelectorAll('.delight-particle').length,0,'no celebration while paused');
  });
  await withWall({stored:'off'},async(delight,root)=>{assert.ok(root.classList.contains('delight-still'));assert.equal(root.querySelector('.delight-toggle').textContent,'✧ Effects paused · Play');});
});

test('reduced-motion visitors get no movement and no needless control',async()=>{
  await withWall({reduce:true},async(delight,root)=>{
    assert.ok(root.classList.contains('delight-still'));assert.equal(root.querySelector('.delight-toggle').hidden,true);
    delight.celebrate(root.querySelector('[data-save]'));assert.equal(document.querySelectorAll('.delight-particle').length,0);
  });
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.delight-sky,\.delight-parade,\.delight-particle\{display:none!important\}\.delight-on \*,\.delight-on \*::before,\.delight-on \*::after\{animation:none!important;transition:none!important\}\}/);
  assert.match(css,/\.delight-paused :is\([^)]*\.delight-sky span[^)]*\)\{animation-play-state:paused!important\}/,'off-screen and background tabs pause');
});

test('celebrations are bounded, clean themselves up and follow a confirmed save',async()=>{
  await withWall({},async(delight,root)=>{
    for(let i=0;i<10;i++)delight.celebrate(root.querySelector('[data-save]'));
    const count=document.querySelectorAll('.delight-particle').length;assert.ok(count>0&&count<=40,`bounded: ${count}`);
    delight.destroy();assert.equal(document.querySelectorAll('.delight-particle').length,0);assert.ok(!root.classList.contains('delight-on'));
  });
  assert.match(app,/const result=await api\(`\/api\/posters\/\$\{posterId\}\/save`[\s\S]{0,700}if\(result\.isSaved\)wallDelight\?\.celebrate\(button\);/,'hearts only after the server accepts the save');
  assert.match(app,/Promise\.all\(\[import\('\.\/delight\.js'\),loadStylesheet\('\/delight\.css'\)\]\)/,'loaded only for the wall');
  assert.match(app,/wallDelight\?\.destroy\(\);wallDelight=null;/);
});

test('motion is slow and never flashes',()=>{
  const durations=[...css.matchAll(/animation:delight-[a-z]+ ([\d.]+)s/g)].map(m=>Number(m[1]));
  assert.ok(durations.length>10&&durations.every(d=>d>=.4),'no animation faster than 0.4 s: '+durations);
  assert.doesNotMatch(css,/@keyframes delight-[a-z]+\{[^}]*(?:filter:brightness|background-color)/,'no light/dark flashing');
});

test('every new greeting is translated',async()=>{
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of ['Good morning! Lovely to see you.','Good afternoon! Lovely to see you.','Good evening! Lovely to see you.','Hi there!','Effects on · Pause','Effects paused · Play'])assert.ok(catalogue[label],`${language}: ${label}`);}
});

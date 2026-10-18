import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {installAppearance,mountAppearancePicker,setAppearance} from '../public/appearance.js';

test('appearance follows system changes, remembers explicit choices and survives header remounts',()=>{
  const dom=new JSDOM('<head><meta name="theme-color"></head><body><header id="header"><nav></nav></header><main><textarea>Unchanged draft</textarea><div class="poster" style="background:#ffffff;color:#000000">Original design</div></main></body>',{url:'https://campus.example'});
  const keys=['window','document','localStorage'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let dark=true,listener,destroy;
  const media={get matches(){return dark;},addEventListener(_,fn){listener=fn;},removeEventListener(_,fn){assert.equal(fn,listener);listener=null;}};
  try{
    for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});window.matchMedia=()=>media;
    destroy=installAppearance();assert.equal(document.documentElement.dataset.theme,'dark');
    const input=document.querySelector('textarea');input.focus();input.setSelectionRange(2,4);
    setAppearance('light');assert.equal(document.documentElement.dataset.theme,'light');assert.equal(localStorage.getItem('campuswall-appearance'),'light');
    dark=false;listener();dark=true;listener();assert.equal(document.documentElement.dataset.theme,'light');
    setAppearance('system');assert.equal(document.documentElement.dataset.theme,'dark');dark=false;listener();assert.equal(document.documentElement.dataset.theme,'light');
    setAppearance('dark');assert.equal(document.documentElement.style.colorScheme,'dark');assert.equal(document.querySelector('meta').content,'#14181d');
    assert.equal(document.activeElement,input);assert.equal(input.value,'Unchanged draft');assert.equal(input.selectionStart,2);assert.equal(document.querySelector('.poster').style.background,'rgb(255, 255, 255)');
    document.querySelector('nav').innerHTML='';mountAppearancePicker();mountAppearancePicker();assert.equal(document.querySelectorAll('.appearance-picker').length,1);assert.equal(document.querySelector('select').value,'dark');
    window.dispatchEvent(new window.StorageEvent('storage',{key:'campuswall-appearance',newValue:'light'}));assert.equal(document.documentElement.dataset.theme,'light');assert.equal(document.querySelector('select').value,'light');
    window.dispatchEvent(new window.StorageEvent('storage',{key:null}));assert.equal(document.querySelector('select').value,'system');
    const select=document.querySelector('select');select.value='dark';select.dispatchEvent(new window.Event('change'));assert.equal(document.documentElement.dataset.theme,'dark');
    destroy();destroy=null;assert.equal(listener,null);destroy=installAppearance();assert.equal(document.documentElement.dataset.theme,'dark','Reloading uses the saved explicit preference');
  }finally{destroy?.();dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

test('first paint honours stored and system preferences even when storage is blocked',()=>{
  const source=readFileSync('public/theme-init.js','utf8'),html=readFileSync('public/index.html','utf8');
  assert(html.indexOf('/theme-init.js')<html.indexOf('/styles.css'));
  for(const [saved,system,expected] of [['dark',false,'dark'],['light',true,'light'],['system',true,'dark'],['invalid',false,'light'],[null,true,'dark']]){
    const dom=new JSDOM('<meta name="theme-color">',{url:'https://campus.example',runScripts:'outside-only'});
    dom.window.matchMedia=()=>({matches:system});if(saved)dom.window.localStorage.setItem('campuswall-appearance',saved);
    dom.window.eval(source);assert.equal(dom.window.document.documentElement.dataset.theme,expected);dom.window.close();
  }
  const dom=new JSDOM('<meta name="theme-color">',{runScripts:'outside-only'});dom.window.matchMedia=()=>({matches:true});dom.window.eval(source);assert.equal(dom.window.document.documentElement.dataset.theme,'dark');dom.window.close();
});


test('theme boot script, app module and stylesheet are served as real assets',async()=>{
  const {createPublicAssets}=await import('../public-assets.mjs'),assets=createPublicAssets();
  for(const file of ['theme-init.js','appearance.js','appearance.css']){
    let status,headers,body;const response={writeHead(code,value){status=code;headers=value;},end(value){body=value;}};
    assert.equal(await assets.serve({method:'GET',headers:{}},response,'/'+file),true);
    assert.equal(status,200);assert.match(headers['content-type'],file.endsWith('.css')?/^text\/css/:/^text\/javascript/);assert.equal(body.toString(),readFileSync('public/'+file,'utf8'));
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {languages,setLanguage,translate,installLanguage,currentLanguage} from '../public/i18n.js';
import {addMessageTranslation} from '../public/message-translation.js';
import {createTranslator,translationChunks} from '../translation.mjs';

test('five catalogues have matching keys, rules and core page controls',async()=>{
  const catalogues=await Promise.all(['zh-CN','es','fr','ja'].map(id=>import('../public/locales/'+id+'.js').then(x=>x.default)));
  const keys=Object.keys(catalogues[0]).sort();assert(keys.length>=750);
  for(const catalogue of catalogues){assert.deepEqual(Object.keys(catalogue).sort(),keys);for(const [key,value] of Object.entries(catalogue)){assert(value.trim());assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort(),[...value.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort());}}
  for(const [id] of languages){await setLanguage(id);for(const key of ['Games','Messages','Create poster','Canvas size & background','Voice call','Video quality','Translate to English'])assert.equal(translate(key),id==='en'?key:catalogues[languages.findIndex(([language])=>language===id)-1][key]);}
  await setLanguage('en');
});

test('global language switch is reversible, persists and protects drafts and message originals',async()=>{
  const dom=new JSDOM('<header id="header"><nav><a>Games</a></nav></header><main><h1>Messages</h1><textarea placeholder="Your introduction">My unchanged draft</textarea><p translate="no">Games</p><div class="chat-message-meta"><strong>Messages</strong></div><button>Voice call Alice</button></main>',{url:'http://localhost'});
  const keys=['window','document','MutationObserver','CustomEvent','localStorage'];
  const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let destroyLanguage;
  try{
    for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
    destroyLanguage=installLanguage();await new Promise(r=>setTimeout(r,0));
    const field=document.querySelector('textarea');field.focus();field.setSelectionRange(2,5);
    await setLanguage('zh-CN');assert.equal(document.documentElement.lang,'zh-CN');assert.equal(currentLanguage(),'zh-CN');assert.equal(localStorage.getItem('campuswall-language'),'zh-CN');
    assert.equal(document.querySelector('h1').textContent,translate('Messages'));assert.notEqual(field.placeholder,'Your introduction');
    assert.equal(field.value,'My unchanged draft');assert.equal(document.activeElement,field);assert.equal(field.selectionStart,2);
    assert.equal(document.querySelector('main [translate=no]').textContent,'Games');assert.equal(document.querySelector('strong').textContent,'Messages');
    assert.match(document.querySelector('button').textContent,/Alice/);
    const newButton=document.createElement('button');newButton.textContent='Video call';document.querySelector('main').append(newButton);
    await new Promise(r=>setTimeout(r,0));assert.equal(newButton.textContent,translate('Video call'));
    for(const [language] of languages){await setLanguage(language);assert.equal(document.querySelector('h1').textContent,translate('Messages'));}
    await setLanguage('en');assert.equal(document.querySelector('h1').textContent,'Messages');assert.equal(field.placeholder,'Your introduction');
    document.querySelector('#header nav').innerHTML='<a>Games</a>';await new Promise(r=>setTimeout(r,0));assert(document.querySelector('.language-picker select'));assert.equal(document.querySelectorAll('.language-picker').length,1);
  }finally{await setLanguage('en');destroyLanguage?.();dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

test('message translation is explicit, sends IDs not text and renders provider HTML as plain text',async()=>{
  const dom=new JSDOM('<article><div><strong>Alice</strong></div><p>Original private message</p></article>',{url:'http://localhost'});
  const keys=['document','fetch'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let requests=0,payload;
  try{
    Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true});
    Object.defineProperty(globalThis,'fetch',{value:async(_url,options)=>{requests++;payload=JSON.parse(options.body);return Response.json({translatedText:'&lt;img src=x onerror=alert(1)&gt; Hello'});},configurable:true});
    const article=document.querySelector('article');addMessageTranslation(article,{channel:'private',messageId:'message-id'});
    assert.equal(requests,0);article.querySelector('.translate-message').click();await new Promise(r=>setTimeout(r,0));
    assert.equal(requests,1);assert.deepEqual(payload,{channel:'private',messageId:'message-id',source:'autodetect'});
    assert.equal(article.querySelector(':scope > p').textContent,'Original private message');assert.equal(article.querySelector('img'),null);assert.match(article.querySelector('.translation-result').textContent,/<img/);
    article.querySelector('.translate-message').click();assert.equal(article.querySelector('.translation-result').hidden,true);
    article.querySelector('.translate-message').click();assert.equal(requests,1);
  }finally{dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

test('provider chunking preserves Unicode, errors stay generic and rate limits are bounded',async()=>{
  const original='\u4f60\u597d🙂 '.repeat(250),chunks=translationChunks(original);assert.equal(chunks.join(''),original);assert(chunks.every(x=>Buffer.byteLength(x)<=480));
  let calls=0;const translate=createTranslator({now:()=>60000,fetchImpl:async url=>{calls++;assert.equal(url.hostname,'api.mymemory.translated.net');assert.equal(url.searchParams.get('langpair'),'autodetect|en');return Response.json({responseStatus:200,responseData:{translatedText:'English'}});}});
  for(let n=0;n<10;n++)assert.equal((await translate('Synthetic message','autodetect','alice')).target,'en');
  await assert.rejects(translate('Synthetic message','autodetect','alice'),e=>e.status===429);assert.equal(calls,10);
  const fail=createTranslator({fetchImpl:async()=>Response.json({responseStatus:403,responseDetails:'PRIVATE PROVIDER DETAIL'})});
  await assert.rejects(fail('Synthetic message','es','bob'),e=>e.status===503&&!e.message.includes('PRIVATE'));
});


test('localisation preserves category values, unknown object keys and literal user names',async()=>{
  const dom=new JSDOM('<main><select name="category"><option>Sport</option><option>Social</option></select></main>',{url:'http://localhost'});
  const keys=['window','document','CustomEvent','localStorage'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
    for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
    const select=document.querySelector('select');select.value='Social';
    for(const [language] of languages){await setLanguage(language);assert.equal(select.value,'Social');assert.deepEqual([...select.options].map(o=>o.value),['Sport','Social']);}
    await setLanguage('es');assert.notEqual(select.options[0].textContent,'Sport');
    assert.equal(translate('toString'),'toString');assert.equal(translate('__proto__'),'__proto__');
    for(const name of ['$&',"$'",'$'+String.fromCharCode(96)])assert.equal(translate('Voice call '+name),translate('Voice call Alice').replace('Alice',()=>name));
  }finally{await setLanguage('en');dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

test('new group messages retain existing translation results, focus and message order',async()=>{
  const dom=new JSDOM('<main id="app"></main>',{url:'http://localhost/community/groups/group-1',pretendToBeVisual:true});
  const keys=['window','document','location','CustomEvent','Event'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let view,rows=[{id:'first',seq:2,authorId:'alice',author:'Alice',body:'Hola',createdAt:new Date().toISOString()}];
  const errors=[];
  try{
    for(const key of keys)Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
    const {mountCommunity}=await import('../public/community.js');
    view=mountCommunity(document.querySelector('main'),{user:{id:'alice'},campus:{id:'anu',name:'ANU'},path:'/community/groups/group-1',navigate(){},toast:v=>errors.push(v),api:async url=>{
      if(url.endsWith('/messages'))return {messages:rows};
      if(url.endsWith('/read'))return {};
      if(url.endsWith('/groups/group-1'))return {group:{id:'group-1',name:'Friends',members:[{id:'alice',name:'Alice'}],ownerId:'alice'}};
      throw Error('Unexpected URL '+url);
    }});
    await new Promise(r=>setTimeout(r,30));
    const article=document.querySelector('.group-bubble');assert(article);
    const result=article.querySelector('.translation-result');result.textContent='Hello';result.hidden=false;
    const button=article.querySelector('.translate-message');button.focus();
    rows=[{...rows[0],id:'older',seq:1},...rows,{...rows[0],id:'last',seq:3}];
    window.dispatchEvent(new CustomEvent('campus:community',{detail:{type:'group:changed',groupId:'group-1'}}));
    await new Promise(r=>setTimeout(r,160));
    assert.deepEqual([...document.querySelectorAll('.group-bubble')].map(a=>a.dataset.messageId),['older','first','last']);
    assert.equal(document.querySelector('[data-message-id="first"]'),article);assert.equal(result.textContent,'Hello');assert.equal(result.hidden,false);assert.equal(document.activeElement,button);assert.deepEqual(errors,[]);
  }finally{view?.destroy();dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});

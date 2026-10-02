import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionMount} from '../public/ui-utils.js';
import {campusToday,formatEventDate,formatCampusDateTime,campusDateParts} from '../public/event-utils.js';
import {readFileSync} from 'node:fs';
import {canvasPoster} from '../public/canvas-model.js';

test('lazy account services do not load for guests or resurrect a signed-out session',async()=>{
  let loads=0,resolve;const mounted=[];
  const sync=createSessionMount(()=>{loads++;return new Promise(done=>resolve=done);});
  await sync({user:null});assert.equal(loads,0);
  const pending=sync({user:{id:'alice'}});await Promise.resolve();
  await sync({user:null});resolve(options=>mounted.push(options.user?.id||null));await pending;
  assert.deepEqual(mounted,[]);
  await sync({user:{id:'bob'}});assert.deepEqual(mounted,['bob']);assert.equal(loads,1);
  const logout=sync({user:null});assert.deepEqual(mounted,['bob',null]);await logout;
});
test('a shared pending import mounts only the latest account and failed imports can retry',async()=>{
  let loads=0,resolve;const mounted=[];
  const sync=createSessionMount(()=>{loads++;return new Promise(done=>resolve=done);});
  const first=sync({user:{id:'alice'}}),second=sync({user:{id:'bob'}});await Promise.resolve();
  resolve(options=>mounted.push(options.user.id));await Promise.all([first,second]);
  assert.deepEqual(mounted,['bob']);assert.equal(loads,1);
  let attempts=0;
  const retry=createSessionMount(async()=>{if(++attempts===1)throw Error('Temporary import failure');return options=>mounted.push(options.user.id);});
  await assert.rejects(retry({user:{id:'alice'}}),/Temporary import failure/);
  await retry({user:{id:'alice'}});assert.equal(attempts,2);assert.equal(mounted.at(-1),'alice');
});
test('reused date formatters preserve midnight, DST, local displays and invalid-date behaviour',()=>{
  const zones=['Australia/Sydney','Australia/Melbourne','Australia/Canberra','Australia/Brisbane','Australia/Perth','Australia/Adelaide'];
  const times=['2026-10-03T13:29:59Z','2026-10-03T14:00:00Z','2026-10-03T15:59:59Z','2026-10-03T16:00:00Z','2027-04-03T15:59:59Z','2027-04-03T16:00:00Z'];
  for(const zone of zones)for(const time of times){
    const value=new Date(time);
    assert.equal(campusToday(value,zone),value.toLocaleDateString('en-CA',{timeZone:zone}));
    assert.equal(formatCampusDateTime(time,zone),new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(value));
    assert.deepEqual(campusDateParts(time,zone),new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value));
  }
  for(const date of ['2026-10-03','2027-04-04','',null,'not-a-date'])assert.equal(formatEventDate(date),date?new Date(`${date}T12:00:00`).toLocaleDateString('en-AU',{day:'numeric',month:'short'}):'Date to come');
  assert.equal(campusToday(new Date('invalid')),'Invalid Date');
  assert.throws(()=>campusToday(new Date(),'Invalid/Zone'),RangeError);
  assert.notEqual(campusToday(new Date('2026-10-03T00:00:00Z')),campusToday(new Date('2026-10-04T00:00:00Z')));
});

test('published canvas artwork keeps its layout without loading editor-only styles',async()=>{
  const {JSDOM}=await import('jsdom');
  const artwork=canvasPoster({title:'Published artwork',canvas:{width:900,height:1200,background:'#ffffff',objects:[]}});
  const dom=new JSDOM(`<style>.poster{display:flex;padding:28px;background:red}</style><style>${readFileSync('public/poster-design.css','utf8')}</style>${artwork}`);
  try{
    const wrapper=dom.window.document.querySelector('.canvas-poster'),svg=wrapper.querySelector('svg');
    const display=dom.window.getComputedStyle(wrapper),size=dom.window.getComputedStyle(svg);
    assert.equal(display.display,'block');assert.equal(display.padding,'0px');assert.equal(display.backgroundColor,'rgba(0, 0, 0, 0)');
    assert.equal(size.width,'100%');assert.equal(size.height,'100%');assert.equal(svg.getAttribute('viewBox'),'0 0 900 1200');
  }finally{dom.window.close();}
});

test('rapid wall filters cancel stale fetches and leaving the wall clears delayed search work',async()=>{
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('<header id="header"></header><main id="app"></main><div id="toast"></div>',{url:'http://localhost/anu',pretendToBeVisual:true});
  const keys=['window','document','Element','MutationObserver','matchMedia','requestAnimationFrame','localStorage','location','history','WebSocket','CustomEvent','fetch'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const requests=[];let defer=false;
  try{
    for(const key of ['window','document','Element','MutationObserver','localStorage','location','history','CustomEvent'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?dom.window:dom.window[key]});
    globalThis.matchMedia=dom.window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);dom.window.scrollTo=()=>{};
    globalThis.WebSocket=class {static OPEN=1;readyState=0;close(){}send(){}};
    globalThis.fetch=async(path,options={})=>{
      const url=String(path);
      if(url==='/api/universities')return Response.json([{id:'anu',slug:'anu',name:'Australian National University',shortName:'ANU',style:'campus-anu',paletteLabel:'ANU',timeZone:'Australia/Sydney',emailDomains:['anu.edu.au']}]);
      if(url==='/api/auth/me')return Response.json({user:null});
      if(url.startsWith('/api/chat/messages'))return Response.json({messages:[],universityId:'anu'});
      if(url.startsWith('/api/posters?')){
        if(!defer)return Response.json([]);
        return new Promise((resolve,reject)=>{
          requests.push({url,signal:options.signal,resolve});
          options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
        });
      }
      throw Error('Unexpected request '+url);
    };
    await import('../public/app.js?wall-cancellation-check');
    defer=true;
    const button=name=>[...document.querySelectorAll('[data-category]')].find(node=>node.textContent===name);
    assert.ok(button('Social'),document.body.textContent);
    button('Social').click();button('Arts').click();
    assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true);
    assert.equal(requests[1].signal.aborted,false);assert.match(requests[1].url,/category=Arts/);
    requests[1].resolve(Response.json([]));await new Promise(done=>setTimeout(done,0));
    const search=document.querySelector('#search');search.value='cancel this search';search.dispatchEvent(new dom.window.Event('input'));
    document.querySelector('a[href="/login"]').click();await new Promise(done=>setTimeout(done,240));
    assert.equal(location.pathname,'/login');assert.equal(requests.length,2);assert.equal(requests[1].signal.aborted,true);
    assert.ok(document.querySelector('form'));
  }finally{
    dom.window.close();
    for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});

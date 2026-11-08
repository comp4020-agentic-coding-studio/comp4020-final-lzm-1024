import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The early requests only help if the wall asks for exactly the same address.
function run(pathname,campuses={anu:'Australia/Sydney'},fail=false){
  const requested=[],window={},context={window,location:{pathname},URLSearchParams,Intl,Date,JSON,Object,
    document:{querySelector:()=>({content:JSON.stringify(campuses)})},
    fetch:path=>{requested.push(path);return fail?Promise.reject(new Error('offline')):Promise.resolve({ok:true,path});}};
  vm.runInNewContext(readFileSync('public/early.js','utf8'),context);
  return {requested,started:window.__campusEarly};
}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(new Date());
const wall=`/api/posters?university=anu&category=&q=&from=${today}`;

test('the wall page starts the same poster request the wall makes first',()=>{
  assert.deepEqual(run('/anu').requested,['/api/universities','/api/auth/me',wall]);
  assert.deepEqual(run('/').requested,['/api/universities','/api/auth/me',wall],'one open campus: the home page is its wall');
  const app=readFileSync('public/app.js','utf8');
  assert.match(app,/let category='',range='upcoming'/,'the wall still opens on upcoming posters');
  assert.match(app,/new URLSearchParams\(\{university:uni\.id,category,q:\$\('#search'\)\?\.value\|\|''\}\)/,'with the same parameter order');
  assert.match(app,/if\(range==='past'\)params\.set\('to',[^;]*;else params\.set\('from',today\(\)\)/,'and today as the start date');
});
test('other pages and closed campuses start no poster request',()=>{
  for(const path of ['/games','/messages','/usyd','/anu/clubs','/anu/posters/some-event'])assert.deepEqual(run(path).requested,['/api/universities','/api/auth/me'],path);
  assert.deepEqual(run('/',{anu:'Australia/Sydney',usyd:'Australia/Sydney'}).requested,['/api/universities','/api/auth/me'],'with several campuses the home page is not a wall');
});
test('a failed early request is left for the normal request and its error handling',async()=>{
  assert.equal(await run('/anu',undefined,true).started['/api/auth/me'],null);
  const app=readFileSync('public/app.js','utf8');
  assert.ok(app.includes("const started=method==='GET'&&early[path];delete early[path];try{response=started&&await started||await fetch(path,{"),'used once, GET only, with a fallback');
  assert.ok(app.includes('afterRoute({focus:false});early={};'),'unused responses are dropped after the first page');
});

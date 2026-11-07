import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// Sign-in throttling at its consequential boundaries: distinct visitors behind the
// Fly proxy, one account under attack, and a local server that must ignore a
// client-chosen Fly-Client-IP header. Disposable databases only.
const root=resolve('.test-data'),password='preview-only-password';
async function server(port,fly){
  mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'auth-limits-')),base='http://127.0.0.1:'+port,env={...process.env,PORT:String(port),DATA_DIR:dir};
  delete env.FLY_APP_NAME;if(fly)env.FLY_APP_NAME='auth-limits-test';
  const child=spawn(process.execPath,['server.mjs'],{env,stdio:'pipe'});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
  const call=async(path,body,ip)=>(await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(ip?{'fly-client-ip':ip}:{})},body:JSON.stringify(body)})).status;
  return {call,login:(email,pass,ip)=>call('/api/auth/login',{email,password:pass},ip),register:(name,ip)=>call('/api/auth/register',{name,username:name,email:name+'@example.com',universityId:'anu',password},ip),
    async close(){const done=once(child,'exit');child.kill();await done;assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}};
}

test('sign-in limits separate visitors and protect each account',{timeout:30000},async t=>{
  const s=await server(18141,true);
  try{
    assert.equal(await s.register('limit_alex','203.0.113.10'),200);assert.equal(await s.register('limit_riley','203.0.113.11'),200);
    await t.test('one visitor exhausting its budget does not lock out another visitor',async()=>{
      for(let i=0;i<30;i++)assert.equal(await s.login('nobody'+i+'@example.com','wrong-password','198.51.100.1'),401);
      assert.equal(await s.login('limit_riley@example.com',password,'198.51.100.1'),429,'the noisy visitor is throttled');
      assert.equal(await s.login('limit_riley@example.com',password,'198.51.100.2'),200,'another visitor still signs in');
    });
    await t.test('repeated wrong passwords lock that account even across addresses',async()=>{
      for(let i=0;i<10;i++)assert.equal(await s.login('limit_alex@example.com','wrong-password','192.0.2.'+i),401);
      assert.equal(await s.login('limit_alex@example.com',password,'192.0.2.50'),429,'correct password is refused while locked');
      assert.equal(await s.login('limit_riley@example.com',password,'192.0.2.50'),200,'other accounts are unaffected');
    });
    await t.test('unknown emails lock the same way, so lockout does not reveal accounts',async()=>{
      for(let i=0;i<10;i++)assert.equal(await s.login('ghost@example.com','wrong-password','192.0.2.'+(100+i)),401);
      assert.equal(await s.login('ghost@example.com','wrong-password','192.0.2.120'),429);
    });
    await t.test('a successful sign-in clears earlier failures for that account',async()=>{
      for(let i=0;i<9;i++)assert.equal(await s.login('limit_riley@example.com','wrong-password','192.0.2.'+(130+i)),401);
      assert.equal(await s.login('limit_riley@example.com',password,'192.0.2.140'),200);
      for(let i=0;i<9;i++)assert.equal(await s.login('limit_riley@example.com','wrong-password','192.0.2.'+(150+i)),401);
      assert.equal(await s.login('limit_riley@example.com',password,'192.0.2.160'),200);
    });
  }finally{await s.close();}
});

test('outside Fly a client-supplied Fly-Client-IP header cannot pick a fresh budget',{timeout:30000},async()=>{
  const s=await server(18142,false);
  try{
    for(let i=0;i<30;i++)assert.equal(await s.login('nobody'+i+'@example.com','wrong-password','203.0.113.'+i),401);
    assert.equal(await s.login('nobody@example.com','wrong-password','203.0.113.99'),429);
  }finally{await s.close();}
});

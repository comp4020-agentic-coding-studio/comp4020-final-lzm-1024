import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';

// Old poster links keep working, a missing poster page is a real 404, and a malformed
// friend request is refused instead of crashing (found in the two-person test round).
test('poster link aliases, 404 poster pages and friend requests without an id',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'test-round-')),port=18163,base=`http://127.0.0.1:${port}`;let child;
  const req=async(path,method='GET',body,u)=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_BACKUPS:'off',PUBLIC_BASE_URL:'https://campuswall.example.test'},stdio:'pipe'});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
    const sample=(await req('/api/posters?university=anu')).data.find(p=>p.isTest);
    await t.test('fresh test notices already use their own link',()=>{assert.equal(sample.slug,sample.photoPoster.seedKey);});
    const db=new DatabaseSync(join(dir,'campuswall.sqlite'));
    db.prepare('INSERT INTO poster_slug_aliases (slug,posterId,createdAt) VALUES (?,?,?)').run('photography-walk-anu',sample.id,new Date().toISOString());db.close();
    await t.test('an old link still opens the poster and previews its current link',async()=>{
      const api=await req('/api/posters/photography-walk-anu');assert.equal(api.status,200);assert.equal(api.data.id,sample.id);assert.equal(api.data.slug,sample.slug);
      const page=await req('/anu/posters/photography-walk-anu');assert.equal(page.status,200);
      assert.ok(page.data.includes(`<meta property="og:url" content="https://campuswall.example.test/anu/posters/${sample.slug}">`),'the preview names the current link');
      assert.equal((await req(`/api/posters/photography-walk-anu/calendar`)).status,200,'sub-resources follow the alias too');
    });
    await t.test('a poster page that does not exist answers 404 but still serves the app',async()=>{
      const page=await req('/anu/posters/no-such-poster');assert.equal(page.status,404);assert.match(page.data,/<script type="module" src="\/app\.js\?v=[a-f0-9]{12}"><\/script>/);
      assert.equal((await req('/anu')).status,200,'other pages are unchanged');
    });
    await t.test('a friend request without an id is refused, not a server error',async()=>{
      const r=await req('/api/auth/register','POST',{name:'Round Tester',username:'round_tester',email:'round@example.test',password:'disposable-test-password',universityId:'anu'});
      const u={cookie:r.cookie};
      for(const path of ['/api/community/friends','/api/community/friends/'])assert.equal((await req(path,'POST',{},u)).status,404,path);
      assert.equal((await req('/api/community/friends/not-a-real-id','POST',{},u)).status,404);
    });
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

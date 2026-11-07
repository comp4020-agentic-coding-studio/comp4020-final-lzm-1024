import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// A creator deletes a published poster straight from the wall, with no unpublish first.
// Collaborators and other students cannot delete it, and nothing of it stays public.
test('only the creator deletes a published poster, and it leaves the wall at once',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'poster-delete-')),port=18151,base=`http://127.0.0.1:${port}`;let child;
  const req=async(path,method='GET',body,u)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(u?{cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const reg=async name=>{const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.test',password:'disposable-test-password',universityId:'anu'});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};};
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  try{
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
    const creator=await reg('delete_creator'),helper=await reg('delete_helper'),student=await reg('delete_student');
    let p=(await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title:'Poster to delete'},creator)).data;
    for(const [field,value] of Object.entries({date:future,time:'18:00',location:'Kambri'})){const r=await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},creator);assert.equal(r.status,200,JSON.stringify(r.data));p=r.data;}
    assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',null,creator)).status,200);
    assert.equal((await req(`/api/drafts/${p.id}/collaborators`,'POST',{userId:helper.id},creator)).status,201);
    assert.equal((await req(`/api/posters/${p.id}/comments`,'POST',{body:'See you there'},student)).status,201);
    assert.equal((await req(`/api/posters/${p.id}/save`,'POST',null,student)).status,200);
    await t.test('a collaborator or another student cannot delete it',async()=>{
      for(const u of [helper,student])assert.equal((await req(`/api/drafts/${p.id}`,'DELETE',null,u)).status,403);
      assert.equal((await req(`/api/drafts/${p.id}`,'DELETE')).status,401);
      assert.equal((await req(`/api/posters/${p.id}`)).status,200,'still public after refused deletes');
    });
    await t.test('the creator deletes the published poster directly',async()=>{
      assert.equal((await req(`/api/drafts/${p.id}`,'DELETE',null,creator)).status,200);
      assert.equal((await req(`/api/posters/${p.id}`)).status,404);
      assert.ok(!(await req('/api/posters?university=anu')).data.some(x=>x.id===p.id),'gone from the wall');
      assert.equal((await req('/api/saved','GET',null,student)).data.length,0,'gone from saved events');
      assert.equal((await req('/api/drafts','GET',null,helper)).data.length,0,'gone from the collaborator’s posters');
      assert.equal((await req(`/api/drafts/${p.id}`,'DELETE',null,creator)).status,404,'a repeated delete changes nothing');
    });
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

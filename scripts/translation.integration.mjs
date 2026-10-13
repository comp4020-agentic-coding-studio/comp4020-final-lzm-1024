import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';

test('translation enforces message membership, campus and revocation without logging text',{timeout:20000},async()=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'translation-')),counter=join(dir,'provider-count'),hook=join(dir,'provider-fixture.mjs');
  writeFileSync(counter,'0');
  writeFileSync(hook,`import fs from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(new URL(url).hostname!=='api.mymemory.translated.net')return original(url,options);const file=${JSON.stringify(counter)};fs.writeFileSync(file,String(Number(fs.readFileSync(file,'utf8'))+1));if(new URL(url).searchParams.get('q')==='Synthetic delayed message')await new Promise(r=>setTimeout(r,350));return Response.json({responseStatus:200,responseData:{translatedText:'Synthetic English translation'}});};`);
  const base='http://127.0.0.1:18135',child=spawn(process.execPath,['--import',pathToFileURL(hook).href,'server.mjs'],{env:{...process.env,PORT:'18135',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let logs='',errors='',db;
  child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>errors+=x);
  try{
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,40));}assert(ready,errors);
    db=new DatabaseSync(join(dir,'campuswall.sqlite'));db.exec('PRAGMA foreign_keys=ON');
    const ids={},cookies={},stamp=new Date().toISOString();
    for(const [name,campus] of [['alice','anu'],['bob','anu'],['stranger','anu'],['foreign','usyd']]){
      ids[name]=randomUUID();const token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');cookies[name]='campus_session='+token;
      db.prepare('INSERT INTO users(id,name,email,passwordHash,createdAt,username,universityId) VALUES (?,?,?,?,?,?,?)').run(ids[name],name,name+'@example.com','fixture',stamp,name,campus);
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),ids[name],Date.now()+60000);
    }
    const conversation=randomUUID(),message=randomUUID(),publicId=randomUUID(),group=randomUUID(),groupId=randomUUID(),watch=randomUUID(),watchId=randomUUID();
    const ordered=[ids.alice,ids.bob].sort();
    db.prepare('INSERT INTO conversations(id,user1,user2,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').run(conversation,...ordered,ids.alice,stamp,stamp);
    db.prepare('INSERT INTO private_messages(id,conversationId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)').run(message,conversation,ids.alice,randomUUID(),'PRIVATE SENTINEL MESSAGE',stamp);
    db.prepare('INSERT INTO chat_messages(id,authorId,clientId,body,createdAt,universityId) VALUES (?,?,?,?,?,?)').run(publicId,ids.alice,randomUUID(),'Synthetic public message',stamp,'anu');
    db.prepare('INSERT INTO campus_groups(id,universityId,ownerId,name,createdAt) VALUES (?,?,?,?,?)').run(group,'anu',ids.alice,'Fixture',stamp);
    db.prepare('INSERT INTO group_members(groupId,userId,createdAt) VALUES (?,?,?)').run(group,ids.alice,stamp);
    db.prepare('INSERT INTO group_messages(id,groupId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)').run(groupId,group,ids.alice,randomUUID(),'Synthetic delayed message',stamp);
    db.prepare('INSERT INTO watch_rooms(id,universityId,hostId,title,media,anchorAt,createdAt,updatedAt,inviteOnly) VALUES (?,?,?,?,?,?,?,?,?)').run(watch,'anu',ids.alice,'Fixture','{}',Date.now(),stamp,stamp,1);
    db.prepare('INSERT INTO watch_messages(id,roomId,authorId,clientId,body,position,createdAt) VALUES (?,?,?,?,?,?,?)').run(watchId,watch,ids.alice,randomUUID(),'Synthetic watch message',0,stamp);
    const request=(actor,channel,messageId,source='autodetect')=>fetch(base+'/api/translate',{method:'POST',headers:{origin:base,'content-type':'application/json',...(actor?{cookie:cookies[actor]}:{})},body:JSON.stringify({channel,messageId,source})});
    assert.equal((await request(null,'private',message)).status,401);
    assert.equal((await request('stranger','private',message)).status,404);
    assert.equal((await request('foreign','public',publicId)).status,404);
    assert.equal((await request('stranger','group',groupId)).status,404);
    assert.equal((await request('stranger','watch',watchId)).status,404);
    assert.equal(Number(readFileSync(counter,'utf8')),0,'forbidden access never reaches provider');
    for(const [channel,id] of [['private',message],['public',publicId],['watch',watchId]]){const res=await request('alice',channel,id);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).target,'en');}
    const pending=request('alice','group',groupId);await new Promise(r=>setTimeout(r,150));db.prepare('DELETE FROM group_members WHERE groupId=? AND userId=?').run(group,ids.alice);assert.equal((await pending).status,404,'membership rechecked after provider response');
    assert.equal((await request('alice','private',message,'unsupported')).status,400);
    db.prepare('UPDATE private_messages SET body=? WHERE id=?').run('Synthetic delayed message',message);
    const logoutPending=request('alice','private',message);await new Promise(r=>setTimeout(r,150));db.prepare('DELETE FROM sessions WHERE userId=?').run(ids.alice);assert.equal((await logoutPending).status,401,'session rechecked after provider response');
    assert.equal((await request('alice','private',message)).status,401);
    await new Promise(r=>setTimeout(r,20));assert.doesNotMatch(logs,/PRIVATE SENTINEL MESSAGE|Synthetic delayed message|translatedText|api\.mymemory|langpair|Synthetic English translation/);
  }finally{
    db?.close();if(child.exitCode===null){const finished=once(child,'exit');child.kill();await finished;}
    if(dir.startsWith(root+sep))rmSync(dir,{recursive:true,force:true});
  }
});

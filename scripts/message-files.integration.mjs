import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';

test('private binary files enforce permissions, bounded storage, retry receipts, logout and restart',{timeout:25000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'campuswall-files-')),base='http://127.0.0.1:18139',clients=[];let child,output='',db;
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18139',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,40));}throw Error('Server did not start');}
  async function stop(){const done=once(child,'exit');child.kill();await done;child=null;}
  const headers=u=>({...u?{cookie:u.cookie}:{},origin:base});
  async function json(path,method,u,value){const response=await fetch(base+path,{method,headers:{...headers(u),'content-type':'application/json'},...value?{body:JSON.stringify(value)}:{}});return {status:response.status,data:await response.json()};}
  const bytes=Buffer.from('PRIVATE_FILE_PAYLOAD_5d7b\0\xff'),name='Private <script> notes.pdf';
  async function upload(u,conversationId,data=bytes,clientId=randomUUID(),fileName=name){const response=await fetch(base+'/api/messages/conversations/'+conversationId+'/files',{method:'POST',headers:{...headers(u),'content-type':'application/octet-stream','x-file-name':encodeURIComponent(fileName),'x-client-id':clientId},body:data});return {status:response.status,data:await response.json()};}
  async function inbox(u){const ws=new WebSocket(base.replace('http','ws')+'/ws?inbox=1',{headers:headers(u)});clients.push(ws);ws.rows=[];ws.on('message',v=>ws.rows.push(JSON.parse(v)));await once(ws,'open');return ws;}
  try{
    await start();db=new DatabaseSync(join(dir,'campuswall.sqlite'));
    const users=['anu','anu','anu','usyd'].map((campus,i)=>{const id=randomUUID(),token=randomBytes(24).toString('hex');db.prepare('INSERT INTO users (id,name,email,passwordHash,createdAt,username,universityId) VALUES (?,?,?,?,?,?,?)').run(id,'Fixture '+i,id+'@example.com','fixture',new Date().toISOString(),'files_'+i,campus);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);return {id,cookie:'campus_session='+token};});
    const [a,b,c,other]=users,conversation=(await json('/api/messages/conversations','POST',a,{userId:b.id})).data.conversation;
    const wa=await inbox(a),wb=await inbox(b),wc=await inbox(c),receipt=randomUUID();
    const sent=await upload(a,conversation.id,bytes,receipt);assert.equal(sent.status,201);const file=sent.data.message.attachment;assert.equal(file.name,name);assert.equal(file.bytes,bytes.length);assert.equal(Object.hasOwn(file,'digest'),false);
    for(let i=0;i<50&&!wb.rows.some(v=>v.type==='inbox:message');i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(wa.rows.find(v=>v.type==='inbox:message').message.attachment.id,file.id);assert.equal(wb.rows.find(v=>v.type==='inbox:message').message.attachment.id,file.id);assert(!wc.rows.some(v=>v.type==='inbox:message'));
    for(const u of [a,b]){const response=await fetch(base+'/api/messages/files/'+file.id,{headers:headers(u)});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);}
    for(const [u,status] of [[null,401],[c,404],[other,404]])assert.equal((await fetch(base+'/api/messages/files/'+file.id,{headers:headers(u)})).status,status);
    assert.equal((await upload(c,conversation.id)).status,404);assert.equal((await upload(other,conversation.id)).status,404);assert.equal((await upload(null,conversation.id)).status,401);
    assert.equal((await upload(a,conversation.id,bytes,receipt)).status,200);assert.equal((await upload(a,conversation.id,Buffer.from('Changed bytes'),receipt)).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM message_files').get().n,1);assert.equal(readdirSync(join(dir,'message-files')).length,1);
    assert.equal((await upload(a,conversation.id,bytes,randomUUID(),'../secret.txt')).status,400);assert.equal((await upload(a,conversation.id,Buffer.alloc(0))).status,413);assert.equal((await upload(a,conversation.id,Buffer.alloc(10*1024*1024+1))).status,413);
    assert.equal((await json('/api/messages/conversations/'+conversation.id+'/messages','POST',a,{body:'Shared a file',clientId:receipt})).status,409);
    const quotaRows=[];
    for(let n=0;n<5;n++){const mid=randomUUID();quotaRows.push(mid);db.prepare('INSERT INTO private_messages (id,conversationId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)').run(mid,conversation.id,a.id,randomUUID(),'Quota fixture',new Date().toISOString());db.prepare('INSERT INTO message_files VALUES (?,?,?,?,?)').run(randomUUID(),mid,'quota.bin',10*1024*1024,'fixture');}
    assert.equal((await upload(a,conversation.id)).status,413,'The account quota rejects an extra file before reading its bytes');
    for(const mid of quotaRows){db.prepare('DELETE FROM message_files WHERE messageId=?').run(mid);db.prepare('DELETE FROM private_messages WHERE id=?').run(mid);}
    const forbidden=await fetch(base+'/api/messages/conversations/'+conversation.id+'/files',{method:'POST',headers:{...headers(a),origin:'https://other.example','content-type':'application/octet-stream','x-file-name':'test.txt','x-client-id':randomUUID()},body:bytes});assert.equal(forbidden.status,403);
    const history=await json('/api/messages/conversations/'+conversation.id+'/messages','GET',b);assert.equal(history.data.messages[0].attachment.id,file.id);
    // A session revoked while a request is still streaming cannot publish a file.
    let release;const gate=new Promise(r=>release=r);const pending=fetch(base+'/api/messages/conversations/'+conversation.id+'/files',{method:'POST',headers:{...headers(b),'content-type':'application/octet-stream','x-file-name':'revoked.txt','x-client-id':randomUUID()},duplex:'half',body:(async function*(){yield Buffer.from('part');await gate;yield Buffer.from('two');})()});
    for(let i=0;i<100&&!readdirSync(join(dir,'message-files')).some(f=>f.endsWith('.part'));i++)await new Promise(r=>setTimeout(r,10));
    assert(readdirSync(join(dir,'message-files')).some(f=>f.endsWith('.part')));assert.equal((await json('/api/auth/logout','POST',b,{})).status,200);release();assert.equal((await pending).status,401);assert.equal(db.prepare('SELECT COUNT(*) n FROM message_files').get().n,1);assert.equal(readdirSync(join(dir,'message-files')).length,1);
    for(const ws of clients)ws.terminate();db.close();db=null;await stop();
    writeFileSync(join(dir,'message-files',randomUUID()+'.part'),'aborted');writeFileSync(join(dir,'message-files',randomUUID()+'.bin'),'orphan');await start();
    assert.equal(readdirSync(join(dir,'message-files')).length,1);assert.deepEqual(Buffer.from(await(await fetch(base+'/api/messages/files/'+file.id,{headers:headers(a)})).arrayBuffer()),bytes);
    assert.equal((await json('/api/messages/conversations/'+conversation.id+'/messages','GET',a)).data.messages[0].attachment.id,file.id);
    assert(!output.includes(name));assert(!output.includes('PRIVATE_FILE_PAYLOAD_5d7b'));
  }finally{for(const ws of clients)ws.terminate();db?.close();if(child)await stop();rmSync(dir,{recursive:true,force:true});}
});

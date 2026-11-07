import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createBackups,restoreOnce} from '../backups.mjs';

// A restore drill: the app writes a daily copy, later changes are made, and restoring that copy
// brings back exactly the earlier state once, keeping the replaced database beside it.
test('daily backups restore the earlier state exactly once',{timeout:60000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'backups-')),port=18157,base=`http://127.0.0.1:${port}`;let child;
  const start=async(env={})=>{child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_BACKUPS:'off',...env},stdio:'pipe'});for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('server did not start');};
  const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}};
  const req=async(path,method='GET',body,cookie)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():null,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const titles=async cookie=>(await req('/api/drafts','GET',null,cookie)).data.map(p=>p.title).sort();
  try{
    await start();
    const cookie=(await req('/api/auth/register','POST',{name:'backup_student',username:'backup_student',email:'backup@example.test',password:'disposable-test-password',universityId:'anu'})).cookie;
    assert.equal((await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title:'Before the backup'},cookie)).status,201);
    await stop();await start({DATABASE_BACKUPS:'on',BACKUP_DELAY_MS:'0'});
    const backups=join(dir,'backups');for(let i=0;i<100&&!(existsSync(backups)&&readdirSync(backups).some(f=>f.endsWith('.sqlite')));i++)await new Promise(r=>setTimeout(r,50));
    const name=readdirSync(backups).find(f=>/^campuswall-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f));assert.ok(name,'a daily copy is written');
    assert.equal((await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title:'After the backup'},cookie)).status,201);
    await stop();
    await t.test('restoring brings back the backed-up state and keeps the replaced database',async()=>{
      await start({RESTORE_FROM:name});
      assert.deepEqual(await titles(cookie),['Before the backup']);
      assert.ok(readdirSync(dir).some(f=>f.startsWith('campuswall.sqlite.before-restore-')),'the replaced database is kept');
      assert.equal((await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title:'After the restore'},cookie)).status,201);
      await stop();
    });
    await t.test('a restore setting left in place does not restore again',async()=>{
      await start({RESTORE_FROM:name});
      assert.deepEqual(await titles(cookie),['After the restore','Before the backup']);
      await stop();
    });
    await t.test('only backup file names are accepted',async()=>{
      assert.throws(()=>restoreOnce(dir,'../campuswall.sqlite',{}),/RESTORE_FROM must name a file/);
    });
  }finally{await stop();assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

test('backups keep the newest seven days and write one copy per day',()=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'backup-prune-'));
  try{
    const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE t(x)');let day=1;
    const backups=createBackups({db,dataDir:dir,today:()=>`2026-11-${String(day).padStart(2,'0')}`});
    for(;day<=10;day++)assert.ok(backups.backup());day=10;assert.equal(backups.backup(),null,'one copy per day');
    writeFileSync(join(backups.dir,'notes.txt'),'kept');
    backups.prune();
    assert.deepEqual(readdirSync(backups.dir).sort(),['campuswall-2026-11-04.sqlite','campuswall-2026-11-05.sqlite','campuswall-2026-11-06.sqlite','campuswall-2026-11-07.sqlite','campuswall-2026-11-08.sqlite','campuswall-2026-11-09.sqlite','campuswall-2026-11-10.sqlite','notes.txt']);
    db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

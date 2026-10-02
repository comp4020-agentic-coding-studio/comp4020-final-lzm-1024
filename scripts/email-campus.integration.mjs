import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID,scryptSync,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {campusDetails,universities} from '../campus.mjs';
import {validEmail,universityFromEmail} from '../public/email-utils.js';

test('university email registration and legacy account compatibility',{timeout:30000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'email-campus-')),base='http://127.0.0.1:18086';let child;
  const fixture=new DatabaseSync(join(dir,'campuswall.sqlite')),salt='email-campus-fixture',time=new Date().toISOString(),hash=`${salt}:${scryptSync('old-password',salt,64).toString('hex')}`;
  fixture.exec(readFileSync('migrations/001-campuswall.sql','utf8'));
  for(const [slug,name,short] of universities)fixture.prepare('INSERT INTO universities VALUES (?,?,?,?)').run(slug,slug,name,short);
  fixture.exec('PRAGMA user_version=1; COMMIT;');
  for(const file of ['002-discovery.sql','003-public-chat.sql','004-private-messages.sql','005-account-campus.sql','006-campus-chat.sql','007-eight-campuses.sql'])fixture.exec(readFileSync('migrations/'+file,'utf8'));
  const cookies={};
  for(const [id,email,universityId] of [['legacy-anu','legacy@anu.edu.au',null],['legacy-personal','legacy@example.com',null],['legacy-fixed','fixed@anu.edu.au','usyd']]){
    fixture.prepare('INSERT INTO users (id,name,email,passwordHash,createdAt,username,universityId) VALUES (?,?,?,?,?,?,?)').run(id,id,email,hash,time,id.replaceAll('-','_'),universityId);
    const token=randomUUID().replaceAll('-','').repeat(2);cookies[id]=`campus_session=${token}`;
    fixture.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+86400000);
  }
  fixture.close();
  async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18086',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',c=>errors+=c);for(let i=0;i<100;i++){try{await fetch(base+'/api/health');return;}catch{}if(child.exitCode!==null)throw Error(errors);await new Promise(r=>setTimeout(r,30));}throw Error(errors||'Server did not start');}
  async function stop(){const done=once(child,'exit');child.kill();await done;}
  async function request(path,data,cookie){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const meta=universities.map(([id])=>({id,...campusDetails[id]})),accounts=[];
  const domains=[['anu','anu.edu.au'],['usyd','uni.sydney.edu.au'],['unsw','ad.unsw.edu.au'],['unimelb','student.unimelb.edu.au'],['monash','student.monash.edu'],['uq','student.uq.edu.au'],['uwa','student.uwa.edu.au'],['adelaide','student.adelaide.edu.au']];
  try{
    await start();
    await t.test('normalises case and whitespace, recognises published aliases and rejects deceptive or malformed domains',()=>{
      for(const campus of meta)for(const domain of campus.emailDomains)assert.equal(universityFromEmail(` Student.Name+tag@${domain.toUpperCase()} `,meta)?.id,campus.id);
      for(const email of ['user@anu.edu.au.evil.com','user@evilanu.edu.au','user@anu-edu.au','anu.edu.au@evil.com','user@fake.anu.edu.au','user@gmail.com'])assert.equal(universityFromEmail(email,meta),null);
      for(const email of ['a@@anu.edu.au','.user@anu.edu.au','user..name@anu.edu.au','user@-anu.edu.au','user@anu..edu.au','a'.repeat(65)+'@anu.edu.au'])assert.equal(validEmail(email),false);
    });
    await t.test('all eight university emails reject another school and create only correctly scoped accounts',async()=>{
      for(const [universityId,domain] of domains){
        const email=`${randomUUID()}@${domain}`,input={name:'University Student',email,password:'correct-password',universityId};
        const wrong=await request('/api/auth/register',{...input,universityId:universityId==='anu'?'usyd':'anu'});assert.equal(wrong.status,400);assert.equal(wrong.cookie,undefined);
        const ok=await request('/api/auth/register',input);assert.equal(ok.status,200);assert.equal(ok.data.user.universityId,universityId);accounts.push(ok);
        assert.equal((await request('/api/auth/me',undefined,ok.cookie)).data.user.universityId,universityId);
      }
      const db=new DatabaseSync(join(dir,'campuswall.sqlite'));assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE passwordHash<>'!disabled'").get().n,11);db.close();
    });
    await t.test('the server derives the university when the disabled school field is omitted and stores a normalised email',async()=>{
      const result=await request('/api/auth/register',{name:'Automatic ANU',email:` ${randomUUID()}@ANU.EDU.AU `,password:'correct-password'});assert.equal(result.status,200);assert.equal(result.data.user.universityId,'anu');assert.match(result.data.user.email,/@anu\.edu\.au$/);assert.equal(result.data.user.email,result.data.user.email.trim());accounts.push(result);
    });
    await t.test('invalid email syntax cannot create an account; personal emails retain an explicit school choice',async()=>{
      for(const email of ['a@@anu.edu.au','.user@anu.edu.au','user..name@anu.edu.au','user@-anu.edu.au','user@anu..edu.au'])assert.equal((await request('/api/auth/register',{name:'Invalid',email,password:'correct-password',universityId:'anu'})).status,400);
      const input={name:'Personal Email',email:randomUUID()+'@gmail.com',password:'correct-password'};
      assert.equal((await request('/api/auth/register',input)).status,400);
      const result=await request('/api/auth/register',{...input,universityId:'uq'});assert.equal(result.status,200);assert.equal(result.data.user.universityId,'uq');accounts.push(result);
    });
    await t.test('unassigned legacy university emails must bind to their email school while old personal-email accounts keep setup',async()=>{
      assert.equal((await request('/api/auth/university',{universityId:'usyd'},cookies['legacy-anu'])).status,400);
      assert.equal((await request('/api/auth/me',undefined,cookies['legacy-anu'])).data.user.universityId,null);
      assert.equal((await request('/api/auth/university',{universityId:'anu'},cookies['legacy-anu'])).status,200);
      assert.equal((await request('/api/auth/university',{universityId:'usyd'},cookies['legacy-anu'])).status,409);
      assert.equal((await request('/api/auth/university',{universityId:'uwa'},cookies['legacy-personal'])).data.user.universityId,'uwa');
    });
    await t.test('existing fixed affiliations and sessions survive, including earlier mismatched emails, and new bindings persist after restart',async()=>{
      const login=await request('/api/auth/login',{email:'fixed@anu.edu.au',password:'old-password',universityId:'anu'});assert.equal(login.status,200);assert.equal(login.data.user.universityId,'usyd');
      await stop();await start();
      for(const account of accounts)assert.equal((await request('/api/auth/me',undefined,account.cookie)).data.user.universityId,account.data.user.universityId);
      assert.equal((await request('/api/auth/me',undefined,cookies['legacy-fixed'])).data.user.universityId,'usyd');
      assert.equal((await request('/api/auth/me',undefined,cookies['legacy-anu'])).data.user.universityId,'anu');
    });
  }finally{if(child?.exitCode===null)await stop();assert.ok(dir.startsWith(root+sep));rmSync(dir,{recursive:true,force:true});}
});

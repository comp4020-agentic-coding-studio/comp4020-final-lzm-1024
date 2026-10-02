import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Isolated synthetic data only. Never benchmarks or mutates the Fly volume.
const root=resolve('.test-data');mkdirSync(root,{recursive:true});
const dir=mkdtempSync(join(root,'performance-')),base='http://127.0.0.1:18089';let child;
async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'18089',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk);for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(child.exitCode!==null)throw Error(error);await new Promise(r=>setTimeout(r,30));}throw Error(error||'Benchmark server did not start');}
async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done;}}
async function sample(path,n=20){for(let i=0;i<3;i++)await(await fetch(base+path)).arrayBuffer();const ms=[];let bytes=0;for(let i=0;i<n;i++){const start=performance.now(),res=await fetch(base+path);if(!res.ok)throw Error(`${path}: ${res.status}`);bytes=(await res.arrayBuffer()).byteLength;ms.push(performance.now()-start);}ms.sort((a,b)=>a-b);return {samples:n,bytes,p50ms:+ms[Math.floor(n*.5)].toFixed(2),p95ms:+ms[Math.min(n-1,Math.floor(n*.95))].toFixed(2)};}
try{
  await start();await stop();
  const db=new DatabaseSync(join(dir,'campuswall.sqlite')),time=new Date().toISOString();
  db.exec('BEGIN');const insert=db.prepare('INSERT INTO posters VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for(let n=0;n<1000;n++){const content=JSON.stringify({title:`Synthetic benchmark poster ${n}`,subtitle:'Isolated performance fixture',date:'2026-10-15',time:'12:00',location:'Benchmark venue',description:'Not a real event. Test-only data.',category:'Other',template:'minimal',style:'ink',alignment:'left',heroImageUrl:''});insert.run(`benchmark-${n}`,'campus-team','anu',`benchmark-${n}`,'PUBLISHED',content,content,0,time,time,time);}
  db.exec('COMMIT');db.close();await start();
  const result={label:process.argv[2]||'current',syntheticPosters:1000,wall:await sample('/api/posters?university=anu'),filteredWall:await sample('/api/posters?university=anu&category=Other'),clubs:await sample('/api/clubs?university=unsw&q=music'),asset:await sample('/app.js')};
  const compressed=await fetch(base+'/app.js',{headers:{'accept-encoding':'br,gzip'}});result.asset.compressedEncoding=compressed.headers.get('content-encoding');result.asset.compressedBytes=Number(compressed.headers.get('content-length'))||null;await compressed.arrayBuffer();
  const conditional=await fetch(base+'/app.js',{headers:{'accept-encoding':'br,gzip','if-none-match':compressed.headers.get('etag')||'"not-found"'}});result.asset.conditionalStatus=conditional.status;await conditional.arrayBuffer();
  writeFileSync(join(root,`performance-${result.label.replace(/[^a-z0-9-]/gi,'')}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await stop();if(dir.startsWith(root+sep)&&dir!==root)rmSync(dir,{recursive:true,force:true});}

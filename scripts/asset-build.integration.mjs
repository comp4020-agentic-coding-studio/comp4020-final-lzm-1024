import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import http from 'node:http';

// The production image serves minified, pre-compressed assets (scripts/build-assets.mjs)
// and compresses JSON. Build into a disposable directory and serve it as the image does.
test('built assets and compressed JSON',{timeout:120000},async t=>{
 const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'asset-build-')),out=join(dir,'build'),data=join(dir,'data'),port=18147,base='http://127.0.0.1:'+port;let child;
 const raw=(path,headers={},method='GET')=>new Promise((ok,fail)=>{const req=http.request(base+path,{method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>ok({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',fail);req.end();});
 try{
  execFileSync(process.execPath,['scripts/build-assets.mjs','public',out],{stdio:'pipe'});
  const {files,images}=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
  await t.test('every served text file is built, smaller, and its compressed variants decode exactly',async()=>{
   const served=JSON.parse(readFileSync('public-assets.mjs','utf8').match(/const textFiles=(\[[^\]]*\])/)[1].replace(/'/g,'"'));
   for(const name of [...served,'index.html','vendor/leaflet.js','vendor/leaflet.css','vendor/hls.min.js'])assert.ok(files['/'+name],name);
   for(const [path,entry] of Object.entries(files)){
    const file=join(out,'files',path.slice(1)),identity=readFileSync(file);
    assert.deepEqual(brotliDecompressSync(readFileSync(file+'.br')),identity,path+' br');assert.deepEqual(gunzipSync(readFileSync(file+'.gz')),identity,path+' gzip');
    if(!path.startsWith('/vendor/')&&path!=='/index.html')assert.ok(identity.length<=readFileSync(join('public',path.slice(1))).length,path+' is never larger than its source');
   }
   const total=key=>Object.entries(files).filter(([path])=>!path.startsWith('/vendor/')).reduce((sum,[,entry])=>sum+entry[key],0);assert.ok(total('bytes')<Object.keys(files).filter(path=>!path.startsWith('/vendor/')).reduce((sum,path)=>sum+readFileSync(join('public',path.slice(1))).length,0)*.95,'minification saves at least 5% overall');
   assert.ok(Object.keys(images).some(path=>path.startsWith('/demo-photos/')));
  });
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data,PUBLIC_ASSET_DIR:out},stdio:'pipe'});
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
  await t.test('the server sends the built files, with validators and the smoke-test size budget',async()=>{
   const built=readFileSync(join(out,'files','app.js'));
   const br=await raw('/app.js',{'accept-encoding':'br, gzip'});assert.equal(br.headers['content-encoding'],'br');assert.deepEqual(brotliDecompressSync(br.body),built);assert.ok(br.body.length<20000,'compressed app.js stays under 20,000 bytes');
   assert.equal((await raw('/app.js',{'accept-encoding':'br, gzip','if-none-match':br.headers.etag})).status,304);
   assert.deepEqual((await raw('/app.js',{'accept-encoding':'identity'})).body,built);
   const photo=Object.keys(images).find(path=>path.startsWith('/demo-photos/')),served=await raw(photo);assert.equal(served.headers.etag,`"${images[photo].hash}-identity"`);assert.deepEqual(served.body,readFileSync(join('public',photo.slice(1))));
  });
  await t.test('the complete module graph resolves to built JavaScript',async()=>{
   const queue=['/app.js','/voice-calls.js','/community.js','/games.js','/watch.js','/designer.js','/whiteboard.js','/messages.js','/profile.js','/guide.js'],seen=new Set();
   while(queue.length){const path=queue.pop();if(seen.has(path))continue;seen.add(path);const res=await raw(path,{'accept-encoding':'identity'});assert.equal(res.status,200,path);assert.match(res.headers['content-type'],/^text\/javascript/,path);const code=res.body.toString();assert.equal(code,readFileSync(join(out,'files',path.slice(1)),'utf8'),path);for(const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(["'`])\.\/([^"'`]+\.js)\1/g))queue.push('/'+m[2]);}
   assert.ok(seen.size>=30,'followed the import graph: '+seen.size);
  });
  await t.test('JSON over 1 KB is compressed for clients that accept it; small, HEAD and identity requests are not',async()=>{
   const clubs=await raw('/api/clubs?university=anu',{'accept-encoding':'br, gzip'});assert.equal(clubs.headers['content-encoding'],'br');assert.match(clubs.headers.vary,/Accept-Encoding/);assert.equal(clubs.headers['cache-control'],'no-store');
   const decoded=JSON.parse(brotliDecompressSync(clubs.body));assert.ok(decoded.total>100);assert.ok(clubs.body.length<Buffer.byteLength(JSON.stringify(decoded))/3);
   const gz=await raw('/api/clubs?university=anu',{'accept-encoding':'gzip'});assert.equal(gz.headers['content-encoding'],'gzip');assert.deepEqual(JSON.parse(gunzipSync(gz.body)),decoded);
   const plain=await raw('/api/clubs?university=anu');assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(JSON.parse(plain.body),decoded);
   const small=await raw('/api/health',{'accept-encoding':'br'});assert.equal(small.headers['content-encoding'],undefined);
   const failed=await raw('/api/posters?university=nowhere',{'accept-encoding':'br'});assert.equal(failed.status,400);assert.equal(JSON.parse(failed.body).error,'Choose a university');
  });
  await t.test('QR codes still render with the image and QR libraries loaded on first use',async()=>{
   const posters=JSON.parse((await raw('/api/posters?university=anu')).body);const qr=await raw(`/api/posters/${posters[0].id}/qr`);assert.equal(qr.status,200);assert.match(qr.body.toString(),/<svg/);
  });
  await t.test('poster cards get a 720px photo from the build; development falls back to the original',async()=>{
   const card=Object.entries(images).find(([path,entry])=>entry.built)?.[0];assert.ok(card,'card photos were built');
   const original=card.replace('-720.webp','.webp'),small=await raw(card),full=await raw(original);
   assert.equal(small.status,200);assert.equal(small.headers['content-type'],'image/webp');assert.equal(small.headers.etag,`"${images[card].hash}-identity"`);assert.ok(small.body.length<full.body.length/2,'card photo is much smaller');
   assert.equal((await raw(card,{'if-none-match':small.headers.etag})).status,304);
   const {createPublicAssets}=await import('../public-assets.mjs'),source=createPublicAssets(process.cwd(),{builtDir:''});
   const local=http.createServer(async(req,res)=>{if(!await source.serve(req,res,req.url)){res.writeHead(404);res.end();}});await new Promise(r=>local.listen(0,'127.0.0.1',r));
   try{const fallback=await fetch(`http://127.0.0.1:${local.address().port}${card}`);assert.equal(fallback.status,200);assert.deepEqual(Buffer.from(await fallback.arrayBuffer()),readFileSync(join('public',original.slice(1))));assert.equal((await fetch(`http://127.0.0.1:${local.address().port}/app-720.webp`)).status,404,'only sample photo names fall back');}
   finally{local.close();}
   assert.match(readFileSync('public/photo-posters.js','utf8'),/srcset="\$\{esc\(p\.heroImageUrl\.replace\(\/\\\.webp\$\/,'-720\.webp'\)\)\} 720w, \$\{esc\(p\.heroImageUrl\)\} 1400w"/);
  });
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

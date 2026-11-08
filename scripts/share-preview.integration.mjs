import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

// Link previews read a poster page's HTML without running app.js. A published poster's
// page names it (test notices keep their TEST label); drafts, removed posters and other
// campuses' visitors get only the generic page. Icons are served and HTTPS sends HSTS.
test('poster pages carry their own link preview, and only once published',{timeout:40000},async t=>{
  const root=resolve('.test-data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'share-preview-')),port=18159,base=`http://127.0.0.1:${port}`,site='https://campuswall.example.test';let child;
  const req=async(path,method='GET',body,u,headers={})=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{'content-type':'application/json',...headers,...(u?{cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const reg=async(name,universityId='anu')=>{const r=await req('/api/auth/register','POST',{name,username:name,email:name+'@example.test',password:'disposable-test-password',universityId});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data.user,cookie:r.cookie};};
  const meta=(html,name)=>html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`))?.[1];
  const future=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  try{
    child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,PUBLIC_BASE_URL:site,DATABASE_BACKUPS:'off'},stdio:'pipe'});
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
    const creator=await reg('share_creator'),elsewhere=await reg('share_elsewhere','unimelb');
    let p=(await req('/api/drafts','POST',{universityId:'anu',preset:'minimal',title:'Jazz & "Jam" <night>'},creator)).data;
    for(const [field,value] of Object.entries({date:future,time:'18:30',location:'Kambri Cultural Centre',description:'Bring an instrument or just listen.'})){const r=await req(`/api/drafts/${p.id}/fields`,'PATCH',{field,value,clientVersion:p.version},creator);assert.equal(r.status,200,JSON.stringify(r.data));p=r.data;}
    const page=`/anu/posters/${p.slug}`;

    await t.test('a draft poster page shows only the generic preview',async()=>{
      const r=await req(page);assert.equal(r.status,200);
      assert.equal(meta(r.data,'og:title'),'CampusWall — Your campus, at a glance');assert.ok(!r.data.includes('Jazz'),'no draft content in the HTML');
      assert.equal(meta(r.data,'og:image'),`${site}/icon-512.png`,'site-wide preview image is absolute');
    });
    assert.equal((await req(`/api/drafts/${p.id}/publish`,'POST',null,creator)).status,200);
    await t.test('the published poster page names the poster, escaped, with an absolute link',async()=>{
      const r=await req(page);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-cache/);
      assert.ok(r.data.includes('<title>Jazz &amp; &quot;Jam&quot; &lt;night&gt; · CampusWall</title>'));assert.ok(!r.data.includes('<night>'),'user text is escaped');
      assert.equal(meta(r.data,'og:title'),'Jazz &amp; &quot;Jam&quot; &lt;night&gt;');
      const when=new Date(future+'T00:00:00Z').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});assert.match(when,/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
      assert.equal(meta(r.data,'og:description'),`${when} · 18:30 · Kambri Cultural Centre — Bring an instrument or just listen.`);
      assert.equal(meta(r.data,'description'),meta(r.data,'og:description'));
      assert.equal(meta(r.data,'og:url'),`${site}/anu/posters/${p.slug}`);
      assert.equal(meta(r.data,'og:image'),`${site}/icon-512.png`,'no photo: the site icon');assert.equal(meta(r.data,'twitter:card'),'summary');
      assert.equal(r.data.match(/property="og:title"/g).length,1,'the generic tags are replaced, not duplicated');
      assert.ok(r.data.includes('<script type="module" src="/app.js"></script>'),'still the app page');
      assert.equal((await req(`/anu/posters/${p.id}`)).data.includes('Kambri Cultural Centre'),true,'the id link previews too');
    });
    await t.test('a visitor from another campus is redirected before any poster preview',async()=>{
      const r=await req(page,'GET',null,elsewhere);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/unimelb');
    });
    await t.test('test notices keep their TEST label and disclosure in the preview',async()=>{
      const notice=(await req('/api/posters?university=anu')).data.find(x=>x.isTest&&x.heroImageUrl?.startsWith('/demo-photos/'));assert.ok(notice,'the disposable database has photo test notices');
      const html=(await req(`/anu/posters/${notice.slug}`)).data;
      assert.ok(meta(html,'og:title').startsWith('[TEST] '));assert.ok(meta(html,'og:description').startsWith('TEST EVENT'));
      assert.match(meta(html,'og:image'),new RegExp(`^${site}/demo-photos/[a-z0-9-]+-720\\.webp$`));assert.equal(meta(html,'twitter:card'),'summary_large_image');
      const image=await fetch(base+new URL(meta(html,'og:image')).pathname);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
    });
    await t.test('unpublishing returns the page to the generic preview',async()=>{
      assert.equal((await req(`/api/drafts/${p.id}/unpublish`,'POST',null,creator)).status,200);
      const r=await req(page);assert.ok(!r.data.includes('Jazz'));assert.equal(meta(r.data,'og:title'),'CampusWall — Your campus, at a glance');
    });
    await t.test('site icons are served with their types, and HSTS only over HTTPS',async()=>{
      for(const [path,type] of [['/favicon.ico','image/x-icon'],['/icon.svg','image/svg+xml'],['/apple-touch-icon.png','image/png'],['/icon-192.png','image/png'],['/icon-512.png','image/png']]){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.equal(r.headers.get('content-type'),type,path);assert.ok((await r.arrayBuffer()).byteLength>100,path);}
      const html=(await req('/')).data;for(const link of ['<link rel="icon" href="/favicon.ico" sizes="32x32">','<link rel="icon" href="/icon.svg" type="image/svg+xml">','<link rel="apple-touch-icon" href="/apple-touch-icon.png">'])assert.ok(html.includes(link),link);
      assert.equal((await req('/')).headers.get('strict-transport-security'),null,'plain local http sends no HSTS');
      for(const path of ['/','/api/universities'])assert.equal((await req(path,'GET',null,null,{'x-forwarded-proto':'https'})).headers.get('strict-transport-security'),'max-age=31536000',path);
    });
  }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}assert.ok(dir.startsWith(root));rmSync(dir,{recursive:true,force:true});}
});

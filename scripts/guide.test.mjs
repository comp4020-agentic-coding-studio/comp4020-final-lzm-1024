import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guideStrings,sections,quickStart,quickStartFor} from '../public/guide.js';

// The owner noticed step 1 still said "choose your university" while only ANU was open.
test('with one open campus the quick start names it instead of asking to choose',async()=>{
  const anu={slug:'anu',shortName:'ANU'},single=quickStartFor(anu,true);
  assert.deepEqual(single[0],['Start on the ANU wall','CampusWall is open to ANU for now, so the home page takes you straight to its event wall. You can browse without an account.']);
  assert.deepEqual(single[2],['Create an account','Sign up with your name, email and a password. Your account belongs to ANU, the only campus open for now.']);
  assert.ok(!single.flat().some(text=>/choose your university|Choose your university/i.test(text)),'no step asks for a choice that does not exist');
  assert.deepEqual([single[1],single[3],single[4]],[quickStart[1],quickStart[3],quickStart[4]]);
  assert.deepEqual(quickStartFor(anu,false),quickStart,'several open campuses keep the choice');
  assert.match(readFileSync('public/app.js','utf8'),/mountGuide\(app,\{user:me,campus:universities\.find\(u=>u\.slug===selected\),single:universities\.length===1\}\)/);
  const zh=(await import('../public/locales/zh-CN.js')).default;
  assert.equal(zh['Start on the {0} wall'],'从 {0} 海报墙开始');
});

test('every getting-started sentence is translated in all four catalogues',async()=>{
  const strings=guideStrings();assert(strings.length>=150);
  for(const id of ['zh-CN','es','fr','ja']){
    const catalogue=(await import('../public/locales/'+id+'.js')).default;
    const missing=strings.filter(key=>!Object.hasOwn(catalogue,key)&&!Object.hasOwn(catalogue,key.toLowerCase()));
    assert.deepEqual(missing,[],id);
    for(const key of strings.filter(key=>key.includes('TEST EVENT')))assert.match(catalogue[key],/TEST EVENT/,`${id} keeps the TEST disclosure`);
  }
});

test('guide links only to routes the server serves and is shipped as a public asset',()=>{
  const server=readFileSync('server.mjs','utf8'),assets=readFileSync('public-assets.mjs','utf8'),app=readFileSync('public/app.js','utf8');
  assert.match(server,/login\|guide\|/);assert.match(assets,/'guide\.js','guide\.css'/);
  assert.match(app,/path==='\/guide'/);assert.match(app,/href="\/guide" data-nav/);
  const allowed=/^\/(?:saved|my-posters|messages|games|watch|community(?:\/[a-z]+)?|[a-z]+(?:\/clubs)?)?$/;
  for(const s of sections)for(const f of s.features){const href=f.href?.('anu');if(href)assert.match(href,allowed,f.name);}
});

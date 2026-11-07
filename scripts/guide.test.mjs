import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guideStrings,sections} from '../public/guide.js';

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

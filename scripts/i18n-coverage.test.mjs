import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFiles,candidates,catalogue,notInterface} from './i18n-coverage.mjs';

// Every English sentence a student can see — buttons, prompts, toasts, game and call
// messages, server errors — must be in all four catalogues. Text that stays English on
// purpose is listed in notInterface with its reason (artwork, TEST disclosures, tokens).
test('the interface is fully translated in all four languages',async()=>{
  const found=new Set();for(const file of sourceFiles)for(const text of candidates(file))found.add(text);
  assert.ok(found.size>1500,`scan covers the interface (${found.size} strings)`);
  for(const language of ['zh-CN','es','fr','ja']){
    const translatable=await catalogue(language);
    const missing=[...found].filter(text=>!notInterface.has(text)&&!translatable(text));
    assert.deepEqual(missing,[],`${language}: add these to public/locales/${language}.js`);
  }
});

test('exclusions are few, explained and still present in the source',()=>{
  const found=new Set();for(const file of sourceFiles)for(const text of candidates(file))found.add(text);
  assert.ok(notInterface.size<70);
  for(const [text,reason] of notInterface){assert.ok(reason.length>=3,text);}
  const stale=[...notInterface.keys()].filter(text=>!found.has(text));
  assert.deepEqual(stale,[],'remove exclusions for text that no longer exists');
});

test('placeholders survive translation',async()=>{
  for(const language of ['zh-CN','es','fr','ja']){
    const entries=(await import(`../public/locales/${language}.js`)).default;
    for(const [key,value] of Object.entries(entries)){const holes=key.match(/\{\d\}/g)||[];for(const hole of holes)assert.ok(value.includes(hole),`${language}: ${key}`);}
  }
});

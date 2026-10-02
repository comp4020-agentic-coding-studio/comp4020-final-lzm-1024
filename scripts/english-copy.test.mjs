import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,extname} from 'node:path';
import {gameCatalog} from '../public/game-catalog.js';
import {newGame} from '../game-engine.mjs';
import {testNotice} from '../photo-gallery.mjs';

const han=/\p{Script=Han}/u;
function files(directory,extensions){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?files(path,extensions):extensions.has(extname(path))?[path]:[];
  });
}
test('application-provided copy and project documents contain no Chinese characters',()=>{
  const sourceFiles=[
    ...files('public',new Set(['.js','.css','.html','.svg','.json'])),
    ...files('data',new Set(['.json','.md'])),
    ...files('docs',new Set(['.md'])),
    ...files('reflections',new Set(['.md'])),
    ...readdirSync('.').filter(file=>['.mjs','.md'].includes(extname(file)))
  ];
  for(const file of sourceFiles)assert.doesNotMatch(readFileSync(file,'utf8'),han,file);
});
test('all game names, rules, new drawing prompts and test disclosures are English',()=>{
  assert.equal(gameCatalog.length,10);
  for(const game of gameCatalog){
    assert.equal(Object.hasOwn(game,'zh'),false);
    for(const field of ['name','description','rules']){
      assert.ok(game[field]?.length>0);assert.doesNotMatch(game[field],han);
    }
  }
  const state=newGame('draw',1000);
  for(const aliases of state.wordList)for(const word of aliases)assert.match(word,/^[a-z ]+$/i);
  assert.match(testNotice,/^TEST EVENT — Fictional event/);assert.doesNotMatch(testNotice,han);
});

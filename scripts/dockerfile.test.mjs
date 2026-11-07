import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The image copies server modules one by one. A module imported by the server but
// missing from the Dockerfile only fails when the deployed machine starts, so check
// the whole local import graph here.
test('every server module imported from server.mjs is copied into the image',()=>{
  const docker=readFileSync('Dockerfile','utf8'),copied=new Set([...docker.matchAll(/^COPY\s+(.+?)\s+\.\/\s*$/gm)].flatMap(m=>m[1].split(/\s+/)));
  const seen=new Set(),todo=['server.mjs'],missing=[];
  while(todo.length){
    const file=todo.pop();if(seen.has(file))continue;seen.add(file);
    for(const [,dep] of readFileSync(file,'utf8').matchAll(/(?:from\s+|import\s*\()\s*'\.\/([^']+)'/g)){
      if(dep.startsWith('public/')||dep.startsWith('data/'))continue;
      if(!copied.has(dep))missing.push(`${file} imports ${dep}`);
      todo.push(dep);
    }
  }
  assert.ok(seen.size>10,'the import graph was followed');
  assert.deepEqual(missing,[]);
  assert.match(docker,/^COPY public\/ \.\/public\/$/m);assert.match(docker,/^COPY migrations\/ \.\/migrations\/$/m);
});

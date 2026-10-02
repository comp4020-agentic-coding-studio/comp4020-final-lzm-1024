import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {campusToday,formatEventDate,eventStatus} from '../public/event-utils.js';

// An isolated CPU comparison, not a browser paint or production latency score.
// The reference uses the exact pre-change date formatting calls.
const now=new Date('2026-10-02T01:00:00Z');
const posters=Array.from({length:1000},(_,n)=>({date:`2026-10-${String(3+n%24).padStart(2,'0')}`,timeZone:n%2?'Australia/Perth':'Australia/Sydney'}));
const referenceDate=date=>new Date(`${date}T12:00:00`).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
function render(reference){return posters.map(p=>{
  const display=reference?referenceDate:formatEventDate;
  const today=reference?now.toLocaleDateString('en-CA',{timeZone:p.timeZone}):campusToday(now,p.timeZone);
  return `${display(p.date)}|${display(p.date)}|${display(p.date)}|${eventStatus(p,today).label}`;
}).join('\n');}
assert.equal(render(true),render(false));
function sample(reference){
  for(let n=0;n<3;n++)render(reference);
  const values=[];
  for(let n=0;n<20;n++){const start=performance.now();render(reference);values.push(performance.now()-start);}
  values.sort((a,b)=>a-b);return {samples:20,p50ms:+values[10].toFixed(2),p95ms:+values[19].toFixed(2)};
}
function modules(roots){
  const seen=new Set();
  function visit(file){
    if(seen.has(file))return;seen.add(file);
    const text=readFileSync(join('public',file),'utf8');
    for(const match of text.matchAll(/^import[^\n]*from ['"]\.\/([^'"]+)['"]/gm))visit(match[1]);
  }
  roots.forEach(visit);return [...seen].sort();
}
const guest=modules(['app.js']),eager=modules(['app.js','community.js','voice-calls.js']);
const deferred=eager.filter(file=>!guest.includes(file));
const result={date:'2026-10-02',fixturePosters:1000,identicalDisplayText:true,reference:sample(true),optimized:sample(false),guestModules:guest,deferredModules:deferred,deferredRawBytes:deferred.reduce((sum,file)=>sum+readFileSync(join('public',file)).length,0),deferredEditorStylesheetBytes:readFileSync('public/whiteboard.css').length,notes:'CPU timing compares exact pre-change date calls with current formatters. Deferred module bytes use current source files and the eager-loading reference graph; they are not measured browser transfer bytes or load times.'};
writeFileSync('data/performance-render-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

import {readFileSync, existsSync, statSync, readdirSync} from 'node:fs';
import {resolve, dirname, relative, sep} from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
let failed=false;
const fail=message=>{failed=true;console.error(`✗ ${message}`);};
const source=file=>readFileSync(resolve(root,file),'utf8');
function words(text){
  return (text.replace(/^>.*$/gm,'').replace(/^#{1,6} .*$/gm,'')
    .replace(/```[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)||[]).length;
}
const ranges=[['README.md',400,600],['PROCESS.md',900,1100],['research-note.md',600,800],
  ...[8,9,10].map(n=>[`reflections/crit-${n}.md`,150,300])];
for(const [file,min,max] of ranges){
  if(!existsSync(resolve(root,file))){fail(`Missing ${file}`);continue;}
  const text=source(file),argument=file==='research-note.md'?text.split(/^## References\s*$/m)[0]:text;
  const count=words(argument);
  if(count<min||count>max)fail(`${file}: ${count} words, editorial target ${min}–${max}`);
  else console.log(`✓ ${file}: ${count} words`);
}
function markdownFiles(directory,includeArchive=false){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=resolve(directory,entry.name);
    if(entry.isDirectory())return (entry.name==='archive'&&!includeArchive)||entry.name==='screenshots'?[]:markdownFiles(path,includeArchive);
    return entry.name.endsWith('.md')?[path]:[];
  });
}
const docs=[...ranges.map(([file])=>resolve(root,file)),resolve(root,'CLAUDE.md'),...markdownFiles(resolve(root,'docs'))];
for(const file of docs){
  if(!existsSync(file))continue;
  const text=readFileSync(file,'utf8');
  for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
    const target=match[1].trim().replace(/^<|>$/g,'');
    if(/^(?:https?:|mailto:|#|\/)/i.test(target))continue;
    const path=resolve(dirname(file),decodeURIComponent(target.split('#')[0]));
    const rel=relative(root,path);
    if(rel.startsWith('..'+sep)||rel==='..'||!existsSync(path))fail(`${relative(root,file)}: missing/outside local reference ${target}`);
    else if(match[0].startsWith('!')&&!statSync(path).isFile())fail(`Image target is not a file: ${target}`);
  }
}
console.log('✓ Local references checked (external link validity requires source review)');
const languageDocs=new Set([...docs,...markdownFiles(resolve(root,'docs'),true),...markdownFiles(resolve(root,'data'))]);
for(const file of languageDocs){
  if(existsSync(file)&&/\p{Script=Han}/u.test(readFileSync(file,'utf8')))fail(`${relative(root,file)}: translate Chinese text into English`);
}
console.log('✓ English-only document text checked, including archived notes and source records');
const note=source('research-note.md');
if(!/^## References\s*$/m.test(note))fail('Research note needs separate references');
for(const file of ['PROCESS.md','reflections/crit-8.md','reflections/crit-9.md','reflections/crit-10.md','research-note.md']){
  if(!/AI-assisted|AI assistance/i.test(source(file)))console.warn(`! ${file}: review AI-use attribution`);
}
try{
  const count=Number(execFileSync('git',['rev-list','--count','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());
  if(count<=1)console.warn('! Only the initial commit exists: working-file evidence is not incremental process history.');
}catch{console.warn('! Git history could not be audited in this environment.');}
console.warn('! Mechanical success does not establish student authorship, completed crits or submission readiness.');
if(failed)process.exitCode=1;

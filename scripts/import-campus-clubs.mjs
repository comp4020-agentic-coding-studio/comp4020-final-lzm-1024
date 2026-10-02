// Explicit refresh of public directory references. No accounts, memberships or events are imported.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const sources={
  usyd:{name:'USU clubs directory',url:'https://usu.edu.au/clubs/'},
  unsw:{name:'Arc UNSW clubs directory',url:'https://www.arc.unsw.edu.au/clubs/find-a-club'},
  unimelb:{name:'UMSU clubs directory',url:'https://umsu.unimelb.edu.au/buddy-up/clubs/clubs-listing/'}
};
async function document(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
  // Parse markup only; source scripts and resources never run.
  return new JSDOM(await response.text(),{virtualConsole:new VirtualConsole()}).window.document;
}
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
function profile(href,base,origin){const url=new URL(href,base);if(url.protocol!=='https:'||url.origin!==origin)throw new Error('Unexpected public profile origin');return url.href;}
function merge(clubs,club){
  const previous=clubs.get(club.id);
  if(previous){if(previous.name!==club.name||previous.profileUrl!==club.profileUrl)throw new Error('Conflicting club identity');previous.categories=[...new Set([...previous.categories,...club.categories])];}
  else clubs.set(club.id,club);
}
async function sydney(){
  const d=await document(sources.usyd.url),clubs=new Map();
  const groups=d.querySelectorAll('[class*="ClubList-module--accordionRoot--"]');
  for(const group of groups){
    const category=clean(group.querySelector('[class*="accordionTitle--"]')?.textContent);
    if(!category)throw new Error('USU category missing');
    for(const a of group.querySelectorAll('a[class*="clubName--"]')){
      const profileUrl=profile(a.getAttribute('href'),sources.usyd.url,'https://usu.edu.au');
      if(!/^\/clubs\/[^/]+\/?$/.test(new URL(profileUrl).pathname))throw new Error('Invalid USU club profile');
      const slug=new URL(profileUrl).pathname.split('/').filter(Boolean).at(-1);
      merge(clubs,{id:`usu-${slug}`,universityId:'usyd',name:clean(a.textContent),categories:[category],profileUrl,imageUrl:''});
    }
  }
  if(clubs.size<250||groups.length<5)throw new Error('USU list appears incomplete');
  return {clubs:[...clubs.values()]};
}
async function melbourne(){
  const d=await document(sources.unimelb.url),clubs=new Map();
  for(const row of d.querySelectorAll('li[data-msl-organisation-id]')){
    const a=row.querySelector('a.msl-gl-link');if(!a)throw new Error('UMSU club profile missing');
    const profileUrl=profile(a.getAttribute('href'),sources.unimelb.url,'https://umsu.unimelb.edu.au');
    if(!new URL(profileUrl).pathname.startsWith('/buddy-up/clubs/clubs-listing/join/'))throw new Error('Invalid UMSU club profile');
    const categories=[...row.querySelectorAll('.msl-gl-attribute')].map(e=>clean(e.textContent));
    merge(clubs,{id:`umsu-${row.getAttribute('data-msl-grouping-id')}`,universityId:'unimelb',name:clean(a.textContent),categories,keywords:clean(row.getAttribute('data-msl-keywords')),profileUrl,imageUrl:''});
  }
  if(clubs.size<200)throw new Error('UMSU list appears incomplete');
  return {clubs:[...clubs.values()]};
}
async function unsw(){
  const d=await document(sources.unsw.url);
  const embedded=d.querySelector('iframe[src*="campus.hellorubric.com/search"]')?.getAttribute('src');
  if(!embedded)throw new Error('Arc public directory embed missing');
  const embed=new URL(embedded);
  if(embed.origin!=='https://campus.hellorubric.com'||embed.searchParams.get('universityid')!=='5')throw new Error('Arc embed is no longer scoped to UNSW');
  async function page(offset,category){
    const details={firstCall:offset===0,sortType:'itemName',desiredType:'societies',limit:12,offset,sortDirection:'asc',searchQuery:'',iframe:true,countryCode:'AU',state:embed.searchParams.get('state'),selectedUniversityId:'5',currentUrl:embed.href,device:'web_portal',version:4,...(category?{filterClubType:category}:{})};
    const response=await fetch('https://api.hellorubric.com',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({endpoint:'getUnifiedSearch',details:JSON.stringify(details)}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Arc directory: HTTP ${response.status}`);
    const result=await response.json();
    if(result.success!==true||!Array.isArray(result.results)||String(result.selectedUniversityId)!=='5')throw new Error('Invalid UNSW directory response');
    return result;
  }
  async function collect(category,initial){
    let result=initial||await page(0,category);const rows=[...result.results],total=Number(result.totalItemCount);
    if(!Number.isSafeInteger(total)||total<0)throw new Error('Invalid Arc total');
    while(rows.length<total){result=await page(rows.length,category);if(Number(result.totalItemCount)!==total||!result.results.length)throw new Error('Arc directory changed during import');rows.push(...result.results);}
    if(rows.length!==total||new Set(rows.map(r=>String(r.societyid))).size!==total)throw new Error('Incomplete or duplicate Arc directory');
    return rows;
  }
  const first=await page(0),rows=await collect(undefined,first),clubs=new Map();
  for(const row of rows){
    if(row.subtitle!=='University of New South Wales'||!/^\d+$/.test(String(row.societyid))||row.isUnionItem)throw new Error('Unexpected Arc club identity');
    const profileUrl=profile(row.destination,embed.href,'https://campus.hellorubric.com');
    if(new URL(profileUrl).searchParams.get('s')!==String(row.societyid))throw new Error('Arc profile identity mismatch');
    let imageUrl='';try{const image=new URL(row.image);if(image.protocol==='https:'&&!/default|placeholder/i.test(image.pathname))imageUrl=image.href;}catch{}
    merge(clubs,{id:`arc-${row.societyid}`,universityId:'unsw',name:clean(row.title),categories:[],profileUrl,imageUrl});
  }
  if(clubs.size<250||!Array.isArray(first.society_club_types)||first.society_club_types.length<5)throw new Error('Arc list appears incomplete');
  console.log(`UNSW: read ${clubs.size} clubs; checking categories.`);
  for(let offset=0;offset<first.society_club_types.length;offset+=3){
    const categories=first.society_club_types.slice(offset,offset+3);
    const results=await Promise.allSettled(categories.map(category=>collect(category)));
    for(let i=0;i<results.length;i++){
      if(results[i].status==='rejected')throw results[i].reason;
      for(const row of results[i].value){const club=clubs.get(String(`arc-${row.societyid}`));if(!club)throw new Error('Arc categories changed during import');if(!club.categories.includes(categories[i]))club.categories.push(categories[i]);}
      console.log(`UNSW ${categories[i]}: ${results[i].value.length}`);
    }
  }
  for(const club of clubs.values())if(!club.categories.length)club.categories.push('Uncategorised');
  return {embeddedUrl:embed.href,clubs:[...clubs.values()]};
}
const requested=process.argv.slice(2),campuses=requested.length?requested:['usyd','unsw','unimelb'];
if(new Set(campuses).size!==campuses.length||campuses.some(c=>!Object.hasOwn(sources,c)))throw new Error('Choose usyd, unsw or unimelb');
const importers={usyd:sydney,unsw,unimelb:melbourne},snapshots=[];
for(const universityId of campuses){
  const result=await importers[universityId]();
  for(const club of result.clubs)if(!club.name||!club.categories.length||club.categories.some(c=>!c)||!club.id||club.name.endsWith('...'))throw new Error('Incomplete public club metadata');
  const snapshot={universityId,sourceName:sources[universityId].name,sourceUrl:sources[universityId].url,retrievedAt:new Date().toISOString(),...result,clubs:result.clubs.sort((a,b)=>a.name.localeCompare(b.name,'en-AU'))};
  snapshots.push(snapshot);console.log(`${universityId}: validated ${snapshot.clubs.length} unique clubs, ${new Set(snapshot.clubs.flatMap(c=>c.categories)).size} categories.`);
}
// All selected sources must validate before any saved snapshot is replaced.
mkdirSync('data',{recursive:true});
for(const snapshot of snapshots){const path=`data/${snapshot.universityId}-clubs.json`;writeFileSync(`${path}.tmp`,JSON.stringify(snapshot,null,2)+'\n');renameSync(`${path}.tmp`,path);}
console.log('Saved complete public directory snapshots.');

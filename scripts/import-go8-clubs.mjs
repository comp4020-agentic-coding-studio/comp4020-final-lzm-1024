// Explicit refresh of the four additional campuses' public directories.
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const sources={
  monash:{name:'MSA Clayton clubs directory',url:'https://clubs.msa.monash.edu/joinnow/clubs-and-societies/',min:100},
  uq:{name:'UQ Union clubs directory',url:'https://uqu.com.au/clubs-and-societies/',min:200},
  uwa:{name:'UWA Student Guild clubs directory',url:'https://www.uwastudentguild.com/clubs',min:120},
  adelaide:{name:'AUSA clubs directory',url:'https://www.ausaadelaide.com.au/community/clubs-societies/clubslist/',min:150}
};
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
async function document(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Directory HTTP ${r.status}: ${url}`);return new JSDOM(await r.text(),{virtualConsole:new VirtualConsole()}).window.document;}
function profile(href,base,origin){const u=new URL(href,base);if(u.protocol!=='https:'||u.origin!==origin)throw Error('Unexpected profile origin');return u.href;}
async function msl(campus){
  const source=sources[campus],d=await document(source.url),origin=new URL(source.url).origin,clubs=[];
  for(const row of d.querySelectorAll('li[data-msl-organisation-id]')){
    const a=row.querySelector('a.msl-gl-link');if(!a)throw Error('Missing MSL club link');
    const profileUrl=profile(a.getAttribute('href'),source.url,origin);if(!new URL(profileUrl).pathname.startsWith('/organisation/'))throw Error('Unexpected MSL profile path');
    const categories=[...row.querySelectorAll('.msl-gl-attribute')].map(x=>clean(x.textContent));
    clubs.push({id:`${campus==='monash'?'msa':'ausa'}-${row.dataset.mslGroupingId}`,universityId:campus,name:clean(a.textContent),categories,profileUrl,imageUrl:''});
  }
  if(d.querySelector('.msl-paging a[rel="next"]'))throw Error('MSL directory became paginated');
  return {clubs};
}
async function uwa(){
  const source=sources.uwa,origin=new URL(source.url).origin,clubs=[],visited=new Set();let url=source.url;
  while(url){
    if(visited.has(url)||visited.size>=30)throw Error('Invalid UWA pagination');visited.add(url);
    const d=await document(url),rows=[...d.querySelectorAll('#clubCards .card--club')];if(!rows.length)throw Error('Empty UWA directory page');
    for(const row of rows){
      const title=row.querySelector('.card--club__title'),subtitle=row.querySelector('.card--club__subtitle'),a=title?.closest('a');if(!a)throw Error('Missing UWA club title');
      const profileUrl=profile(a.getAttribute('href'),source.url,origin),slug=new URL(profileUrl).pathname.split('/').filter(Boolean).at(-1);
      if(!new URL(profileUrl).pathname.startsWith('/clubs/'))throw Error('Unexpected UWA profile');
      const categories=clean(row.querySelector('.card--club__meta')?.textContent).split(',').map(clean).filter(Boolean),name=clean(subtitle?.textContent||title.textContent);
      const image=row.querySelector('.card--club__logo img');
      clubs.push({id:`uwa-${slug}`,universityId:'uwa',name,categories:categories.length?categories:['Uncategorised'],keywords:clean(title.textContent),profileUrl,imageUrl:image?profile(image.getAttribute('src'),source.url,origin):''});
    }
    const next=d.querySelector('.ajax-load-more a.ajax-infinity-page-link');url=next?profile(next.getAttribute('href'),source.url,origin):'';
    if(url&&new URL(url).pathname!=='/clubs')throw Error('Unexpected UWA next page');
    console.log(`UWA: ${clubs.length} clubs, ${visited.size} pages.`);
  }
  return {pageCount:visited.size,clubs};
}
async function uq(){
  const d=await document(sources.uq.url),embedded=d.querySelector('iframe[src*="campus.hellorubric.com/search"]')?.getAttribute('src');if(!embedded)throw Error('UQU embed missing');
  const embed=new URL(embedded);if(embed.origin!=='https://campus.hellorubric.com'||embed.searchParams.get('universityid')!=='12')throw Error('Unexpected UQ directory scope');
  async function page(offset,category){
    const details={firstCall:offset===0,sortType:'itemName',desiredType:'societies',limit:12,offset,sortDirection:'asc',searchQuery:'',iframe:true,countryCode:'AU',state:embed.searchParams.get('state'),selectedUniversityId:'12',currentUrl:embed.href,device:'web_portal',version:4,...(category?{filterClubType:category}:{})};
    const r=await fetch('https://api.hellorubric.com',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({endpoint:'getUnifiedSearch',details:JSON.stringify(details)}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`UQU API HTTP ${r.status}`);
    const j=await r.json();if(j.success!==true||String(j.selectedUniversityId)!=='12'||!Array.isArray(j.results))throw Error('Unexpected UQU response');return j;
  }
  async function collect(category,first){let j=first||await page(0,category),total=Number(j.totalItemCount),rows=[...j.results];if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid UQU total');while(rows.length<total){j=await page(rows.length,category);if(Number(j.totalItemCount)!==total||!j.results.length)throw Error('UQU list changed while importing');rows.push(...j.results);}if(rows.length!==total||new Set(rows.map(x=>String(x.societyid))).size!==total)throw Error('Incomplete UQU page sequence');return rows;}
  const first=await page(0),rows=await collect(undefined,first),clubs=new Map();
  for(const row of rows){
    if(row.subtitle!=='University of Queensland'||row.isUnionItem||!/^\d+$/.test(String(row.societyid)))throw Error('Unexpected UQ club identity');
    const profileUrl=profile(row.destination,embed.href,embed.origin);if(new URL(profileUrl).searchParams.get('s')!==String(row.societyid))throw Error('UQ profile identity mismatch');
    let imageUrl='';try{const image=new URL(row.image);if(image.protocol==='https:'&&!/default|placeholder/i.test(image.pathname))imageUrl=image.href;}catch{}
    clubs.set(String(row.societyid),{id:`uqu-${row.societyid}`,universityId:'uq',name:clean(row.title),categories:[],profileUrl,imageUrl});
  }
  if(!Array.isArray(first.society_club_types)||first.society_club_types.length<5)throw Error('Missing UQU source categories');
  for(let offset=0;offset<first.society_club_types.length;offset+=3){
    const cats=first.society_club_types.slice(offset,offset+3),results=await Promise.allSettled(cats.map(c=>collect(c)));
    for(let i=0;i<results.length;i++){if(results[i].status==='rejected')throw results[i].reason;for(const row of results[i].value){const club=clubs.get(String(row.societyid));if(!club)throw Error('UQU category identity missing');club.categories.push(cats[i]);}console.log(`UQ ${cats[i]}: ${results[i].value.length}`);}
  }
  for(const club of clubs.values())if(!club.categories.length)club.categories.push('Uncategorised');
  return {embeddedUrl:embed.href,clubs:[...clubs.values()]};
}
const campuses=process.argv.slice(2);if(!campuses.length)campuses.push(...Object.keys(sources));if(new Set(campuses).size!==campuses.length||campuses.some(c=>!sources[c]))throw Error('Choose monash, uq, uwa or adelaide');
const snapshots=[];
for(const campus of campuses){
  const result=await (campus==='uq'?uq():campus==='uwa'?uwa():msl(campus));
  if(result.clubs.length<sources[campus].min||new Set(result.clubs.map(c=>c.id)).size!==result.clubs.length||new Set(result.clubs.map(c=>c.profileUrl)).size!==result.clubs.length)throw Error(`Incomplete or duplicate ${campus} directory`);
  for(const club of result.clubs)if(!club.name||club.name.endsWith('...')||!club.categories.length||club.categories.some(c=>!c)||club.id.endsWith('undefined'))throw Error('Incomplete club metadata');
  snapshots.push({universityId:campus,sourceName:sources[campus].name,sourceUrl:sources[campus].url,retrievedAt:new Date().toISOString(),...result,clubs:result.clubs.sort((a,b)=>a.name.localeCompare(b.name,'en-AU'))});console.log(`${campus}: validated ${result.clubs.length} clubs.`);
}
// Validate every selected source before replacing any snapshot.
mkdirSync('data',{recursive:true});for(const snapshot of snapshots){const file=`data/${snapshot.universityId}-clubs.json`;writeFileSync(file+'.tmp',JSON.stringify(snapshot,null,2)+'\n');renameSync(file+'.tmp',file);}

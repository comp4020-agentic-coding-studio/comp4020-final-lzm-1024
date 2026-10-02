// Refresh the public directory only when explicitly requested; never import accounts or events.
import { mkdirSync, writeFileSync } from 'node:fs';

const sourceUrl='https://anusa.com.au/clubs/clubs-list/';
const embeddedUrl='https://campus.hellorubric.com/search?country=AU&state=NSW&type=societies&universityid=1&iframe=true';
async function page(offset,category) {
  const details={firstCall:offset===0,sortType:'itemName',desiredType:'societies',limit:12,offset,sortDirection:'asc',searchQuery:'',iframe:true,countryCode:'AU',state:'NSW',selectedUniversityId:'1',currentUrl:embeddedUrl,device:'web_portal',version:4,...(category?{filterClubType:category}:{})};
  const response=await fetch('https://api.hellorubric.com',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({endpoint:'getUnifiedSearch',details:JSON.stringify(details)}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Directory returned HTTP ${response.status}`);
  const result=await response.json();if(result.success!==true||!Array.isArray(result.results))throw new Error('Invalid directory response');
  if(String(result.selectedUniversityId)!=='1')throw new Error('Directory did not remain scoped to ANU');return result;
}
async function collect(category,initial) {
  let result=initial||await page(0,category);const items=[...result.results],total=Number(result.totalItemCount);
  while(items.length<total){result=await page(items.length,category);if(!result.results.length)throw new Error('Directory ended before its advertised total');items.push(...result.results);}
  if(items.length!==total)throw new Error('Directory count changed during import');return items;
}
const first=await page(0);
const rows=await collect(undefined,first),clubs=new Map();
for(const row of rows){
  if(row.subtitle!=='Australian National University')throw new Error('A club belongs to another university');
  const profileUrl=new URL(row.destination,'https://campus.hellorubric.com').href;
  if(new URL(profileUrl).origin!=='https://campus.hellorubric.com'||!/^\d+$/.test(String(row.societyid)))throw new Error('Invalid public club identity');
  if(clubs.has(String(row.societyid)))throw new Error('Duplicate public club identity');
  let imageUrl='';try{const image=new URL(row.image);if(image.protocol==='https:'&&!/default|placeholder/i.test(image.pathname))imageUrl=image.href;}catch{}
  clubs.set(String(row.societyid),{id:`anusa-${row.societyid}`,universityId:'anu',name:row.title.trim(),categories:[],profileUrl,imageUrl});
}
console.log(`Read ${clubs.size} ANU clubs; checking source categories.`);
const categories=first.society_club_types;
for(let offset=0;offset<categories.length;offset+=4){
  const batch=categories.slice(offset,offset+4);
  const results=await Promise.allSettled(batch.map(category=>collect(category)));
  for(let index=0;index<results.length;index++){
    const result=results[index];if(result.status==='rejected')throw result.reason;
    for(const row of result.value){const club=clubs.get(String(row.societyid));if(!club)throw new Error('Directory changed during category import');if(!club.categories.includes(batch[index]))club.categories.push(batch[index]);}
    console.log(`${batch[index]}: ${result.value.length}`);
  }
}
for(const club of clubs.values())if(!club.categories.length)club.categories.push('Uncategorised');
const data={universityId:'anu',sourceName:'ANUSA clubs directory',sourceUrl,embeddedUrl,retrievedAt:new Date().toISOString(),clubs:[...clubs.values()].sort((a,b)=>a.name.localeCompare(b.name,'en-AU'))};
mkdirSync('data',{recursive:true});writeFileSync('data/anu-clubs.json',JSON.stringify(data,null,2)+'\n');
console.log(`Saved ${data.clubs.length} clubs with full names and public profile links.`);

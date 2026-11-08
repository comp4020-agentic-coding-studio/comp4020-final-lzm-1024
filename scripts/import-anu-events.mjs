// Imports upcoming public events from the ANU events calendar into data/anu-events.json.
// The server lists them on the ANU wall as imported listings with their official link
// (campus-events.mjs). Only facts are kept: title, time, venue, a one-sentence summary
// and the source URL. Event images are not copied; CampusWall draws its own poster.
//
// Usage: node scripts/import-anu-events.mjs [days=60]
// robots.txt allows /events; requests are sequential with a pause between them.
import {writeFileSync,renameSync} from 'node:fs';

const base='https://www.anu.edu.au',days=Number(process.argv[2]||60);
const headers={'user-agent':'CampusWall-importer/1.0 (ANU student course project; one request at a time)'};
// Shorten at a word boundary with an ellipsis, never mid-word.
const clip=(value,max)=>value.length<=max?value:value.slice(0,max).replace(/\s+\S*$/,'').replace(/[\s,:;–—-]+$/,'')+'…';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#039;|&#39;|&apos;/g,'’').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&ndash;/g,'–').replace(/&mdash;/g,'—');
const text=html=>decode(html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
async function get(path){const r=await fetch(path.startsWith('http')?path:base+path,{headers});if(!r.ok)throw new Error(`${r.status} for ${path}`);return r.text();}

// Canberra local wall-clock times, as the pages show them.
const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
function parseTime(fragment){
  const m=/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4}),?(?: (\d{1,2}):(\d{2}) ?(am|pm))?/i.exec(fragment);if(!m)return null;
  const date=`${m[3]}-${String(months[m[2].slice(0,3)]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if(!m[4])return {date,time:''};
  let hour=Number(m[4])%12;if(m[6].toLowerCase()==='pm')hour+=12;
  return {date,time:`${String(hour).padStart(2,'0')}:${m[5]}`};
}
const canberraToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(new Date());
const addDays=(date,n)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

// A keyword guess at CampusWall's wall categories; Other when nothing fits.
const categoryRules=[
  ['Career',/\b(career|employ|internship|graduate (?:study|program)|postgraduate study|explore postgraduate|scholarship|information session|open day|industry|recruit)/i],
  ['Arts',/\b(exhibition|concert|recital|music|film|screening|theatre|theater|art\b|arts\b|gallery|performance|poetry|book launch|meet the author|author|choir|dance)/i],
  ['Sport',/\b(sport|run\b|running|fitness|yoga|swim|cycling|football|basketball|netball)/i],
  ['Academic',/\b(lecture|seminar|talk|symposium|conference|workshop|research|phd|thesis|colloquium|forum|masterclass|panel|webinar|discussion|roundtable|oration|update \d{4}|showcase)/i],
  ['Social',/\b(festival|celebration|party|market|picnic|morning tea|wellbeing|meet ?up)/i]
];
// Most events on the central calendar are public talks, so Academic is the fallback.
const category=t=>categoryRules.find(([,re])=>re.test(t))?.[0]||'Academic';

// 1. Walk the month calendar from the current month until the window is covered.
const today=canberraToday(),until=addDays(today,days),listed=new Map();
let page='/events/calendar',guard=0;
while(page&&guard++<4){
  const html=await get(page);
  for(const m of html.matchAll(/<a href="(\/events\/[a-z0-9-]+)" hreflang="en">([^<]+)<\/a><\/div><div>([^<]+)<\/div>/g)){
    const [,path,title,range]=m;if(['/events/calendar','/events/all-videos'].includes(path))continue;
    const start=parseTime(range.split(' - ')[0]);if(start&&!listed.has(path))listed.set(path,{title:decode(title).trim(),start});
  }
  const caption=/<caption>([^<]+)<\/caption>/.exec(html)?.[1]||'';
  const next=/<li class="pager__item pager__next"><a href="([^"]+)"/.exec(html)?.[1];
  const lastShown=[...html.matchAll(/data-calendar-view-day="(\d+)" data-calendar-view-month="(\d+)" data-calendar-view-year="(\d+)"/g)].pop();
  console.log(`Read ${caption||page}: ${listed.size} listings so far`);
  if(!next||!lastShown||`20${lastShown[3]}-${lastShown[2].padStart(2,'0')}-${lastShown[1].padStart(2,'0')}`>=until)break;
  page='/events/calendar'+decode(next);await pause(600);
}

// 2. Keep events starting in the window and read each page for venue and summary.
const wanted=[...listed].filter(([,e])=>e.start.date>=today&&e.start.date<=until).sort((a,b)=>(a[1].start.date+a[1].start.time).localeCompare(b[1].start.date+b[1].start.time));
console.log(`${wanted.length} events start between ${today} and ${until}`);
const events=[];
for(const [path,listing] of wanted){
  await pause(500);
  let html;try{html=await get(path);}catch(error){console.warn('skipped',path,error.message);continue;}
  const meta=name=>decode(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html)?.[1]||'').trim();
  const section=label=>{const i=html.indexOf(`>${label}<`);if(i<0)return '';const after=text(html.slice(i+1,i+1500)).replace(new RegExp(`^${label}\\s*`),'');return after.split(/\s(?:Date and Times|Location|Speakers?|Contacts?|Register|Event series|Cost|Accessibility|Share)\b/)[0].trim();};
  const when=section('Date and Times'),[startText,endText='']=when.split(' - ');
  const start=parseTime(startText)||listing.start,end=parseTime(endText);
  const title=clip(meta('og:title')||listing.title,99);
  const summary=clip(meta('description').replace(/\s+/g,' ').replace(/([.!?])([A-Z])/g,'$1 $2'),279);
  const location=section('Location').replace(/\s*,\s*/g,', ').slice(0,180);
  // The calendar sometimes lists one session twice (same time, place and kind, or same title).
  const kind=category(`${title} ${summary}`);
  if(events.some(e=>e.date===start.date&&e.time===start.time&&(e.title===title||(e.location===location&&e.category===kind)))){console.log('  duplicate skipped:',title);continue;}
  events.push({url:base+path,title,date:start.date,time:start.time,endDate:end?.date||'',endTime:end?.time||'',location,summary,category:kind});
  console.log(`  ${start.date} ${start.time||'all day'}  ${title}`);
}

const snapshot={universityId:'anu',sourceName:'ANU events calendar',sourceUrl:base+'/events/calendar',retrievedAt:new Date().toISOString(),window:{from:today,to:until},events};
writeFileSync('data/anu-events.json.tmp',JSON.stringify(snapshot,null,1)+'\n');renameSync('data/anu-events.json.tmp','data/anu-events.json');
console.log(`Wrote data/anu-events.json with ${events.length} events.`);

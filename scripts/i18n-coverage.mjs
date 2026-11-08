// Finds English interface text in the front-end modules and server messages that a
// language catalogue would not translate, using the same lookup rules as
// public/i18n.js translate(): exact or lower-case key, a key inside decorative
// arrows and stars, a {0} pattern, or " · "-separated pieces.
//
// Usage: node scripts/i18n-coverage.mjs [language=zh-CN] [--json]
import {readFileSync,readdirSync} from 'node:fs';

export const sourceFiles=[
  ...readdirSync('public').filter(f=>f.endsWith('.js')&&!['i18n.js'].includes(f)).map(f=>'public/'+f),
  'server.mjs','community.mjs','messaging.mjs','profiles.mjs','watch.mjs','games.mjs','game-engine.mjs','voice-calls.mjs','moderation.mjs','account-security.mjs','message-files.mjs','blocks.mjs','translation.mjs','poster-store.mjs'
];

// Strings that look like prose but are not interface text: identifiers, technical
// names, brands, data formats and developer-only messages.
const technical=/^(?:[a-z][a-zA-Z0-9]*|[A-Z][a-zA-Z]+(?:Error|Observer|Event|Exception)|[A-Z_]{2,}|Escape|Enter|Tab|Backspace|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|CampusWall|OpenStreetMap|YouTube|Leaflet|MP4|WebM|HLS|ICS|QR|TURN|STUN|MyMemory|ANU|TEST|TEST EVENT|Monash|Sydney|Brisbane|Perth|Canberra|Adelaide|Darwin|Melbourne|Hobart|Australia\/[A-Za-z_]+)$/;
const codeish=/:\/\/|=>|\$\{|==|&&|\|\||[=+]|,\S|xMidYMid|^[A-Z][a-z]?$|\(\)|;\s*$|^\s*[.#[]|\.(js|css|svg|png|webp|json|html)\b|\/api\/|^\/|\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|PRAGMA)\b|^[\w-]+:[\w-]|^[a-z-]+(\s[a-z-]+)*$|^[\w.-]+\/[\w.+-]+$|^#[0-9a-f]{3,8}$|\\u|^\w+\(|[<>{}]|^\d|^[^A-Za-z]*$/;

// Text that is deliberately not translated, with the reason. Everything else the
// scan finds must have an entry in every catalogue.
export const notInterface=new Map(Object.entries({
  // Protocol, storage and browser tokens.
  'Accept-Encoding':'HTTP header','; Secure':'cookie attribute','private, no-store':'cache header','Cookie':'HTTP header','p.updatedAt DESC':'SQL','CampusWall listening':'server log','BEGIN IMMEDIATE':'SQL','? AND startsAt':'SQL','? AND authorId':'SQL','? AND passwordHash':'SQL',
  '(prefers-reduced-motion: reduce)':'media query','(prefers-color-scheme: dark)':'media query','(hover:hover) and (pointer:fine)':'media query','-4px 0':'CSS value','-2px 0':'CSS value','-20% 0px -70% 0px':'observer margin',
  'XXXX-XXXX-XXXX-XXXX':'code format','ABCDEFGHJKLMNPQRSTUVWXYZ23456789':'code alphabet','Invalid VOICE_ICE_SERVERS':'operator setting error','ManagedMediaSource':'browser API','Invalid Date':'JavaScript value','Invalid result':'translation provider internal',
  'UID:':'calendar file field','DTSTAMP:':'calendar file field','DTSTART:':'calendar file field','DTEND:':'calendar file field','SUMMARY:':'calendar file field',
  'log.scrollHeight-log.scrollTop-log.clientHeight':'code fragment',"':!t.closed?'":'code fragment',"NOISE.':'Good things":'code fragment','label.length':'code fragment',"':user?'":'code fragment',
  '@username':'example handle','you@example.com':'example address','friend@example.com':'example address',
  // Words passed into server helpers that build the visible sentence themselves.
  'Duration':'label fragment','Ticket':'label fragment','Announcement':'label fragment','Post':'label fragment','Student':'label fragment','User':'label fragment','Note':'label fragment','Report target':'label fragment','Screening title':'label fragment','Video title':'label fragment','Cursor':'label fragment','· application':'label fragment',
  // Stored or artwork text that stays English by the project rules.
  'Deleted account':'stored name of deleted accounts, quoted as-is in every language','· TEST EVENT':'TEST disclosure stays English',
  'FICTIONAL ACTIVITY / REAL VENUE / ILLUSTRATIVE PHOTO':'TEST disclosure inside poster artwork',
  'Your next campus moment':'poster starter text (artwork)','Your campus, your place':'poster starter text (artwork)','Your big idea':'whiteboard starter text (artwork)','Add your thoughts…':'whiteboard starter text (artwork)','Shared canvas design':'canvas starter text (artwork)','Event image':'image description inside artwork',
  'TO DO':'whiteboard template text placed on the board','IN PROGRESS':'whiteboard template text placed on the board','WHAT IF…':'whiteboard template text placed on the board','LET’S TRY…':'whiteboard template text placed on the board','NEXT STEPS':'whiteboard template text placed on the board'
}));

export async function catalogue(language='zh-CN'){
  const entries=(await import(new URL(`../public/locales/${language}.js`,import.meta.url))).default;
  const patterns=Object.keys(entries).filter(k=>/\{\d+\}/.test(k)).map(k=>new RegExp('^'+k.split(/\{\d+\}/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)')+'$','i'));
  const prefixes=Object.keys(entries).filter(k=>k.includes(' · ')).map(k=>k.slice(0,k.indexOf(' · ')));
  // A piece is covered by its own key, or by a full " · " pattern that starts with it.
  const has=t=>Object.hasOwn(entries,t)||Object.hasOwn(entries,t.toLowerCase())||prefixes.includes(t);
  return function translatable(text){
    const t=text.trim();if(has(t))return true;
    const d=/^([★☆✦✧✳☺☎▣▶♬←→↗↙↘↶↷↑↓⌖▤⚠△●○◉◐◎⚙✉♡♜▦＋+—–\s]*)(.*?)([↗↙↘←→↑↓✓★☆✦＋\s]*)$/u.exec(t);
    if(d?.[2]&&has(d[2]))return true;
    if(patterns.some(r=>r.test(t)))return true;
    if(t.includes(' · ')&&t.split(' · ').every(p=>has(p)||!/[a-z]{2}/i.test(p)))return true;
    return false;
  };
}

export function candidates(file){
  const source=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  const found=new Set();
  const add=raw=>{const t=raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();if(t.length<2||!/[A-Za-z]{2}/.test(t)||technical.test(t)||codeish.test(t))return;found.add(t);};
  // Quoted strings that read like interface text: start with a capital or contain a space.
  for(const m of source.matchAll(/'((?:[^'\\\n]|\\.){2,300})'/g)){const t=m[1].replace(/\\'/g,"'");if(/^[A-Z]/.test(t)||/ /.test(t))add(t);}
  // Visible text between tags in HTML templates.
  for(const m of source.matchAll(/>([^<>`]{2,300})</g)){
    if(!m[1].includes('${')){add(m[1]);continue;}
    // Fixed sentences joined to a value with " · " are separate translation pieces.
    for(const piece of m[1].replace(/\$\{[^}]*\}/g,'\u0000').split(/\s·\s/))if(!piece.includes('\u0000')&&/^[A-Z][a-z]/.test(piece.trim())&&/\s/.test(piece.trim()))add(piece);
  }
  // Translated attributes.
  for(const m of source.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"$<>]{2,200})"/g))add(m[1]);
  return found;
}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`||process.argv[1]?.endsWith('i18n-coverage.mjs')){
  const language=process.argv.find(a=>/^[a-z]{2}(-[A-Z]{2})?$/.test(a))||'zh-CN',asJson=process.argv.includes('--json');
  const translatable=await catalogue(language),missing=new Map();
  for(const file of sourceFiles)for(const text of candidates(file))if(!notInterface.has(text)&&!translatable(text))missing.set(text,[...(missing.get(text)||[]),file]);
  if(asJson)console.log(JSON.stringify(Object.fromEntries([...missing].map(([t,f])=>[t,f[0]])),null,1));
  else{for(const [text,files] of missing)console.log(`${files[0].padEnd(28)} ${text}`);console.log(`${missing.size} untranslated (${language})`);}
}

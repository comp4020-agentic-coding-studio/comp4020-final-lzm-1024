import {isActionName} from '../observability.mjs';
import {createInterface} from 'node:readline';

// Works with server stdout, the Fly terminal prefix, or Fly's JSON envelope.
// Render only projected fields; never echo an unrecognised input line.
export function decodeActionLog(line){
 let record;try{record=JSON.parse(line);}catch{const start=line.indexOf('{"schema":1');if(start<0)return null;try{record=JSON.parse(line.slice(start));}catch{return null;}}
 if(record?.message&&typeof record.message==='string')try{record=JSON.parse(record.message);}catch{return null;}
 if(record?.schema!==1||!['action','observability'].includes(record.event))return null;
 return record;
}
export function displayAction(record){
 const actor=/^(?:a_[a-f0-9]{20}|guest|system)$/.test(record.actor)?record.actor:'unknown';
 const action=isActionName(record.action)?record.action:'unknown';
 const outcome=['accepted','rejected','failed','degraded'].includes(record.outcome)?record.outcome:'unknown';
 const date=new Date(record.time),time=Number.isFinite(date.getTime())?date.toISOString().slice(11,23):'unknown';
 const resource=/^r_[a-f0-9]{20}$/.test(record.resource)?' '+record.resource:'';
 const revision=Number.isSafeInteger(record.revision)?' revision='+record.revision:'';
 const dropped=record.action==='logs.dropped'&&Number.isSafeInteger(record.count)?' count='+record.count:'';
 return `${time} ${actor} ${action} ${outcome}${resource}${revision}${dropped}`;
}
if(process.argv[1]?.endsWith('view-action-logs.mjs')){
 const lines=createInterface({input:process.stdin});console.log('CampusWall instruments — opaque identities; no private content');
 lines.on('line',line=>{const event=decodeActionLog(line);if(event)console.log(displayAction(event));});
}

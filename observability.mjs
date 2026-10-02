import {createHmac, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const operations={GET:'read',HEAD:'read',POST:'submit',PATCH:'edit',PUT:'edit',DELETE:'remove'};
const domains=new Set(['auth','drafts','posters','messages','users','profile','profiles','watch','games','community','chat','saved','clubs','universities']);
const steps=new Set(['me','login','logout','register','campus','avatar','fields','canvas','publish','unpublish','collaborators','image','comments','save','calendar','qr','search','conversations','messages','read','from-poster','rooms','move','rematch','join','leave','close','source','playback','chat','signal','accept','decline','cancel','mute','hangup','device','claim','friends','groups','teams','events','bookings','notifications','interests','feed','map','settings','check-in','members','invite','requests','notes','screenings','results','status','calls']);
const pages=new Set(['login','choose-campus','watch','community','messages','games','saved','my-posters','studio','people','readme']);
const campuses=new Set(['anu','usyd','unsw','unimelb','monash','uq','uwa','adelaide']);
const canvasActions=new Set(['init','add','patch','delete','reorder','settings']);
const channels=new Set(['whiteboard','chat','inbox','watch','games','community','wall']);
const actionNames=new Set(['unknown','page.view','websocket.connect','websocket.unknown','canvas.cursor','poster.editing','poster.edit','calls.tick','community.reminders','games.tick']);
for(const domain of [...domains,'calls','unknown'])for(const verb of [...new Set(Object.values(operations)),'unknown']){actionNames.add(domain+'.'+verb);for(const step of steps)actionNames.add(domain+'.'+step+'.'+verb);}
for(const channel of [...channels,'unknown'])for(const kind of ['connect','disconnect'])actionNames.add(channel+'.'+kind);
for(const kind of [...canvasActions,'unknown'])actionNames.add('canvas.'+kind);

// Classifications are derived only from bounded vocabulary. Never emit a raw URL,
// slug, search query, request body, error message, header or client correlation ID.
export function classifyHttp(path,method){
 const tokens=path.split('/').filter(Boolean),verb=operations[method]||'unknown';
 if(tokens[0]==='api'){
  if(tokens[1]==='health')return null;
  const domain=tokens[1]==='calls'?'calls':domains.has(tokens[1])?tokens[1]:'unknown';
  const step=tokens.slice(2).findLast(token=>steps.has(token));
  return {action:`${domain}${step?'.'+step:''}.${verb}`,resourceId:tokens.find(token=>uuid.test(token))};
 }
 if(path==='/'||pages.has(tokens[0])||campuses.has(tokens[0]))return {action:'page.view',resourceId:tokens.find(token=>uuid.test(token))};
 return null;
}

export function loadLogKey(dataDir){
 const file=join(dataDir,'.observability-key');
 try{const key=readFileSync(file);if(key.length!==32)throw Error('Invalid observability key');return key;}
 catch(error){if(error.code!=='ENOENT')throw error;const key=randomBytes(32);writeFileSync(file,key,{flag:'wx',mode:0o600});return key;}
}

// A slow log collector must not grow memory without bound or interrupt a write.
// Saturation is reported as an explicit aggregate, never as unbounded buffering.
export function createLogSink(stream,capacity=256){
 let blocked=false,failed=false,dropped=0;const queue=[];
 function emit(line){try{blocked=!stream.write(line+'\n');}catch{failed=true;queue.length=0;}}
 function drain(){blocked=false;while(queue.length&&!blocked&&!failed)emit(queue.shift());if(!blocked&&!failed&&dropped){const count=dropped;dropped=0;emit(JSON.stringify({schema:1,time:new Date().toISOString(),event:'observability',actor:'system',action:'logs.dropped',outcome:'degraded',count}));}}
 stream.on('drain',drain);stream.on('error',()=>{failed=true;queue.length=0;});
 return line=>{if(failed)return;if(blocked){if(queue.length<capacity)queue.push(line);else dropped++;}else emit(line);};
}

export const isActionName=value=>actionNames.has(value)||value==='logs.dropped';

export function createActionLogger({key,write}){
 let sequence=0;
 const opaque=(prefix,value)=>uuid.test(value||'')?prefix+'_'+createHmac('sha256',key).update(prefix+':'+value).digest('hex').slice(0,20):null;
 const safeAction=value=>actionNames.has(value)?value:'unknown';
 // Only the internal, preclassified action is accepted here. Input fields are
 // projected individually; unexpected properties never reach JSON output.
 function record({actorId,action,resourceId,transport='http',status=200,started,revision}){
  const code=Number.isInteger(status)&&status>=100&&status<=599?status:500;
  const event={schema:1,time:new Date().toISOString(),sequence:++sequence,event:'action',transport:transport==='websocket'?'websocket':'http',actor:actorId==='system'?'system':opaque('a',actorId)||'guest',action:safeAction(action),outcome:code>=500?'failed':code>=400?'rejected':'accepted',status:code};
  const resource=opaque('r',resourceId);if(resource)event.resource=resource;
  if(Number.isFinite(started))event.durationMs=Math.max(0,Math.round((performance.now()-started)*100)/100);
  if(Number.isSafeInteger(revision)&&revision>=0)event.revision=revision;
  write(JSON.stringify(event));return event;
 }
 function http(req,res){
  let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{return;}
  const classification=classifyHttp(path,req.method);if(!classification)return;
  const started=performance.now();let finished=false;
  const finish=status=>{if(finished)return;finished=true;record({...classification,actorId:req.observedActorId,status,started,revision:res.observedRevision});};
  res.once('finish',()=>finish(res.statusCode));res.once('close',()=>{if(!res.writableFinished)finish(499);});
 }
 function websocket(actorId,channel,resourceId,type,input,status,started,revision){
  const room=channels.has(channel)?channel:'unknown';
  const action=type==='connect'||type==='disconnect'?room+'.'+type:type==='canvas:operation'?'canvas.'+(canvasActions.has(input?.action)?input.action:'unknown'):type==='canvas:cursor'?'canvas.cursor':type==='poster:editing'?'poster.editing':type==='poster:update'?'poster.edit':'websocket.unknown';
  return record({actorId,action,resourceId,transport:'websocket',status,started,revision});
 }
 return {http,record,websocket};
}

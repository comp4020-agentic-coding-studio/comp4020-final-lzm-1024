import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createQueries} from './database.mjs';
import {designDefaults,designPresets} from './public/poster-design.js';

// Public university events imported by scripts/import-anu-events.mjs. They are listed
// under a source account that cannot sign in or receive messages, link to the official
// page, and keep their source and retrieval date. They never imply that CampusWall or a
// student organised the event, and they never replace a student's poster.
export const importers={anu:{id:'anu-events-calendar',name:'ANU events calendar',email:'anu-events@campuswall.invalid'}};

// CampusWall draws each listing with its own design: no images are copied.
const presetFor={Academic:'seminar',Arts:'gradient',Career:'club',Social:'social',Sport:'minimal',Other:'minimal'};
const looks=Object.fromEntries(Object.entries(presetFor).map(([category,preset])=>{const {id,name,note,...look}=designPresets.find(p=>p.id===preset);return [category,look];}));
const palettes=[['#1f3b4d','#f6efe3','#e2a84b'],['#f3ead8','#1d2b2f','#c4572f'],['#283a2f','#f1ecdf','#c9b458'],['#3b2340','#f7ece6','#e48b6a'],['#e9eef2','#132a3a','#2f7d9a'],['#fbe9d0','#3a2418','#d26a3c']];

function stableId(campus,url){const bytes=createHash('sha256').update(`campuswall-imported-event-v1:${campus}:${url}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}

export function importedContent(event,source,index){
  const look=looks[event.category]||looks.Other,[backgroundColour,textColour,accentColour]=palettes[index%palettes.length];
  const online=/virtual session|online/i.test(event.location);
  return {...designDefaults,...look,designVersion:'1',customColours:'on',backgroundColour,textColour,accentColour,
    title:event.title.slice(0,100),subtitle:'',date:event.date,time:event.time||'',location:(online?'Online':event.location||'See the official page').slice(0,180),
    description:event.summary.slice(0,2000),category:event.category,style:'ink',alignment:'left',heroImageUrl:'',organiser:'',eventUrl:event.url.slice(0,500),
    imported:{source:source.name,url:event.url,retrievedAt:source.retrievedAt}};
}

export function seedCampusEvents(db,{dataDir=new URL('./data/',import.meta.url),now=new Date()}={}){
  const {get,all,run}=createQueries(db),timestamp=now.toISOString();
  for(const [campus,account] of Object.entries(importers)){
    const file=new URL(`${campus}-events.json`,dataDir);if(!existsSync(file))continue;
    if(!get('SELECT 1 FROM universities WHERE id=?',campus))continue;
    const snapshot=JSON.parse(readFileSync(file,'utf8')),source={name:snapshot.sourceName,retrievedAt:snapshot.retrievedAt};
    db.exec('BEGIN IMMEDIATE');
    try{
      run('INSERT OR IGNORE INTO users (id,name,email,passwordHash,createdAt) VALUES (?,?,?,?,?)',account.id,account.name,account.email,'!disabled',timestamp);
      const listed=new Set();
      for(const [index,event] of snapshot.events.entries()){
        const id=stableId(campus,event.url),content=JSON.stringify(importedContent(event,source,index));listed.add(id);
        const existing=get('SELECT id,ownerId,status,publicData,removedAt FROM posters WHERE id=?',id);
        if(!existing){
          const base=`${campus}-calendar-${event.url.split('/').pop()}`.slice(0,90),slug=get('SELECT 1 FROM posters WHERE slug=?',base)?`${base}-${id.slice(0,8)}`:base;
          run('INSERT INTO posters (id,ownerId,universityId,slug,status,content,publicData,version,createdAt,updatedAt,publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,account.id,campus,slug,'PUBLISHED',content,content,0,timestamp,timestamp,timestamp);
        }else if(existing.ownerId===account.id&&!existing.removedAt&&(existing.status!=='PUBLISHED'||existing.publicData!==content)){
          // A refreshed snapshot updates the listing in place, keeping comments and saves.
          run("UPDATE posters SET status='PUBLISHED',content=?,publicData=?,version=version+1,updatedAt=?,publishedAt=COALESCE(publishedAt,?) WHERE id=?",content,content,timestamp,timestamp,id);
        }
      }
      // A future listing that left the official calendar is withdrawn; past ones stay as history.
      for(const p of all("SELECT id,publicData FROM posters WHERE ownerId=? AND universityId=? AND status='PUBLISHED'",account.id,campus))
        if(!listed.has(p.id)&&JSON.parse(p.publicData).date>=snapshot.window.from)run("UPDATE posters SET status='DRAFT',publicData=NULL,version=version+1,updatedAt=? WHERE id=?",timestamp,p.id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
}

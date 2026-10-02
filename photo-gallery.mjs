import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {campusDetails,universities} from './campus.mjs';
import {campusToday,dayAfter} from './public/event-utils.js';
import {createQueries} from './database.mjs';

export const gallery=JSON.parse(readFileSync(new URL('./data/photo-gallery.json',import.meta.url),'utf8'));
export const testNotice='TEST EVENT — Fictional event for testing CampusWall. No event is scheduled, no venue is booked, and no tickets or attendance are available. The venue is real; the date, programme and activity are invented. Photography is illustrative and does not depict the listed venue.';
// Recognise the previous built-in disclosure without reintroducing it in product copy.
const previousTestNotice=testNotice.replace('TEST EVENT —','TEST EVENT / \u6d4b\u8bd5\u6d3b\u52a8 —');
const originalDescription='A sample campus notice to help you explore CampusWall. Bring a friend, meet fellow students, and make something of your week. Create an account to share your own event.';
const originals=['Photography walk','Ideas after hours','Find your people','Friday on the green','Run together','Your next chapter'];
function stableId(campus,key){const bytes=createHash('sha256').update(`campuswall-photo-gallery-v1:${campus}:${key}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}

// Upgrade only the six exact built-in samples, preserving their IDs, saved links
// and comments. Everything else is inserted under deterministic IDs. A restart
// never changes dates, overwrites user posters, or duplicates this edition.
export function seedPhotoGallery(db,date=new Date()){
  const {get,all,run}=createQueries(db),timestamp=date.toISOString();
  db.exec('BEGIN IMMEDIATE');
  try{
    run('INSERT OR IGNORE INTO users (id,name,email,passwordHash,createdAt) VALUES (?,?,?,?,?)','campus-team','CampusWall team','seed@campuswall.invalid','!disabled',timestamp);
    const campuses=new Set(all('SELECT id FROM universities').map(u=>u.id));
    const knownKeys=new Set(universities.flatMap(([campus])=>gallery.events.map(event=>`photo-test-${event.key}-${campus}`)));
    for(const row of all("SELECT id,universityId,content,publicData FROM posters WHERE ownerId='campus-team' AND json_extract(publicData,'$.isTest')=1 AND json_extract(publicData,'$.photoPoster.edition')=1")){
      const published=JSON.parse(row.publicData),draft=JSON.parse(row.content),key=published.photoPoster?.seedKey;
      if(!knownKeys.has(key)||!key.endsWith(`-${row.universityId}`))continue;
      let changed=false;
      for(const content of [draft,published]){
        if(content.isTest&&content.photoPoster?.seedKey===key&&content.photoPoster.edition===1&&typeof content.description==='string'&&content.description.startsWith(previousTestNotice)){
          content.description=testNotice+content.description.slice(previousTestNotice.length);changed=true;
        }
      }
      if(changed)run('UPDATE posters SET content=?,publicData=?,version=version+1,updatedAt=? WHERE id=?',JSON.stringify(draft),JSON.stringify(published),timestamp,row.id);
    }
    const seeded=new Set(all("SELECT json_extract(publicData,'$.photoPoster.seedKey') seedKey FROM posters WHERE ownerId='campus-team' AND json_extract(publicData,'$.photoPoster.seedKey') IS NOT NULL").map(p=>p.seedKey));
    for(const [campus,name] of universities){
      if(!campuses.has(campus))continue;
      const start=campusToday(date,campusDetails[campus].timeZone),venues=gallery.venues[campus];
      for(const [index,event] of gallery.events.entries()){
        const key=`photo-test-${event.key}-${campus}`;
        if(seeded.has(key))continue;
        const venue=venues[event.venue],venueMap=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${name}, ${venue.campus}`)}`;
        const photoPoster={seedKey:key,edition:1,layout:event.layout,palette:event.palette,series:event.series,number:String(index+1).padStart(2,'0'),photoAlt:event.photo.alt,credit:event.photo.credit,photoSource:event.photo.source,license:gallery.license,venueSource:venue.source,venueMap};
        const content={title:event.title,subtitle:event.subtitle,date:dayAfter(start,index+1),time:event.time,location:`${venue.name} · ${venue.campus}`,description:`${testNotice}\n\n${event.description}`,category:event.category,template:'photo',style:'ink',alignment:'left',heroImageUrl:`/demo-photos/${event.key}.webp`,isTest:true,photoPoster};
        const encoded=JSON.stringify(content);
        const original=index<6?get("SELECT * FROM posters WHERE universityId=? AND ownerId='campus-team' AND status='PUBLISHED' AND json_extract(publicData,'$.title')=? AND json_extract(publicData,'$.description')=? AND COALESCE(json_extract(publicData,'$.heroImageUrl'),'')=''",campus,originals[index],originalDescription):null;
        if(original)run('UPDATE posters SET content=?,publicData=?,version=version+1,updatedAt=? WHERE id=?',encoded,encoded,timestamp,original.id);
        else run('INSERT OR IGNORE INTO posters (id,ownerId,universityId,slug,status,content,publicData,version,createdAt,updatedAt,publishedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',stableId(campus,event.key),'campus-team',campus,key,'PUBLISHED',encoded,encoded,0,timestamp,timestamp,timestamp);
      }
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

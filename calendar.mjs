import {campusDetails} from './campus.mjs';
const escapeText=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
// RFC 5545 content lines: fold at 75 octets without splitting UTF-8 characters.
function fold(line) {let result='',part='',bytes=0;for(const character of line){const size=Buffer.byteLength(character);if(bytes+size>75){result+=part+'\r\n';part=' ';bytes=1;}part+=character;bytes+=size;}return result+part;}
export function calendarEvent(poster,url) {
  const date=poster.date.replaceAll('-','');
  const timed=!!poster.time;
  const timeZone=campusDetails[poster.universityId]?.timeZone||'Australia/Sydney';
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusWall//Campus events//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  if(timed){
    lines.push('BEGIN:VTIMEZONE',`TZID:${timeZone}`,`X-LIC-LOCATION:${timeZone}`);
    if(timeZone==='Australia/Perth'||timeZone==='Australia/Brisbane'){
      const offset=timeZone==='Australia/Perth'?'+0800':'+1000';
      lines.push('BEGIN:STANDARD',`TZOFFSETFROM:${offset}`,`TZOFFSETTO:${offset}`,`TZNAME:${timeZone==='Australia/Perth'?'AWST':'AEST'}`,'DTSTART:19700101T000000','END:STANDARD');
    }else{
      const adelaide=timeZone==='Australia/Adelaide',standard=adelaide?'+0930':'+1000',daylight=adelaide?'+1030':'+1100';
      lines.push('BEGIN:DAYLIGHT',`TZOFFSETFROM:${standard}`,`TZOFFSETTO:${daylight}`,`TZNAME:${adelaide?'ACDT':'AEDT'}`,'DTSTART:20081005T020000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU','END:DAYLIGHT','BEGIN:STANDARD',`TZOFFSETFROM:${daylight}`,`TZOFFSETTO:${standard}`,`TZNAME:${adelaide?'ACST':'AEST'}`,'DTSTART:20090405T030000','RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU','END:STANDARD');
    }
    lines.push('END:VTIMEZONE');
  }
  lines.push('BEGIN:VEVENT',`UID:${poster.id}@campuswall`, `DTSTAMP:${new Date(poster.publishedAt).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,
    timed?`DTSTART;TZID=${timeZone}:${date}T${poster.time.replace(':','')}00`:`DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:${escapeText(poster.isTest?'[TEST] '+poster.title:poster.title)}`,`LOCATION:${escapeText(poster.location)}`,`DESCRIPTION:${escapeText(poster.description)}`,`URL:${url}`,...(poster.isTest?['STATUS:TENTATIVE','TRANSP:TRANSPARENT']:[]),'END:VEVENT','END:VCALENDAR');
  // No invented finish time. Date-only events use iCalendar's one-day default.
  return lines.map(fold).join('\r\n')+'\r\n';
}

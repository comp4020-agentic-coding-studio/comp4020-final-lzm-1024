// Reuse formatting machinery, not dates: midnight and DST stay current.
const dayFormatters=new Map(),dateTimeFormatters=new Map(),partsFormatters=new Map();
function formatter(cache,timeZone,locale,options){
  let value=cache.get(timeZone);
  if(!value){value=new Intl.DateTimeFormat(locale,{...options,...(timeZone?{timeZone}:{})});if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(timeZone,value);}
  return value;
}
const eventDateFormatter=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short'});
export function formatEventDate(date){const value=new Date(`${date}T12:00:00`);return date?Number.isNaN(value.getTime())?'Invalid Date':eventDateFormatter.format(value):'Date to come';}
export function formatCampusDateTime(value,timeZone){return formatter(dateTimeFormatters,timeZone,'en-AU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
export function campusDateParts(value,timeZone){return formatter(partsFormatters,timeZone,'en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));}
export function campusToday(now=new Date(),timeZone='Australia/Sydney') {return Number.isNaN(now.getTime())?'Invalid Date':formatter(dayFormatters,timeZone,'en-CA',{}).format(now);}
export function dayAfter(date,days=1) {const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+days);return next.toISOString().slice(0,10);}
export function eventStatus(poster,date=campusToday(new Date(),poster.timeZone)) {
  if(!poster.date)return {label:'Date to come',kind:'undated'};
  if(poster.date<date)return {label:'Ended',kind:'ended'};
  if(poster.date===date)return {label:'Today',kind:'today'};
  if(poster.date===dayAfter(date))return {label:'Tomorrow',kind:'tomorrow'};
  return {label:'Upcoming',kind:'upcoming'};
}

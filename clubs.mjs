import { readFileSync } from 'node:fs';
import { universities } from './campus.mjs';
import {normaliseSearch as normalise} from './public/ui-utils.js';

const interestGroups=[
  {id:'sport',name:'Sport & outdoors',description:'Fitness, teams & adventures',symbol:'↗'},
  {id:'tech',name:'Technology & science',description:'Coding, robotics & new ideas',symbol:'⌘'},
  {id:'arts',name:'Arts & performance',description:'Music, dance, film & creativity',symbol:'✳'},
  {id:'culture',name:'Culture & languages',description:'Heritage, languages & connections',symbol:'◎'},
  {id:'academic',name:'Study & faculties',description:'Your course & academic interests',symbol:'▤'},
  {id:'career',name:'Career & networking',description:'Industry, business & opportunities',symbol:'↗'},
  {id:'hobbies',name:'Games & hobbies',description:'Gaming, books & niche interests',symbol:'✦'},
  {id:'community',name:'Volunteering & community',description:'Give back & make a difference',symbol:'♡'},
  {id:'faith',name:'Faith & spirituality',description:'Beliefs, reflection & belonging',symbol:'☼'},
  {id:'politics',name:'Politics & advocacy',description:'Debate, campaigns & causes',symbol:'⚑'},
  {id:'social',name:'Social & campus life',description:'Food, friendships & campus groups',symbol:'☺'}
];
const categoryInterests={
  'Sports and Fitness':['sport'],'Sport & Recreation':['sport'],'Sports & Games':['sport','hobbies'],
  'Science and Technology':['tech'],'Technology & Projects':['tech'],
  'Arts and Performance':['arts'],'Creative Arts & Performance':['arts'],'Music & Dance':['arts'],'Reading, Writing & Watching':['arts','hobbies'],
  'Cultural and International':['culture'],'Culture & Language':['culture'],'International & Cultural':['culture'],
  'Academic and Professional':['academic','career'],'Academic':['academic'],'Course Union':['academic'],'Medical Science':['academic'],'Course Related':['academic'],'Faculty & Constituent':['academic'],'Postgraduate':['academic'],
  'Professional':['career'],'Professional & Networking':['career'],
  'Hobby and Special Interest':['hobbies'],'Hobbies & Special Interest':['hobbies'],'Hobby & Special Interest':['hobbies'],'Special Interest':['hobbies'],'Games & Animation':['hobbies'],'Recreational':['sport','hobbies'],
  'Volunteer and Community':['community'],'Social Impact & Advocacy':['community','politics'],'Charity & Social Impact':['community'],'Community & Inclusion':['community'],'Community Service':['community'],'Resource Centre':['community'],
  'Religious':['faith'],'Faith & Religion':['faith'],'Spirituality & Faith':['faith'],'Spiritual':['faith'],
  'Political':['politics'],'Political & Activist':['politics'],
  'Social Club':['social'],'Residential':['social'],'Food & Drink':['social'],'Food & Beverage':['social'],'Other':['social'],'Club Type':['social']
};
Object.assign(categoryInterests,{
  'Cultural':['culture'],'International':['culture'],'Multicultural':['culture'],'Culture':['culture'],
  'Performing Arts':['arts'],'Performance':['arts'],'Arts':['arts'],'Creative':['arts'],'Music and Performance':['arts'],
  'Social Welfare':['community'],'Social Justice':['community','politics'],'Volunteering':['community'],'Community':['community'],
  'Faculty - BEL':['academic','career'],'Faculty - EAIT':['academic','tech'],'Faculty - HASS':['academic'],'Faculty - HMBS':['academic'],'Faculty - Science':['academic','tech'],'Faculty Societies':['academic'],
  'Hobby':['hobbies'],'Hobby Activities':['hobbies'],'Sporting':['sport'],'Sports & Fitness':['sport'],
  'Business':['career'],'Education & Careers':['career'],'Science':['tech'],'Engineering':['academic','tech'],'Faith':['faith'],
  'Gatton Based':['social'],'Herston Based':['social'],'Guild':['social'],'Social':['social']
});
const categoryLookup=new Map(Object.entries(categoryInterests).map(([name,ids])=>[name.toLowerCase(),ids]));
function interestsFor(club){
  const ids=new Set(club.categories.flatMap(category=>categoryLookup.get(category.toLowerCase())||[]));
  // Supplement broad source categories with specific public club names, keeping the source labels intact.
  if(/\b(?:artificial intelligence|machine learning|ai|robotics?|cybersecurity|computer|computing|software|data|programming|coding|hackathon|technology|tech|aws|cloud|blockchain|mechatronics?|electronics?|engineering|astronomy|physics|chemistry)\b/i.test(club.name))ids.add('tech');
  if(/\b(?:chess|gaming|gamers?|games?|boardgames?|tabletop|mahjong|anime|animanga|beyblade)\b/i.test(club.name))ids.add('hobbies');
  if(/\b(?:music|musical|dance|dancing|drama|theatre|theater|photography|film|poetry|orchestra|choir|jazz|a cappella|art|arts|drawing)\b/i.test(club.name))ids.add('arts');
  if(/\b(?:food|coffee|tea|wine|beer|boba|cooking|cuisine|baking|chocolate|dessert|picnic)\b/i.test(club.name))ids.add('social');
  if(/\b(?:christian|christians|catholic|jewish|islamic|muslim|hindu|buddhist|evangelical|adventist|baha.?i)\b/i.test(club.name))ids.add('faith');
  if(/\b(?:football|basketball|volleyball|soccer|tennis|badminton|rowing|sailing|surfing|climbing|hiking|outdoors|cricket|rugby|futsal)\b/i.test(club.name))ids.add('sport');
  if(/\b(?:business|commerce|finance|financial|investment|investing|consulting|marketing|entrepreneurs?|economics|accounting|management)\b/i.test(club.name))ids.add('career');
  if(!ids.size)ids.add('social');
  return interestGroups.filter(group=>ids.has(group.id)).map(group=>group.id);
}
const directories=Object.fromEntries(universities.map(([campus])=>{
  const directory=JSON.parse(readFileSync(new URL(`./data/${campus}-clubs.json`,import.meta.url),'utf8'));
  const clubs=directory.clubs.map(club=>({...club,interests:interestsFor(club)}));
  const counts=new Map(interestGroups.map(group=>[group.id,0]));
  for(const club of clubs)for(const interest of club.interests)counts.set(interest,counts.get(interest)+1);
  return [campus,{clubs,search:new Map(clubs.map(club=>[club.id,normalise(`${club.name} ${club.categories.join(' ')} ${club.keywords||''}`)])),summary:{universityId:campus,source:{name:directory.sourceName,url:directory.sourceUrl},retrievedAt:directory.retrievedAt,total:clubs.length,categories:[...new Set(clubs.flatMap(club=>club.categories))].sort(),interests:interestGroups.map(group=>({...group,count:counts.get(group.id)}))}}];
}));
export function clubDirectory(universityId,{q='',category='',interest=''}={}) {
  const directory=directories[universityId];
  if(!directory)return {universityId,source:null,retrievedAt:null,total:0,categories:[],interests:[],clubs:[]};
  const query=normalise(q.slice(0,100));
  return {...directory.summary,clubs:directory.clubs.filter(club=>(!interest||club.interests.includes(interest))&&(!category||club.categories.includes(category))&&(!query||directory.search.get(club.id).includes(query)))};
}

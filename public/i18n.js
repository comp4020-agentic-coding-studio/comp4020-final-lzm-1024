export const languages=[['en','English'],['zh-CN','\u7b80\u4f53\u4e2d\u6587'],['es','Espa\u00f1ol'],['fr','Fran\u00e7ais'],['ja','\u65e5\u672c\u8a9e']];
const loaders={'zh-CN':()=>import('./locales/zh-CN.js'),es:()=>import('./locales/es.js'),fr:()=>import('./locales/fr.js'),ja:()=>import('./locales/ja.js')};
let language='en',catalog={},patterns=[],generation=0,installed=false,observer,scheduled=false;
const textSources=new WeakMap(),attributeSources=new WeakMap();
const ignored='script,style,code,pre,svg,canvas,textarea,[translate="no"],[data-i18n-ignore],.user-avatar,.brand,.poster,.photographic-poster,.canvas-poster,.profile-name h1,.profile-interests,.profile-note p,.profile-note-top a,.dm-person strong,.dm-conversation strong,.dm-room-heading h2,.chat-message-meta strong,.dm-message strong,.watch-message strong,.group-bubble strong,.watch-room-title,.watch-host,.community-group-card h3,.community-club-link strong,.club-card h3,.club-card h2,.club-description,.club-name,.card-meta h3,.poster-card h3,.watch-danmaku,.community-person strong,.community-event h3,.community-event p,.card-author,.detail-info>h1,.location,.game-people strong,.profile-button>span:not(.user-avatar)';
export const currentLanguage=()=>language;
function escaped(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function translate(value){
  if(language==='en'||typeof value!=='string')return value;
  const trim=value.trim();if(!trim)return value;
  let result=catalog[trim]||catalog[trim.toLowerCase()];
  if(!result){
    const decoration=/^([★✦✧✳☺☎▣▶♬←→↗↶↷↑↓⌖▤⚠△●○＋+\s]*)(.*?)([↗↑↓✓★✦＋\s]*)$/u.exec(trim);
    if(decoration?.[2]){const middle=catalog[decoration[2]]||catalog[decoration[2].toLowerCase()];if(middle)result=decoration[1]+middle+decoration[3];}
  }
  if(!result)for(const {regex,target} of patterns){const match=regex.exec(trim);if(match){result=target.replace(/\{(\d+)\}/g,(_,i)=>match[Number(i)+1]);break;}}
  if(!result){
    const date=/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=[\s,]|$)/i.exec(trim);
    if(date){const month=catalog[date[2]]||catalog[date[2].toLowerCase()];if(month)result=trim.replace(date[0],['zh-CN','ja'].includes(language)?month+date[1]+'\u65e5':date[1]+' '+month);}
  }
  if(!result&&trim.includes(' · ')){const pieces=trim.split(' · '),translated=pieces.map(piece=>catalog[piece]||catalog[piece.toLowerCase()]||piece);if(translated.some((piece,i)=>piece!==pieces[i]))result=translated.join(' · ');}
  return result?value.replace(trim,result):value;
}
function skip(element){return !element||element.closest(ignored);}
function text(node){
  if(skip(node.parentElement))return;
  const old=textSources.get(node),source=old&&node.nodeValue===old.output?old.source:node.nodeValue,output=translate(source);
  textSources.set(node,{source,output});if(node.nodeValue!==output)node.nodeValue=output;
}
function attributes(element){
  if(skip(element)&&element.tagName!=='TEXTAREA')return;
  if(element.closest('[translate="no"],[data-i18n-ignore]'))return;
  let saved=attributeSources.get(element);if(!saved){saved=new Map();attributeSources.set(element,saved);}
  for(const key of ['placeholder','title','aria-label']){
    if(!element.hasAttribute(key))continue;
    const value=element.getAttribute(key),old=saved.get(key),source=old&&value===old.output?old.source:value,output=translate(source);
    saved.set(key,{source,output});if(value!==output)element.setAttribute(key,output);
  }
}
function scan(root){
  if(root.nodeType===3){text(root);return;}
  if(root.nodeType!==1)return;
  if(skip(root)){if(root.tagName==='TEXTAREA')attributes(root);return;}
  attributes(root);
  const walker=document.createTreeWalker(root,document.defaultView.NodeFilter.SHOW_ELEMENT|document.defaultView.NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const node=walker.currentNode;if(node.nodeType===3)text(node);else attributes(node);}
}
function picker(){
  const nav=document.querySelector('#header nav');if(!nav||nav.querySelector('.language-picker'))return;
  const label=document.createElement('label');label.className='language-picker';label.setAttribute('translate','no');
  label.innerHTML='<span aria-hidden="true">◎</span><select aria-label="Interface language">'+languages.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select>';
  const select=label.querySelector('select');select.value=language;
  select.onchange=async()=>{select.disabled=true;try{await setLanguage(select.value);}catch{select.value=language;const toast=document.querySelector('#toast');if(toast){toast.textContent='Unable to load this language. Please try again.';toast.classList.add('show');}}finally{select.disabled=false;}};
  nav.append(label);
}
const pending=new Set();
function flush(){scheduled=false;if(!installed){pending.clear();return;}picker();if(language!=='en')for(const root of pending)if(root.isConnected&&!([...pending].some(parent=>parent!==root&&parent.contains?.(root))))scan(root);pending.clear();}
export async function setLanguage(next,{persist=true}={}){
  if(!languages.some(([id])=>id===next))next='en';
  const request=++generation,loaded=next==='en'?{}:(await loaders[next]()).default;
  if(request!==generation)return;
  language=next;catalog={};patterns=[];
  for(const [key,target] of Object.entries(loaded)){
    catalog[key]=target;catalog[key.toLowerCase()]=target;
    if(/\{\d+\}/.test(key))patterns.push({regex:new RegExp('^'+key.split(/\{\d+\}/).map(escaped).join('(.+?)')+'$','i'),target});
  }
  if(persist)try{localStorage.setItem('campuswall-language',next);}catch{}
  if(typeof document!=='undefined'){
    document.documentElement.lang=next;document.documentElement.dataset.language=next;
    document.querySelectorAll('.language-picker select').forEach(select=>select.value=next);
    scan(document.documentElement);document.dispatchEvent(new CustomEvent('campuswall:language',{detail:{language:next}}));
  }
}
export function installLanguage(){
  if(installed)return;installed=true;picker();
  observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')pending.add(record.target);
      else if(record.type==='attributes')pending.add(record.target);
      else for(const node of record.addedNodes)if(node.nodeType===1||node.nodeType===3)pending.add(node);
    }
    if(!scheduled){scheduled=true;queueMicrotask(flush);}
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  let saved='en';try{saved=localStorage.getItem('campuswall-language')||'en';}catch{}
  setLanguage(saved).catch(()=>setLanguage('en'));
  const storage=event=>{if(event.key==='campuswall-language')setLanguage(event.newValue,{persist:false}).catch(()=>{});};
  window.addEventListener('storage',storage);
  return ()=>{installed=false;generation++;observer.disconnect();pending.clear();window.removeEventListener('storage',storage);};
}

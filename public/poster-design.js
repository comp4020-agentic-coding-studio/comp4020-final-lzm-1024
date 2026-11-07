import {escapeHtml as esc} from './ui-utils.js';

export const designChoices={
  layout:['minimal','editorial','cover','split','frame','ticket','bold','gradient'],
  fontFamily:['serif','sans','display','mono'],customColours:['off','on'],
  imageFit:['cover','contain'],decoration:['star','orbit','grid','flower','none'],
  borderStyle:['plain','rounded','frame'],showCampus:['on','off'],showDate:['on','off'],showLocation:['on','off'],
  sticker:['none','star','heart','sparkle','bolt','flower'],
};
export const designNumbers={titleScale:[70,150],textWidth:[45,92],titleX:[0,55],titleY:[10,82],imageX:[0,100],imageY:[0,100],imageZoom:[100,160],imageOpacity:[20,100],extraX:[0,85],extraY:[0,90],extraScale:[12,42],stickerX:[5,95],stickerY:[5,95],stickerScale:[24,100],stickerRotation:[-45,45]};
export const designColours=['backgroundColour','textColour','accentColour','extraColour'];
export const designFields={...Object.fromEntries(Object.keys(designChoices).map(key=>[key,20])),...Object.fromEntries(Object.keys(designNumbers).map(key=>[key,5])),...Object.fromEntries(designColours.map(key=>[key,7])),extraText:180};
export const designDefaults={layout:'minimal',fontFamily:'serif',titleScale:'100',textWidth:'82',titleX:'9',titleY:'55',customColours:'off',backgroundColour:'#f4efe6',textColour:'#172a32',accentColour:'#bd830e',imageFit:'cover',imageX:'50',imageY:'50',imageZoom:'100',imageOpacity:'100',decoration:'star',borderStyle:'plain',showCampus:'on',showDate:'on',showLocation:'on',extraText:'',extraX:'9',extraY:'37',extraScale:'18',extraColour:'#bd830e',sticker:'none',stickerX:'80',stickerY:'38',stickerScale:'58',stickerRotation:'-12'};
export const designPresets=[
  {id:'whiteboard',name:'Collaborative whiteboard',note:'A blank canvas for every shared idea.',template:'minimal',layout:'minimal',fontFamily:'sans',canvasPreset:'blank'},
  {id:'minimal',name:'Minimal event',note:'Quiet space. Strong typography.',template:'minimal',layout:'minimal',fontFamily:'serif'},
  {id:'photo',name:'Photo event',note:'A full-bleed photographic cover.',template:'photo',layout:'cover',fontFamily:'sans',titleY:'59'},
  {id:'club',name:'Club recruitment',note:'A ticket worth keeping.',template:'club',layout:'ticket',fontFamily:'display',decoration:'orbit'},
  {id:'seminar',name:'Academic seminar',note:'An editorial point of view.',template:'seminar',layout:'editorial',fontFamily:'serif',titleY:'51'},
  {id:'social',name:'Social event',note:'Colour, friends and a little sunshine.',template:'social',layout:'split',fontFamily:'sans',decoration:'flower',titleY:'55'},
  {id:'gallery',name:'Gallery frame',note:'Your image, beautifully framed.',template:'photo',layout:'frame',fontFamily:'serif',titleY:'61'},
  {id:'bold',name:'Bold statement',note:'Big type. A bigger idea.',template:'minimal',layout:'bold',fontFamily:'display',titleScale:'135',decoration:'grid',titleY:'38'},
  {id:'gradient',name:'Colour studio',note:'An expressive gradient canvas.',template:'social',layout:'gradient',fontFamily:'sans',decoration:'orbit',titleY:'49'},
];
export function designValue(p,key){return Object.hasOwn(p,key)?p[key]:designDefaults[key];}
export function resolveDesign(p){
  const d={...designDefaults};
  for(const [key,values] of Object.entries(designChoices))if(values.includes(p[key]))d[key]=p[key];
  for(const [key,[min,max]] of Object.entries(designNumbers))if(/^[-]?\d+$/.test(String(p[key]))){const value=Number(p[key]);if(value>=min&&value<=max)d[key]=String(value);}
  for(const key of designColours)if(/^#[a-f0-9]{6}$/i.test(p[key]||''))d[key]=p[key];
  if(typeof p.extraText==='string')d.extraText=p.extraText.slice(0,180);
  return d;
}
const symbols={star:'✳',heart:'♥',sparkle:'✦',bolt:'↯',flower:'✿',orbit:'◌',grid:'▦',none:''};
// Posters without a photo get their category's colour and symbol, so a wall of them is easy to tell apart.
export const categoryArt={Social:['✿','#f4c1cf'],Academic:['✎','#b5d4ee'],Clubs:['✦','#d3c2f1'],Sport:['⚑','#b4ddb1'],Arts:['♫','#f7cfaa'],Career:['↗','#f2dc95'],Other:['✳','#e9dfcb']};
// Long titles start smaller; fitPosters then adjusts to the rendered size.
export const titleFit=title=>{const n=String(title||'').length;return n<=18?1:n<=28?.88:.8;};
export function designedPoster(p,university,dateText,large=false,editable=false){
  const d=resolveDesign(p),style=/^(?:sunshine|sage|lavender|coral|sky|ink|campus-(?:anu|usyd|unsw|unimelb|monash|uq|uwa|adelaide))$/.test(p.style)?p.style:'sunshine';
  const art=categoryArt[p.category]||categoryArt.Other;
  const vars=`--d-fit:${titleFit(p.title)};--cat:${art[1]};`+Object.keys(designNumbers).map(key=>`--d-${key}:${d[key]}${key==='stickerRotation'?'deg':''}`).join(';')+(d.customColours==='on'?`;--bg:${d.backgroundColour};--fg:${d.textColour};--poster-accent:${d.accentColour}`:'')+`;--d-extraColour:${d.extraColour}`;
  const image=p.heroImageUrl&&(/^(?:https:\/\/|\/media\/[a-f0-9-]{36}$)/.test(p.heroImageUrl))?p.heroImageUrl:'';
  const placeholder=!image&&d.layout!=='cover';
  const drag=(key,label)=>editable?` data-design-drag="${key}" tabindex="0" role="button" aria-label="Move ${label}"`:'';
  return `<div class="poster ${style}${d.customColours==='on'?' custom-colours':''} designed-poster designed-${d.layout} font-${d.fontFamily} border-${d.borderStyle}${placeholder?' no-image':''}${large?' large':''}${p.alignment==='center'?' center':''}" style="${vars}" aria-label="${esc(p.title||'Untitled poster')}">
    <div class="design-image">${image?`<img src="${esc(image)}" alt="${esc(p.title||'Event image')}" loading="${large?'eager':'lazy'}" referrerpolicy="no-referrer" style="object-fit:${d.imageFit}">`:placeholder?`<span class="design-placeholder" aria-hidden="true">${art[0]}</span>`:''}</div>
    <div class="design-wash" aria-hidden="true"></div>
    <div class="design-motif motif-${d.decoration}" aria-hidden="true">${symbols[d.decoration]}</div>
    ${d.showCampus==='on'?`<div class="design-campus">${esc(university?.shortName||'CAMPUS')} / ${esc(p.category)} <span>↗</span></div>`:''}
    <div class="design-copy"${drag('title','title and subtitle')}><h2>${esc(p.title||'Your next campus moment')}</h2>${p.subtitle?`<p>${esc(p.subtitle)}</p>`:''}</div>
    ${d.extraText?`<div class="design-extra"${drag('extra','extra text')}>${esc(d.extraText)}</div>`:''}
    ${d.sticker!=='none'?`<div class="design-sticker"${drag('sticker','sticker')}>${symbols[d.sticker]}</div>`:''}
    <div class="design-footer">${d.showDate==='on'?`<strong>${esc(dateText(p.date))}${p.time?` / ${esc(p.time)}`:''}</strong>`:''}${d.showLocation==='on'?`<span>${esc(p.location||'Your campus, your place')}</span>`:''}</div>
  </div>`;
}

// Make each poster's copy clear the date block. Steps, gentlest first: shrink the title a little;
// on posters without a photo, move the copy up (the colour block above shrinks with it); shrink the
// title further; finally hide the subtitle. Reads and writes are batched per round, so a full wall
// costs a few layouts rather than one per poster step.
function overflowing(poster){
  const copy=poster.querySelector('.design-copy'),footer=poster.querySelector('.design-footer'),title=copy?.querySelector('h2');if(!copy)return false;
  const limit=(footer?footer.getBoundingClientRect().top:poster.getBoundingClientRect().bottom)-4;
  // Tight display line heights let glyphs poke out a little; only a clamped title counts as cut.
  const slack=title?parseFloat(getComputedStyle(title).fontSize)*.3:0;
  return copy.getBoundingClientRect().bottom>limit||!!title&&title.scrollHeight>title.clientHeight+slack;
}
function nextStep(poster){
  const fit=Number(poster.style.getPropertyValue('--d-fit'))||1,y=Number(poster.style.getPropertyValue('--d-titleY'))||Number(getComputedStyle(poster).getPropertyValue('--d-titleY'))||55;
  if(fit>.76)return poster.style.setProperty('--d-fit',String(Math.round(fit*100-6)/100));
  if(poster.classList.contains('no-image')&&y>30){poster.classList.add('fit-moved');return poster.style.setProperty('--d-titleY',String(y-4));}
  if(fit>.56)return poster.style.setProperty('--d-fit',String(Math.round(fit*100-6)/100));
  if(!poster.classList.contains('fit-tight'))return poster.classList.add('fit-tight');
  poster.dataset.fitDone='1';
}
export function fitPosters(root){
  let pending=[...root.querySelectorAll('.designed-poster')].filter(p=>p.offsetWidth&&!p.closest('#preview,.studio-stage,.whiteboard'));
  for(let round=0;round<20&&pending.length;round++){
    const over=pending.filter(p=>!p.dataset.fitDone&&overflowing(p));
    for(const poster of over)nextStep(poster);
    pending=over;
  }
}
export function observePosterFit(root){
  if(!root||typeof MutationObserver!=='function'||typeof requestAnimationFrame!=='function')return;
  let frame=0,width=globalThis.innerWidth||0;const queue=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;fitPosters(root);});};
  new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('.designed-poster')||n.querySelector('.designed-poster')))))queue();}).observe(root,{childList:true,subtree:true});
  globalThis.addEventListener?.('resize',()=>{if(Math.abs(innerWidth-width)<40)return;width=innerWidth;root.querySelectorAll('.designed-poster').forEach(p=>{p.style.setProperty('--d-fit',String(titleFit(p.querySelector('h2')?.textContent)));p.style.removeProperty('--d-titleY');p.classList.remove('fit-tight','fit-moved');delete p.dataset.fitDone;});queue();});
  document.fonts?.ready?.then(queue);queue();
}

import {installAppearance,mountAppearancePicker} from './appearance.js';
import {installLanguage} from './i18n.js';
import {avatar} from './chat-ui.js';
import {createFeedback,publicationHelp} from './feedback.js';
import { campusToday, dayAfter, eventStatus, formatEventDate } from './event-utils.js';
import { validEmail, universityFromEmail } from './email-utils.js';
import { mountChat } from './chat.js';
import {canvasPoster,blankCanvas} from './canvas-model.js';
import {designedPoster,designValue,designFields,observePosterFit} from './poster-design.js';
import { photoPoster } from './photo-posters.js';
import {escapeHtml as esc,normaliseSearch,loadStylesheet,createSessionMount,safeUrl,linkify} from './ui-utils.js';
import {installMotion,withRequestMotion,motionFetch,closeDialog} from './motion.js';
installAppearance();
installMotion();
installLanguage();
const mountVoiceCalls=createSessionMount(()=>import('./voice-calls.js').then(module=>module.mountVoiceCalls));
const mountCommunityHeader=createSessionMount(()=>import('./community.js').then(module=>module.mountCommunityHeader));
document.addEventListener('error',event=>{if(event.target.matches?.('.user-avatar img'))event.target.remove();},true);
const $ = (s,root=document) => root.querySelector(s);
const app=$('#app');observePosterFit(app);
const feedback=createFeedback({node:$('#toast')});
const watchDocument=/^\/watch(?:\/|$)/.test(location.pathname);
const categories=['Social','Academic','Clubs','Sport','Arts','Career','Other'];
const templates={minimal:'Minimal event',photo:'Photo event',club:'Club recruitment',seminar:'Academic seminar',social:'Social event'};
const styles={sunshine:'Sunshine',sage:'Sage green',lavender:'Lavender',coral:'Warm coral',sky:'Sky blue',ink:'Midnight'};
let me=null,universities=[],selected=localStorage.getItem('campuswall-university'),socket=null,retry=null,routeId=0,draft=null;
const pending=new Map(),timers=new Map();
let guidePanel=null,wallDelight=null,accountPanel=null;
let stopped=false,connected=false,renderedPath=location.pathname+location.search,uploading=false,editingTimer=null,chatPanel=null,messagesPanel=null,gamesPanel=null,watchPanel=null,profilePanel=null,designerPanel=null,whiteboardPanel=null,communityPanel=null,eventPanel=null,watchExtras=null,wallPanel=null;let undoEdits=[],redoEdits=[];
// A dropped connection or a restarting server is explained in words, never as the browser's raw "Failed to fetch".
async function api(path,method='GET',data,{signal}={}) {return withRequestMotion(async()=>{let response;try{response=await fetch(path,{method,signal,headers:{'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});}catch(error){if(error.name==='AbortError')throw error;const offline=new Error('CampusWall can’t be reached right now. Check your connection, then try again.');offline.network=true;throw offline;}const value=await response.json().catch(()=>null);if(!response.ok||!value){const error=new Error(value?.error||'Unable to complete this request');error.status=response.status;throw error;}return value;});}
function toast(text,options={}) {
  const match=/Unable to publish: (title|date|location) is missing/.exec(String(text)),field=options.publicationField||match?.[1],help=publicationHelp(field,options.publicationFields);
  if(help&&whiteboardPanel){const board=whiteboardPanel,current=routeId;feedback.dismiss();feedback.help(help,()=>{if(current===routeId&&board===whiteboardPanel)board.openEventDetails(field);});return;}
  feedback.show(text,options);
}
function mountHomepageChat() {
  chatPanel?.destroy();
  chatPanel=mountChat($('#campus-chat'),{user:me,university:universities.find(u=>u.id===selected),loginPath:`/login?next=${encodeURIComponent(location.pathname)}`,onAuthExpired(){me=null;header();mountHomepageChat();chatPanel.setConnection(connected);toast('Sign in again to send messages.');}});
}
const dateText=formatEventDate;
const today=()=>campusToday(new Date(),universities.find(u=>u.id===selected)?.timeZone);
function options(values,current) {return Object.entries(Array.isArray(values)?Object.fromEntries(values.map(v=>[v,v])):values).map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');}
function header() {
  if(me?.universityId){selected=me.universityId;localStorage.setItem('campuswall-university',selected);}
  applyCampusTheme();
  mountVoiceCalls({user:me,api,toast,navigate}).catch(error=>toast(error.message,{kind:'error'}));
  const campus=universities.find(u=>u.slug===selected),brand=campus?.logo?`<img class="campus-logo" src="${esc(campus.logo.src)}" width="${campus.logo.width}" height="${campus.logo.height}" alt="${esc(campus.name)} logo" fetchpriority="high"><span class="brand-product">CampusWall</span>`:'<span class="brand-mark">▦</span> CampusWall<span class="brand-dot">.</span>';
  $('#header').innerHTML=`<a class="brand${campus?.logo?' school-brand':''}" href="/${selected||''}" aria-label="${esc(campus?`CampusWall — ${campus.shortName} home`:'CampusWall home')}" data-nav>${brand}</a>${me?`<div class="campus-picker account-campus" aria-label="Account university" title="Your account university is fixed">${esc(universities.find(u=>u.id===me.universityId)?.shortName||'Set your campus')}</div>`:universities.length===1?`<div class="campus-picker account-campus">${esc(universities[0].shortName)}</div>`:`<label class="campus-picker"><span class="sr-only">Choose university</span><select id="campus"><option value="">Choose campus</option>${universities.map(u=>`<option value="${u.slug}" ${selected===u.slug?'selected':''}>${u.shortName}</option>`).join('')}</select></label>`}<span class="header-buddy" data-robot="dream" aria-hidden="true"></span><button type="button" class="quiet nav-toggle" aria-expanded="false" aria-controls="site-nav"><span class="nav-toggle-icon" aria-hidden="true"></span><span class="sr-only">Menu</span></button><nav id="site-nav"></nav>`;
  // A short header: two destinations, "More" for the rest, one create action,
  // notifications, and an account menu holding personal links and settings.
  const account=me?`<details class="nav-more nav-account"><summary aria-label="Account and settings">${avatar(me,'',false)}<span class="account-name" data-i18n-ignore>${esc(me.name)}</span></summary><div><button type="button" class="quiet profile-button account-head" id="profile">${avatar(me,'',false)}<span><strong data-i18n-ignore>${esc(me.name)}</strong><small data-i18n-ignore>@${esc(me.username||'')}</small></span></button><a href="/my-posters" data-nav>My posters</a><a href="/saved" data-nav>Saved events</a><a href="/account" data-nav>Account &amp; security</a>${me.isModerator?'<a href="/moderation" data-nav>Moderation</a>':''}<div class="menu-settings" data-settings></div><button type="button" class="quiet menu-signout" id="logout">Sign out</button></div></details>`
    :`<details class="nav-more nav-account"><summary aria-label="Settings"><span class="nav-settings-icon" aria-hidden="true">⚙</span><span class="account-name">Settings</span></summary><div><div class="menu-settings" data-settings></div></div></details>`;
  $('#header nav').innerHTML=`<a href="/community" data-nav>Campus life</a>${me?'<a href="/messages" data-nav>Messages</a>':''}<details class="nav-more"><summary>More</summary><div><a href="/watch" data-nav>Watch together</a><a href="/games" data-nav>Games</a>${selected?`<a href="/${selected}/clubs" data-nav>Clubs & societies</a>`:''}<a href="/guide" data-nav>Getting started</a></div></details><span class="nav-actions">${me?'':'<a href="/login" class="nav-signin" data-nav>Sign in</a>'}<button class="primary" id="create">＋ Create poster</button>${me?'<a href="/community/notifications" id="community-bell" aria-label="Notifications" data-nav><span aria-hidden="true">◉</span><span class="bell-label" aria-hidden="true">Notifications</span><span id="community-unread" hidden></span></a>':''}${account}</span>`;
  mountHeaderMenus();
  import('./robot.js').then(m=>m.mountBuddy($('#header .header-buddy'))).catch(()=>{});
  mountCommunityHeader({user:me,api,onAuthExpired(){me=null;header();toast('Sign in again to view campus updates.');}}).catch(error=>toast(error.message,{kind:'error'}));
  mountAppearancePicker();
  mountPhoneMenu();
  if($('#campus'))$('#campus').onchange=e=>{if(e.target.value)navigate(`/${e.target.value}${universities.some(u=>location.pathname===`/${u.slug}/clubs`)?'/clubs'+location.search:''}`);};$('#create').onclick=createPoster;
  if($('#profile'))$('#profile').onclick=()=>navigate('/people/'+me.id);
  if($('#logout'))$('#logout').onclick=async()=>{try{await flush();await mountVoiceCalls({user:null,api,toast,navigate});disconnect();await api('/api/auth/logout','POST');me=null;header();await navigate(`/${selected||''}`);}catch(error){toast(error.message,{kind:'error'});await route();}};
}
// Header dropdowns: one open at a time; they close on a choice, an outside click or Escape.
function mountHeaderMenus() {
  const menus=[...$('#header').querySelectorAll('.nav-more')];
  for(const menu of menus){
    // Inside the open phone menu every section stays expanded.
    menu.addEventListener('toggle',()=>{if(menu.open&&!$('#header').classList.contains('nav-open'))for(const other of menus)if(other!==menu)other.open=false;});
    menu.addEventListener('click',event=>{if(event.target.closest('a[href],#profile,#logout'))menu.open=false;});
  }
}
document.addEventListener('click',event=>{if($('#header')?.classList.contains('nav-open'))return;for(const menu of document.querySelectorAll('#header .nav-more[open]'))if(!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||$('#header')?.classList.contains('nav-open'))return;const menu=document.querySelector('#header .nav-more[open]');if(!menu)return;event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();});
// Below the phone breakpoint the header navigation folds behind a Menu button (see mobile.css).
// Wider screens never show the button, so the menu state has no effect there.
function mountPhoneMenu() {
  const head=$('#header'),toggle=head.querySelector('.nav-toggle');head.classList.remove('nav-open');if(!toggle)return;
  const setOpen=(open,{focus=false}={})=>{head.classList.toggle('nav-open',open);toggle.setAttribute('aria-expanded',String(open));for(const menu of head.querySelectorAll('.nav-more'))menu.open=open;if(!open&&focus)toggle.focus();};
  toggle.onclick=()=>setOpen(toggle.getAttribute('aria-expanded')!=='true');
  head.onkeydown=event=>{if(event.key==='Escape'&&head.classList.contains('nav-open')){event.stopPropagation();setOpen(false,{focus:true});}};
  head.querySelector('nav').addEventListener('click',event=>{if(head.classList.contains('nav-open')&&event.target.closest('a[href],#create,#profile,#logout'))setOpen(false);});
}
document.addEventListener('click',event=>{const head=$('#header');if(head?.classList.contains('nav-open')&&!head.contains(event.target)){head.classList.remove('nav-open');head.querySelector('.nav-toggle')?.setAttribute('aria-expanded','false');for(const menu of head.querySelectorAll('.nav-more'))menu.open=false;}});
function applyCampusTheme() {
  const university=universities.find(u=>u.slug===selected);
  document.documentElement.dataset.campus=university?.slug || '';
  document.title=university?`CampusWall — ${university.shortName} campus noticeboard`:'CampusWall — Your campus, at a glance';
}
async function flush() {
  await whiteboardPanel?.flush();
  if(uploading)throw new Error('Your image is still uploading. Please wait a moment.');
  for(const [field] of timers){clearTimeout(timers.get(field));timers.delete(field);sendField(field);}
  if(!pending.size)return;
  if(!connected)throw new Error('Wait for reconnection before continuing.');
  const start=Date.now();while(pending.size){if(!connected||Date.now()-start>6000)throw new Error('Changes are still saving. Please try again.');await new Promise(resolve=>setTimeout(resolve,40));}
}
// Each page gets its own tab title, and a new page moves focus to its heading so
// screen readers announce it. Filters and searches on the same page keep focus.
const pageNames=[[/^\/community\/notifications/,'Notifications'],[/^\/community/,'Campus life'],[/^\/messages/,'Messages'],[/^\/watch/,'Watch together'],[/^\/games/,'Games'],[/^\/[^/]+\/clubs$/,'Clubs & societies'],[/^\/guide$/,'Getting started'],[/^\/login$/,'Sign in'],[/^\/saved$/,'Saved events'],[/^\/my-posters$/,'My posters'],[/^\/studio\//,'Poster studio'],[/^\/choose-campus$/,'Choose your university']];
let announcedPath=location.pathname;
function afterRoute({focus=true}={}){
  const path=location.pathname,campus=universities.find(u=>u.slug===selected),heading=app.querySelector('h1');
  const named=pageNames.find(([pattern])=>pattern.test(path))?.[1]||(/^\/(?:[^/]+\/posters|people)\//.test(path)&&heading?.textContent.trim().slice(0,80))||'';
  if(named)document.title=[named,campus?.shortName,'CampusWall'].filter(Boolean).join(' · ');else applyCampusTheme();
  if(!focus||path===announcedPath)return;announcedPath=path;
  const target=heading||app;target.setAttribute('tabindex','-1');target.setAttribute('data-route-focus','');target.focus({preventScroll:true});
}
async function navigate(path,replace=false) {try{await flush();if(/^\/watch(?:\/|$)/.test(path)&&!watchDocument){location[replace?'replace':'assign'](path);return;}history[replace?'replaceState':'pushState']({},'',path);await route();window.scrollTo(0,0);afterRoute();}catch(error){toast(error.message,{kind:'error'});}}
function openAvatar(event){const node=event.target.closest?.('[data-profile-user]');if(!node)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();navigate('/people/'+node.dataset.profileUser);}
document.addEventListener('click',openAvatar,true);document.addEventListener('keydown',openAvatar,true);
document.addEventListener('click',event=>{const save=event.target.closest('[data-save]');if(save){toggleSaved(save);return;}const link=event.target.closest('a[data-nav]');if(link&&!event.ctrlKey&&!event.metaKey&&event.button===0){event.preventDefault();navigate(link.getAttribute('href'));}});
window.addEventListener('popstate',async()=>{try{await flush();await route();afterRoute();}catch(error){history.pushState({},'',renderedPath);toast(error.message,{kind:'error'});}});
window.addEventListener('beforeunload',event=>{if(pending.size||uploading){event.preventDefault();event.returnValue='';}});
function disconnect() {guidePanel?.destroy();guidePanel=null;accountPanel?.destroy();accountPanel=null;wallPanel?.destroy();wallPanel=null;communityPanel?.destroy();communityPanel=null;eventPanel?.destroy();eventPanel=null;watchExtras?.destroy();watchExtras=null;watchPanel?.destroy();watchPanel=null;profilePanel?.destroy();profilePanel=null;whiteboardPanel?.destroy();whiteboardPanel=null;designerPanel?.destroy();designerPanel=null;chatPanel?.destroy();chatPanel=null;messagesPanel?.destroy();messagesPanel=null;gamesPanel?.destroy();gamesPanel=null;stopped=true;clearTimeout(retry);clearInterval(editingTimer);if(socket){socket.onclose=null;socket.close();socket=null;}connected=false;pending.clear();for(const timer of timers.values())clearTimeout(timer);timers.clear();}
function live(query,receive,editor=false) {
  stopped=false;
  function open() {
    if(stopped)return;
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws?${query}`);socket=ws;
    ws.onopen=()=>{if(!editor)connected=true;chatPanel?.setConnection(true);messagesPanel?.setConnection(true);};
    ws.onmessage=event=>{if(stopped||ws!==socket)return;const message=JSON.parse(event.data);if(message.type==='profile:updated'&&me?.id===message.person.id){Object.assign(me,message.person);header();}receive(message);};
    ws.onclose=event=>{
      connected=false;
      if(stopped||ws!==socket)return;
      chatPanel?.setConnection(false);
      messagesPanel?.setConnection(false);
      if(editor){const hadPending=pending.size;pending.clear();for(const t of timers.values())clearTimeout(t);timers.clear();editingPresence([]);$('#presence').textContent='Waiting for a live connection…';setConnection(event.code===4003||event.code===4001?'Access ended':'Reconnecting…');if(hadPending)toast('Connection lost before changes were saved. The latest saved version will be restored.');}
      if(event.code===4001&&chatPanel){me=null;header();toast('Sign in again to send messages.');return route();}
      if(event.code===4003||event.code===4001){stopped=true;if(messagesPanel)receive({type:'inbox:expired'});else toast('This poster was deleted or you no longer have access.');return;}
      retry=setTimeout(open,1500);
    };
    ws.onerror=()=>{};
  }
  open();
}
function poster(p,large=false) {
  const uni=universities.find(u=>u.id===p.universityId);
  if(p.isTest&&p.photoPoster)return photoPoster(p,uni,dateText,large);
  if(p.canvas&&!blankCanvas(p.canvas))return canvasPoster(p,large);
  if(p.designVersion==='1')return designedPoster(p,uni,dateText,large,large&&location.pathname.startsWith('/studio/posters/'));
  const safeStyle=Object.hasOwn(styles,p.style)?p.style:'sunshine',safeTemplate=Object.hasOwn(templates,p.template)?p.template:'minimal';
  return `<div class="poster ${safeStyle} ${safeTemplate} ${large?'large':''} ${p.alignment==='center'?'center':''}" aria-label="${esc(p.title||'Untitled poster')}"><div class="poster-top"><span>${esc(uni?.shortName||'CAMPUS')} / ${esc(p.category)}</span><span>↗</span></div>${p.heroImageUrl?`<img class="poster-image" src="${esc(p.heroImageUrl)}" alt="${esc(p.title||'Event image')}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="poster-art" aria-hidden="true"><span></span><i></i><b>✳</b></div>`}<div class="poster-copy"><p class="poster-kicker">${esc(p.subtitle||'Something good is happening.')}</p><h2 data-i18n-ignore>${esc(p.title||'Your next campus moment')}</h2></div><div class="poster-bottom"><strong>${esc(dateText(p.date))} ${p.time?`/ ${esc(p.time)}`:''}</strong><span data-i18n-ignore>${esc(p.location||'Your campus, your place')}</span></div></div>`;
}
function statusBadge(p) {const status=eventStatus(p);return `<span class="event-status ${status.kind}">${status.label}</span>`;}
function saveButton(p) {return `<button class="save-button ${p.isSaved?'saved':''}" data-save="${p.id}" data-saved="${!!p.isSaved}" aria-pressed="${!!p.isSaved}" aria-label="${p.isSaved?'Unsave':'Save'} ${esc(p.title)}">${p.isSaved?'★ Saved':'☆ Save event'}</button>`;}
const officialLink=(p,classes='button poster-official')=>{const url=safeUrl(p.eventUrl);return url?`<a class="${classes}" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">Official page ↗</a>`:'';};
function contactOrganiser(p){if(safeUrl(p.eventUrl))return officialLink(p);return p.canMessageOwner&&me?.id!==p.ownerId?`<a class="button poster-contact" href="/messages?poster=${encodeURIComponent(p.id)}" data-nav aria-label="Message ${esc(p.owner)} about ${esc(p.title)}">Message organiser ↗</a>`:'';}
function card(p,privateView=false) {return `<article class="poster-card"><a class="poster-link" href="${privateView?`/studio/posters/${p.id}`:`/${p.universityId}/posters/${p.slug}`}" data-nav>${poster(p)}<div class="card-meta"><div class="meta-top"><span class="category">${esc(p.category)}</span><span${p.isTest?' class="test-card-label"':''}>${p.isTest?'Test event':privateView?esc(p.status):(p.ownerId==='campus-team'?'Sample notice':`${p.commentCount} comments`)}</span></div><h3 data-i18n-ignore>${esc(p.title||'Untitled event')}</h3><p>${esc(dateText(p.date))}${p.time?` · ${esc(p.time)}`:''}</p><p class="location">⌖ ${esc(p.location||'Location to come')}</p><div class="card-author">${p.isTest?'CampusWall test collection':p.organiser?`<span class="card-author-text"><span data-i18n-ignore>${esc(p.organiser)}</span> · shared by <span data-i18n-ignore>${esc(p.owner)}</span></span>`:esc(p.owner)} <span>↗</span></div></div></a>${privateView?(me&&me.id===p.ownerId?`<div class="card-tools owner-card-tools"><a class="button" href="/studio/posters/${p.id}" data-nav>Edit</a><button type="button" class="button-danger" data-delete-poster="${esc(p.id)}">Delete</button></div>`:''):`<div class="card-tools">${statusBadge(p)}${saveButton(p)}${contactOrganiser(p)}</div>`}</article>`;}
async function toggleSaved(button) {
  if(!me)return navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
  const posterId=button.dataset.save,wasSaved=button.dataset.saved==='true';button.disabled=true;
  try {
    const result=await api(`/api/posters/${posterId}/save`,wasSaved?'DELETE':'POST');
    document.querySelectorAll('[data-save]').forEach(b=>{if(b.dataset.save!==posterId)return;b.dataset.saved=String(result.isSaved);b.classList.toggle('saved',result.isSaved);b.setAttribute('aria-pressed',String(result.isSaved));b.setAttribute('aria-label',`${result.isSaved?'Unsave':'Save'} event`);b.textContent=result.isSaved?'★ Saved':'☆ Save event';});
    toast(result.isSaved?'Saved to your events.':'Event removed from your saved list.');if(result.isSaved)wallDelight?.celebrate(button);
    if(location.pathname==='/saved'&&!result.isSaved)await route();
  }catch(error){toast(error.message,{kind:'error'});}finally{button.disabled=false;}
}
function errorPage(message) {app.innerHTML=`<section class="empty"><span class="empty-art" aria-hidden="true" data-robot="dream"></span><span class="eyebrow">LET’S TRY THAT AGAIN</span><h1>${esc(message)}</h1><a class="button" href="/${selected||''}" data-nav>Back to campus wall</a></section>`;import('./robot.js').then(m=>m.fillRobots(app)).catch(()=>{});}
async function route() {
  feedback.closeHelp();
  disconnect();draft=null;renderedPath=location.pathname+location.search;const current=++routeId;const path=location.pathname;
  app.innerHTML='<div class="loading" role="status">Finding your campus moments…</div>';
  try {
    const requestedCampus=universities.find(u=>u.slug===path.split('/')[1]);
    if(me?.universityId&&!universities.some(u=>u.id===me.universityId)&&!['/guide','/login'].includes(path)){header();app.innerHTML=`<section class="chooser"><span class="eyebrow">NOT OPEN YET</span><h1>Your university<br>isn’t open yet.</h1><p>CampusWall is currently open to ${esc(universities.map(u=>u.shortName).join(', '))}. Your account and everything you made are kept safe and will be here when your university opens.</p><p><a class="button" href="/guide" data-nav>Getting started</a></p></section>`;return;}
    if(me&&!me.universityId){if(requestedCampus)selected=requestedCampus.slug;if(path!=='/choose-campus')return navigate('/choose-campus',true);header();return chooseAccountCampus();}
    if(path==='/choose-campus')return navigate(me?`/${me.universityId}`:'/login',true);
    if(me?.universityId&&requestedCampus&&requestedCampus.id!==me.universityId){toast('Your account stays on your own university.');return navigate(`/${me.universityId}${path.endsWith('/clubs')?'/clubs'+location.search:''}`,true);}
    if(path==='/') {if(selected&&universities.some(u=>u.slug===selected))return navigate(`/${selected}`,true);return chooser();}
    const uni=universities.find(u=>u.slug===path.split('/')[1]);if(uni){selected=uni.slug;localStorage.setItem('campuswall-university',selected);header();}
    if(path==='/community'||path.startsWith('/community/')){const [{mountCommunity}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;communityPanel=mountCommunity(app,{user:me,campus:universities.find(u=>u.id===selected),api,navigate,toast,path});return;}
    if(path==='/watch'||/^\/watch\/[a-f0-9-]{36}$/.test(path)){if(path!=='/watch'&&!me)return navigate('/login?next='+encodeURIComponent(path),true);const [{mountWatch}]=await Promise.all([import('./watch.js'),loadStylesheet('/watch.css')]);if(current!==routeId)return;watchPanel=mountWatch(app,{user:me,campus:universities.find(u=>u.id===selected),api,navigate,toast,roomId:path.split('/')[2],onAuthExpired(){me=null;header();toast('Sign in again to watch together.');navigate('/login?next='+encodeURIComponent(path),true);}});if(path.split('/')[2]&&me){const [{mountWatchExtras}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;$('.watch-audience').insertAdjacentHTML('beforebegin','<div id="watch-extras"></div>');watchExtras=mountWatchExtras($('#watch-extras'),{user:me,roomId:path.split('/')[2],api,navigate,toast});}return;}
    if(/^\/people\/[a-f0-9-]{36}$/.test(path)){const [{mountProfile}]=await Promise.all([import('./profile.js'),loadStylesheet('/profile.css'),loadStylesheet('/community.css')]);if(current!==routeId)return;profilePanel=mountProfile(app,{profileId:path.split('/')[2],user:me,universities,api,navigate,editPhoto:editProfile,toast,onAccountChange(next){me={...me,...next};header();}});return;}
    if(path==='/guide'){markGuideSeen();const [{mountGuide}]=await Promise.all([import('./guide.js'),loadStylesheet('/guide.css')]);if(current!==routeId)return;guidePanel=mountGuide(app,{user:me,campus:universities.find(u=>u.slug===selected)});return;}
    if(path==='/login')return login();
    if(path==='/forgot'){if(me)return navigate('/account',true);const {mountForgot}=await import('./account.js');if(current!==routeId)return;accountPanel=mountForgot(app,{api,onSignedIn:async()=>{me=(await api('/api/auth/me')).user;header();await navigate(`/${me?.universityId||selected||''}`,true);toast('Password changed. You’re signed in.');}});return;}
    if(path==='/account'||path==='/moderation'){
      if(!me)return navigate(`/login?next=${path}`,true);
      if(path==='/account'){const {mountAccount}=await import('./account.js');if(current!==routeId)return;accountPanel=mountAccount(app,{user:me,api,toast,onSignedOut:async()=>{await mountVoiceCalls({user:null,api,toast,navigate});disconnect();me=null;header();await navigate(`/${selected||''}`,true);}});return;}
      if(!me.isModerator)return errorPage('Only moderators can open this page.');
      const {mountModeration}=await import('./moderation.js');if(current!==routeId)return;accountPanel=mountModeration(app,{api,toast,modal,closeDialog,campusId:me.universityId});return;
    }
    if(path==='/games'||/^\/games\/[a-f0-9-]{36}$/.test(path)){
      if(path!=='/games'&&!me)return navigate(`/login?next=${encodeURIComponent(path)}`,true);
      const [{mountGames}]=await Promise.all([import('./games.js'),loadStylesheet('/games.css')]);
      if(current!==routeId)return;
      gamesPanel=mountGames(app,{user:me,campus:universities.find(u=>u.id===selected),api,navigate,roomId:path.split('/')[2],inviteeId:new URLSearchParams(location.search).get('invite'),onAuthExpired(){me=null;header();toast('Sign in again to continue playing.');navigate(`/login?next=${encodeURIComponent(path)}`,true);}});return;
    }
    if(path==='/messages'){
      const returnPath=location.pathname+location.search;
      if(!me)return navigate(`/login?next=${encodeURIComponent(returnPath)}`,true);
      header();const expired=()=>{if(!me)return;me=null;header();toast('Sign in again to view your messages.');navigate(`/login?next=${encodeURIComponent(returnPath)}`,true);};
      const params=new URLSearchParams(location.search);
      if(params.has('poster')&&!params.has('conversation')){
        app.innerHTML='<div class="loading" role="status">Opening a private conversation with the organiser…</div>';
        try{const result=await api('/api/messages/from-poster','POST',{posterId:params.get('poster')});if(current===routeId)return navigate(`/messages?conversation=${encodeURIComponent(result.conversation.id)}`,true);}
        catch(error){if(current===routeId){if(error.status===401)expired();else errorPage(error.message);}}return;
      }
      const {mountMessages}=await import('./messages.js');if(current!==routeId)return;
      messagesPanel=mountMessages(app,{user:me,api,navigate,onAuthExpired:expired,conversationId:params.get('conversation')});
      live('inbox=1',message=>{if(message.type==='inbox:expired')expired();else messagesPanel?.receive(message);});return;
    }
    if(path==='/saved') {
      if(!me)return navigate('/login?next=/saved',true);
      const list=await api('/api/saved');if(current!==routeId)return;
      const upcoming=list.filter(p=>eventStatus(p).kind!=='ended'),past=list.filter(p=>eventStatus(p).kind==='ended');
      app.innerHTML=`<section class="hero"><div><span class="eyebrow">THE THINGS YOU WANT TO SHOW UP FOR</span><h1>Worth keeping.<br><em>Worth going.</em></h1></div><p>Your saved events from your university.<br>Add one to your calendar when you’re ready.</p></section>${list.length?`${upcoming.length?`<div class="section-label"><h2>Coming up · ${upcoming.length}</h2></div><div class="poster-grid">${upcoming.map(p=>card(p)).join('')}</div>`:''}${past.length?`<div class="section-label"><h2>Past events · ${past.length}</h2></div><div class="poster-grid">${past.map(p=>card(p)).join('')}</div>`:''}`:`<div class="empty"><h2>Your next campus moment is out there.</h2><p>Tap Save event on a poster to keep it here. Unpublished notices stay private.</p><a class="button" href="/${selected||''}" data-nav>Explore the wall ↗</a></div>`}`;return;
    }
    if(path==='/my-posters'){if(!me)return navigate('/login?next=/my-posters',true);const list=await api('/api/drafts');if(current!==routeId)return;app.innerHTML=`<section class="hero"><div><span class="eyebrow">YOUR LITTLE CORNER OF CAMPUS</span><h1>Made by you.<br><em>Better together.</em></h1></div><p>Drafts stay between you and your collaborators. Publish when you’re ready to share.</p></section><div class="section-label"><h2>My posters & collaborations</h2><button class="primary" id="new-draft">＋ Create poster</button></div>${list.length?`<div class="poster-grid">${list.map(p=>card(p,true)).join('')}</div>`:`<div class="empty"><h2>You haven’t created any posters yet.</h2><p>Your next campus moment starts here.</p></div>`}`;$('#new-draft').onclick=createPoster;app.querySelectorAll('[data-delete-poster]').forEach(b=>b.onclick=()=>deletePoster(list.find(p=>p.id===b.dataset.deletePoster),()=>route()));return;}
    if(path.startsWith('/studio/posters/')){if(!me)return navigate(`/login?next=${encodeURIComponent(path)}`,true);const p=await api(`/api/drafts/${path.split('/').pop()}`);if(current!==routeId)return;return studio(p);}
    if(uni&&path===`/${uni.slug}/clubs`)return clubsPage(uni,current);
    if(uni&&path.includes('/posters/')){const p=await api(`/api/posters/${path.split('/').pop()}`);if(current!==routeId)return;if(p.universityId!==uni.id)throw new Error('This poster belongs to a different campus.');return detail(p,current);}
    if(uni)return wall(uni,current);
    errorPage('Page not found');
  } catch(error){if(current===routeId)errorPage(error.message);}
}
function chooser() {header();app.innerHTML=`<section class="chooser"><span class="eyebrow">WELCOME TO YOUR CAMPUS NOTICEBOARD</span><h1>Good things<br>happen <em>here.</em></h1><p>Which campus do you want to explore?</p><div class="university-grid">${universities.map((u,i)=>`<a href="/${u.slug}" data-campus-option="${u.slug}" data-nav><span class="uni-number">0${i+1}</span><strong>${esc(u.shortName)}</strong><span data-i18n-ignore>${esc(u.name)}</span><b>↗</b></a>`).join('')}</div><p class="muted">Explore freely. No account needed.</p><a class="guide-entry" href="/guide" data-nav>New here? See how CampusWall works ↗</a></section>`;}
function campusNavigation(uni,active) {
  return `<nav class="campus-navigation" aria-label="Explore ${esc(uni.shortName)}"><a href="/${uni.slug}" data-nav ${active==='events'?'aria-current="page"':''}>Events</a><a href="/${uni.slug}/clubs" data-nav ${active==='clubs'?'aria-current="page"':''}>Clubs & societies</a><a href="/games" data-nav>Games ↗</a></nav>`;
}
function clubCard(club) {
  const initials=club.name.replace(/^(?:ANU|USYD|UNSW|UniMelb|Monash|UQ|UWA|Adelaide)\s+/i,'').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase(),campus=universities.find(u=>u.id===club.universityId);
  return `<article class="club-card"><div class="club-card-heading"><div class="club-avatar" aria-hidden="true"><span>${esc(initials)}</span>${club.imageUrl?`<img src="${esc(club.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div><span class="club-campus">${esc(campus?.shortName||club.universityId)}</span></div><h2 data-i18n-ignore>${esc(club.name)}</h2><div class="club-categories">${club.categories.map(category=>`<span>${esc(category)}</span>`).join('')}</div><a class="club-profile" href="${esc(club.profileUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(club.name)} profile">Explore this club <span aria-hidden="true">↗</span></a></article>`;
}
async function clubsPage(uni,current) {
  const directory=await api(`/api/clubs?university=${uni.id}`);if(current!==routeId)return;
  if(!directory.source){app.innerHTML=`<section class="empty"><h1>Club directory coming soon.</h1><a class="button" href="/${uni.slug}" data-nav>Explore campus events ↗</a></section>`;return;}
  const params=new URLSearchParams(location.search);
  let interest=params.get('interest');if(interest!=='all'&&!directory.interests.some(g=>g.id===interest))interest=null;
  const interestButton=group=>`<button class="club-interest" data-club-interest="${group.id}" aria-pressed="false"><span class="club-interest-top"><span aria-hidden="true">${esc(group.symbol)}</span><span data-interest-count="${group.id}">${group.count}</span></span><strong>${esc(group.name)}</strong><span class="club-interest-description">${esc(group.description)}</span></button>`;
  app.innerHTML=`${campusNavigation(uni,'clubs')}<section class="hero club-hero"><div><span class="eyebrow"><span class="live-dot"></span> THE ${esc(uni.shortName)} CLUBS DIRECTORY</span><h1>Find your people.<br><em>Follow your interests.</em></h1></div><p>${directory.total} clubs. Start with what you love.<br>Choose an interest, or search for a club.</p></section><section class="club-filters" aria-label="Filter clubs"><label class="search"><span aria-hidden="true">⌕</span><input type="search" id="club-search" aria-label="Search clubs" maxlength="100" value="${esc((params.get('q')||'').slice(0,100))}" placeholder="Find a club or an interest…"></label><label class="club-category-picker">Directory category<select id="club-category"><option value="">All directory categories</option>${options(directory.categories,params.get('category'))}</select></label></section><section class="club-interest-section" aria-labelledby="club-interest-heading"><div class="section-label"><h2 id="club-interest-heading">What are you into?</h2><span class="muted">Clubs can belong to more than one interest.</span></div><div class="club-interest-grid">${directory.interests.map(interestButton).join('')}${interestButton({id:'all',name:'All clubs',description:'Browse the complete campus directory',symbol:'▦',count:directory.total})}</div><p class="club-interest-note">Browse by interest, then narrow it down with a keyword or directory category.</p></section><div class="section-label club-result-label"><h2 id="club-results-heading" tabindex="-1">Choose your interests <span id="club-count" role="status" aria-live="polite"></span></h2><button class="quiet" id="change-club-interest" hidden>Change interest ↑</button></div><p id="club-summary" class="club-summary"></p><div id="club-results" class="club-grid"></div><div class="club-more"><button id="club-more" hidden>Show more clubs</button></div><div class="club-source club-source-bottom"><div><strong>From ${esc(directory.source.name)}</strong><p>Club cards retain the original directory categories. Check each profile for current membership details.</p><span>Directory checked ${new Date(directory.retrievedAt).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</span></div><a class="button" href="${esc(directory.source.url)}" target="_blank" rel="noopener noreferrer">View original list ↗</a></div>`;
  let limit=24;
  const clubSearch=new Map(directory.clubs.map(club=>[club.id,normaliseSearch(`${club.name} ${club.categories.join(' ')} ${club.keywords||''}`)]));
  function render(reset=false){
    if(reset)limit=24;const query=normaliseSearch($('#club-search').value.trim()),category=$('#club-category').value;
    const base=directory.clubs.filter(club=>(!category||club.categories.includes(category))&&(!query||clubSearch.get(club.id).includes(query)));
    const interestCounts=new Map(directory.interests.map(group=>[group.id,0]));
    for(const club of base)for(const id of club.interests)interestCounts.set(id,(interestCounts.get(id)||0)+1);
    document.querySelectorAll('[data-club-interest]').forEach(button=>{
      const key=button.dataset.clubInterest,count=key==='all'?base.length:interestCounts.get(key)||0;
      button.setAttribute('aria-pressed',String(key===interest));button.classList.toggle('active',key===interest);button.disabled=count===0&&key!==interest;$('[data-interest-count]',button).textContent=String(count);
    });
    const browsing=interest!==null||!!query||!!category,list=interest&&interest!=='all'?base.filter(club=>club.interests.includes(interest)):base;
    const group=directory.interests.find(g=>g.id===interest),title=group?.name||(interest==='all'?'All clubs':browsing?'Search results':'Choose your interests');
    $('#club-results-heading').firstChild.textContent=`${title} `;
    $('#club-count').textContent=browsing?`${list.length} ${list.length===1?'club':'clubs'}`:'';
    $('#club-summary').textContent=browsing?`Showing ${Math.min(limit,list.length)} of ${list.length} ${list.length===1?'club':'clubs'}${query?' matching your search':''}${category?` · ${category}`:''}.`:'Start with an interest above, or search for a club you already have in mind.';
    $('#change-club-interest').hidden=!browsing;
    $('#club-results').innerHTML=!browsing?'<div class="club-start"><span aria-hidden="true">✳</span><p>Your next community starts with a shared interest.</p></div>':list.length?list.slice(0,limit).map(clubCard).join(''):'<div class="empty"><h2>No clubs match yet.</h2><p>Try another interest, keyword or directory category.</p><button id="clear-club-filters">Clear filters</button></div>';
    $('#club-more').hidden=!browsing||list.length<=limit;
    if(me)document.querySelectorAll('#club-results .club-card').forEach((node,i)=>{const c=list.slice(0,limit)[i];if(c)node.insertAdjacentHTML('beforeend',`<a class="club-community-link" href="/community/clubs/${encodeURIComponent(c.id)}" data-nav>Follow & student community ↗</a>`);});
    document.querySelectorAll('.club-avatar img').forEach(img=>{img.onerror=()=>img.remove();});
    if($('#clear-club-filters'))$('#clear-club-filters').onclick=()=>{interest=null;$('#club-search').value='';$('#club-category').value='';render(true);};
    const state=new URLSearchParams();if(interest)state.set('interest',interest);if(query)state.set('q',$('#club-search').value.trim());if(category)state.set('category',category);
    const path=`/${uni.slug}/clubs${state.size?'?'+state:''}`;history.replaceState({},'',path);renderedPath=path;
  }
  const scrollTo=element=>element.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  document.querySelectorAll('[data-club-interest]').forEach(button=>button.onclick=()=>{interest=button.dataset.clubInterest;render(true);$('#club-results-heading').focus({preventScroll:true});scrollTo($('#club-results-heading'));});
  $('#change-club-interest').onclick=()=>{scrollTo($('#club-interest-heading'));const button=document.querySelector(`[data-club-interest="${interest||'all'}"]`);button?.focus({preventScroll:true});};
  $('#club-search').oninput=()=>render(true);$('#club-category').onchange=()=>render(true);$('#club-more').onclick=()=>{limit+=24;render();};render();
}
// Show/hide for a password input, keeping the field's own label and autocomplete.
function mountPasswordToggle(input){
  if(!input||input.parentElement.classList.contains('password-field'))return;
  const wrap=document.createElement('span');wrap.className='password-field';input.before(wrap);wrap.append(input);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='quiet password-toggle';toggle.setAttribute('aria-pressed','false');toggle.textContent='Show';toggle.setAttribute('aria-label','Show password');wrap.append(toggle);
  toggle.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password');toggle.setAttribute('aria-pressed',String(show));input.focus();};
}
// First steps for an account created in this tab, until dismissed.
function welcomeCard(){
  let pending=null;try{pending=sessionStorage.getItem('campuswall-welcome');}catch{}
  if(!me||pending!==me.id)return '';
  return `<section class="welcome-card" aria-labelledby="welcome-title"><div><span class="eyebrow">YOU’RE IN</span><h2 id="welcome-title">Welcome to CampusWall, <span data-i18n-ignore>${esc(me.name)}</span>.</h2><p>Three good first steps:</p></div><ol class="welcome-steps"><li><a href="/people/${esc(me.id)}" data-nav>Add a profile photo ↗</a></li><li><a href="/community/friends" data-nav>Find friends ↗</a></li><li><button type="button" class="quiet" data-welcome-create>Create your first poster ↗</button></li></ol><button type="button" class="quiet welcome-close" aria-label="Dismiss welcome">✕</button></section>`;
}
const guideSeen=()=>{try{return localStorage.getItem('campuswall-guide-seen')==='1';}catch{return false;}};
const markGuideSeen=()=>{try{localStorage.setItem('campuswall-guide-seen','1');}catch{}};
const guideLink='<a href="/guide" data-nav class="button primary wall-guide-link">Getting started ↗</a>';
function guideBanner(){
  if(guideSeen()||welcomeCard())return '';
  return `<section class="guide-banner" aria-labelledby="guide-banner-title"><span class="guide-banner-mark" aria-hidden="true">✳</span><div><span class="eyebrow">NEW HERE?</span><h2 id="guide-banner-title">First time on CampusWall? Start with the guide.</h2><p>A short tour of what you can do, what needs an account and where to get help. Then explore.</p></div><div class="guide-banner-actions"><a class="button primary" href="/guide" data-nav>Read the guide ↗</a><button type="button" class="quiet" data-guide-later>Explore first</button></div></section>`;
}
function mountGuideBanner(){
  const banner=$('.guide-banner');if(!banner){$('.wall-tagline')?.insertAdjacentHTML('beforeend',guideLink);return;}
  banner.querySelector('a').addEventListener('click',markGuideSeen);
  banner.querySelector('[data-guide-later]').onclick=()=>{markGuideSeen();banner.remove();$('.wall-tagline')?.insertAdjacentHTML('beforeend',guideLink);$('.wall-guide-link')?.focus();};
}
function mountWelcome(){
  const card=$('.welcome-card');if(!card)return;
  const dismiss=()=>{try{sessionStorage.removeItem('campuswall-welcome');}catch{}card.remove();};
  card.querySelector('.welcome-close').onclick=dismiss;
  card.querySelectorAll('a').forEach(link=>link.addEventListener('click',dismiss));
  card.querySelector('[data-welcome-create]').onclick=()=>{dismiss();createPoster();};
}
const galleryNote=id=>`<p class="gallery-note" id="${id}" hidden><strong>Photo test collection</strong> — Fictional activities at real campus venues. All test posters are labelled. Photos are illustrative.</p>`;
async function wall(uni,current) {
  app.innerHTML=`${campusNavigation(uni,'events')}${me?'<div class="wall-community-shortcuts"><a href="/community/map" data-nav>⌖ Activity map</a><a href="/community/calendar" data-nav>▤ My calendar</a><a href="/community/teams" data-nav>↗ Find your team</a><a href="/community/clubs" data-nav>✳ Following clubs</a></div>':''}${guideBanner()}<section class="hero wall-hero wall-hero-compact"><div><span class="eyebrow"><span class="live-dot"></span> THE ${esc(uni.shortName)} NOTICEBOARD</span><h1>Your campus, <em>at a glance.</em><span class="hero-star" aria-hidden="true">✳</span></h1></div><p class="wall-tagline"><span>The meetups, the big ideas, the little things.</span> <a href="#campus-chat" class="wall-chat-jump">Join the campus chat ↓</a></p></section><section class="wall-controls" aria-label="Filter posters"><div class="category-tabs"><button data-category="" class="active">All posters</button>${categories.map(c=>`<button data-category="${c}">${c}</button>`).join('')}</div><div class="filter-row"><div class="date-tabs"><button data-date="">All dates</button><button data-date="today">Today</button><button data-date="week">This week</button><button class="active" data-date="upcoming">Upcoming</button><button data-date="past">Past events</button></div><select class="date-select" aria-label="When"><option value="">All dates</option><option value="today">Today</option><option value="week">This week</option><option value="upcoming" selected>Upcoming</option><option value="past">Past events</option></select><label class="search"><span>⌕</span><input type="search" id="search" placeholder="Find your next thing…" aria-label="Search events"></label></div></section><div class="section-label"><h2>On the wall <span id="count"></span></h2></div>${galleryNote('gallery-note')}<div id="results" class="poster-grid"></div><section class="wall-recent" id="wall-recent" aria-labelledby="wall-recent-title" hidden><div class="section-label"><h2 id="wall-recent-title">Recently on campus</h2></div>${galleryNote('recent-note')}<div id="recent-results" class="poster-grid"></div></section><section class="wall-chat-section" aria-label="Campus chat"><section id="campus-chat" class="campus-chat" aria-label="Campus chat"></section></section><section class="wall-cta"><div><span class="eyebrow">MAKE SOME NOISE</span><h2>Something happening?<br>Put it on the wall.</h2></div><button class="primary" id="wall-create">Create a poster ↗</button></section>`;
  $('.wall-controls').insertAdjacentHTML('beforebegin',welcomeCard());mountWelcome();mountGuideBanner();
  mountHomepageChat();
  // Scroll to the chat in place: a hash link would re-run the router.
  $('.wall-chat-jump').onclick=event=>{event.preventDefault();const chat=$('#campus-chat');chat.scrollIntoView({block:'start'});(chat.querySelector('textarea,input')||chat).focus?.({preventScroll:true});};
  let category='',range='upcoming',request=0,searchTimer,controller,disposed=false;
  wallPanel={destroy(){disposed=true;window.removeEventListener('online',load);clearTimeout(searchTimer);controller?.abort();wallDelight?.destroy();wallDelight=null;}};
  // Coming back online reloads the posters, so a dropped connection recovers by itself.
  window.addEventListener('online',load);
  // Warm decorative motion loads after the wall itself, only on this page.
  Promise.all([import('./delight.js'),loadStylesheet('/delight.css')]).then(([{mountDelight}])=>{if(!disposed&&current===routeId)wallDelight=mountDelight(app);}).catch(()=>{});
  async function load() {if(disposed||current!==routeId)return;controller?.abort();controller=new AbortController();const n=++request;const params=new URLSearchParams({university:uni.id,category,q:$('#search')?.value||''});if(range){if(range==='past')params.set('to',dayAfter(today(),-1));else params.set('from',today());if(range==='today')params.set('to',today());if(range==='week'){const d=new Date(`${today()}T12:00:00`);d.setDate(d.getDate()+(7-(d.getDay()||7)));params.set('to',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}}try{const list=await api(`/api/posters?${params}`,'GET',undefined,{signal:controller.signal});if(current!==routeId||n!==request)return;$('#count').textContent=String(list.length);$('#gallery-note').hidden=!list.some(p=>p.isTest);const quiet=range==='upcoming'&&!category&&!params.get('q');$('#results').innerHTML=list.length?list.map(p=>card(p)).join(''):quiet?`<div class="empty empty-upcoming"><span class="empty-art" aria-hidden="true" data-robot="dream"></span><h2>No upcoming events yet.</h2><p>Know something happening on campus? Put it on the wall. You can share someone else’s event too: name the organiser and link their page.</p><div class="empty-actions"><button class="primary" data-empty-create>Share an event ↗</button>${safeUrl(uni.eventsUrl)?`<a class="button" href="${esc(uni.eventsUrl)}" target="_blank" rel="noopener noreferrer">${esc(uni.shortName)} events calendar ↗</a>`:''}</div></div>`:'<div class="empty"><span class="empty-art" aria-hidden="true" data-robot="dream"></span><h2>No posters here yet.</h2><p>Try another filter, or be the first to share what’s happening on campus.</p></div>';$('[data-empty-create]')?.addEventListener('click',createPoster);
      // A quiet week should not look like an empty wall: show what happened recently underneath.
      const recent=range==='upcoming'&&!category&&!params.get('q')&&list.length<4?(await api(`/api/posters?${new URLSearchParams({university:uni.id,to:dayAfter(today(),-1)})}`,'GET',undefined,{signal:controller.signal})).filter(p=>!p.isTest&&p.ownerId!=='campus-team').slice(-6).reverse():[];
      if(current!==routeId||n!==request)return;$('#wall-recent').hidden=!recent.length;$('#recent-note').hidden=!recent.some(p=>p.isTest);$('#recent-results').innerHTML=recent.map(p=>card(p)).join('');}catch(error){if(current===routeId&&n===request&&error.name!=='AbortError'){$('#results').innerHTML=`<div class="load-error" role="alert"><p class="error">${esc(error.message)}</p><button type="button" data-retry>Try again</button></div>`;$('[data-retry]').onclick=load;};}}
  // Selected filters are announced, not only coloured.
  const press=(selector,chosen)=>document.querySelectorAll(selector).forEach(x=>{x.classList.toggle('active',x===chosen);x.setAttribute('aria-pressed',String(x===chosen));});
  press('[data-category]',document.querySelector('[data-category].active'));press('[data-date]',document.querySelector('[data-date].active'));
  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;press('[data-category]',b);load();});
  const pickDate=value=>{range=value;press('[data-date]',document.querySelector(`[data-date="${value}"]`));$('.date-select').value=value;load();};
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>pickDate(b.dataset.date));$('.date-select').onchange=e=>pickDate(e.target.value);
  $('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(load,200);};$('#wall-create').onclick=createPoster;
  await load();if(current===routeId)live(`wall=${uni.id}&chat=1`,message=>{chatPanel?.receive(message);if(message.type==='wall:changed')load();});
}
function login() {
  if(me?.universityId)return navigate(`/${me.universityId}`,true);
  let register=false;const params=new URLSearchParams(location.search),next=params.get('next')||`/${selected||''}`;
  const createCampus=next==='create'?universities.find(u=>u.slug===(params.get('campus')||selected)):null;
  if(createCampus){selected=createCampus.slug;localStorage.setItem('campuswall-university',selected);header();}
  function render() {app.innerHTML=`<section class="auth-layout"><div><span class="eyebrow">A CAMPUS MADE BY ITS PEOPLE</span><h1>Bring your<br><em>people together.</em></h1><p>Share an idea. Make a poster. Make it happen.</p><div class="auth-art" aria-hidden="true">✳</div></div><form id="auth" class="panel form"><span class="eyebrow">${register?'JOIN THE WALL':'WELCOME BACK'}</span><h2>${register?'Make yourself at home.':'Sign in to CampusWall.'}</h2>${register?`<label>Your university<select name="universityId" required><option value="">Choose your university</option>${options(Object.fromEntries(universities.map(u=>[u.id,u.name])),selected)}</select><span class="muted small">Your account stays on this university after registration.</span></label>`:''}${register?'<label>Display name<input name="name" autocomplete="name" maxlength="50" required placeholder="What should we call you?"></label>':''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" required placeholder="At least 8 characters"></label><p class="error" id="auth-error" role="alert"></p><button class="primary">${register?'Create account':'Sign in'} ↗</button><button type="button" class="quiet" id="switch-auth">${register?'Already have an account? Sign in':'New here? Create an account'}</button>${register?'':'<a class="forgot-link" href="/forgot" data-nav>Forgot your password?</a>'}<p class="muted small">Your university selection doesn’t verify university membership.</p><a href="/${selected||''}" data-nav>← Keep exploring</a></form></section>`;
    mountPasswordToggle($('#auth [name="password"]'));
    if(register)$('[name="name"]').closest('label').insertAdjacentHTML('afterend','<label>Username (optional)<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="e.g. campus_alex"><span class="muted small">Letters, numbers or underscores. Leave blank to get a unique username.</span></label>');
    if(register){
      const form=$('#auth'),email=form.elements.email,school=form.elements.universityId;
      if(universities.length===1){school.value=universities[0].id;school.closest('label').hidden=true;}
      let manualCampus=school.value;
      form.insertBefore(email.closest('label'),school.closest('label'));
      const hint=school.closest('label').querySelector('span');hint.id='registration-campus-hint';hint.setAttribute('aria-live','polite');school.setAttribute('aria-describedby',hint.id);
      function syncEmail(){
        const campus=universityFromEmail(email.value,universities);
        email.setCustomValidity(email.value.trim()&&!validEmail(email.value)?'Enter a valid email address.':'');
        school.disabled=!!campus;school.value=campus?.id||manualCampus;
        hint.textContent=campus?`${campus.shortName} is selected from your university email. Change your email to use another school.`:'A recognised university email selects and locks your school. Otherwise, choose your university.';
      }
      school.onchange=()=>{manualCampus=school.value;};email.oninput=syncEmail;email.onchange=syncEmail;syncEmail();
    }
    $('#switch-auth').onclick=()=>{register=!register;render();};$('#auth').onsubmit=async event=>{event.preventDefault();const form=event.target;const submit=form.querySelector('button');submit.disabled=true;try{const input=Object.fromEntries(new FormData(form));if(register)input.universityId=form.elements.universityId.value;const result=await api(`/api/auth/${register?'register':'login'}`,'POST',input);me=result.user;if(register)try{sessionStorage.setItem('campuswall-welcome',me.id);}catch{}header();if(next==='create'){await navigate(`/${me.universityId||createCampus?.slug||selected||''}`);if(me.universityId)createPoster();}else await navigate(next.startsWith('/')&&!next.startsWith('//')?next:`/${selected||''}`);}catch(error){$('#auth-error').textContent=error.message;submit.disabled=false;}};
  }render();
}
function chooseAccountCampus(){
  app.innerHTML=`<section class="auth-layout"><div><span class="eyebrow">YOUR HOME CAMPUS</span><h1>One campus.<br><em>Your community.</em></h1><p>Choose the university for your account. Your posters and campus chat stay here.</p></div><form id="account-campus-form" class="panel form"><h2>Set your university once.</h2><label>Your university<select name="universityId" required><option value="">Choose your university</option>${options(Object.fromEntries(universities.map(u=>[u.id,u.name])),selected)}</select></label><p class="muted">Once saved, your account’s university cannot be switched. This selection does not verify university membership.</p><p class="error" role="alert"></p><button class="primary">Save my university ↗</button></form></section>`;
  const emailCampus=universityFromEmail(me.email,universities),school=$('#account-campus-form').elements.universityId;
  if(emailCampus){school.value=emailCampus.id;school.disabled=true;$('#account-campus-form .muted').textContent=`${emailCampus.shortName} is selected from your university email. Your account will stay on this school.`;}
  $('#account-campus-form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=$('button',form);button.disabled=true;try{const result=await api('/api/auth/university','POST',{universityId:form.elements.universityId.value});me=result.user;selected=me.universityId;header();await navigate(`/${selected}`,true);}catch(error){$('.error',form).textContent=error.message;}finally{button.disabled=false;}};
}
function editProfile(){
 if(!me)return;
 const node=modal('Make it yours.',`<p class="muted">Your photo appears in campus chat and private conversations.</p><form class="form profile-form"><div class="profile-preview">${avatar(me,'',false)}<div><strong data-i18n-ignore>${esc(me.name)}</strong><p class="muted">@${esc(me.username)}</p></div></div><label>Choose a profile photo<input type="file" accept="image/jpeg,image/png,image/webp" required></label><p class="muted small">JPEG, PNG or WebP · up to 5 MB. Your photo is cropped to a square.</p><p class="error" role="alert"></p><button class="primary" type="submit">Save profile photo ↗</button></form>`);
 const form=$('form',node),input=$('input',node),button=$('button[type=submit]',node);let previewUrl;
 node.addEventListener('close',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);});
 input.onchange=()=>{const file=input.files[0];$('.error',node).textContent='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('.error',node).textContent='Choose a JPEG, PNG or WebP image up to 5 MB.';input.value='';return;}if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);const image=document.createElement('img');image.src=previewUrl;image.alt='New profile photo preview';$('.profile-preview .user-avatar',node).replaceChildren(image);};
 form.onsubmit=async event=>{event.preventDefault();const file=input.files[0];if(!file)return;button.disabled=true;input.disabled=true;button.textContent='Saving…';try{const response=await motionFetch('/api/profile/avatar',{method:'POST',headers:{'content-type':file.type},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to upload photo');if(me?.id===result.user.id){Object.assign(me,result.user);header();profilePanel?.updatePhoto(result.user);}closeDialog(node);toast('Profile photo saved.');}catch(error){$('.error',node).textContent=error.message;}finally{button.disabled=false;input.disabled=false;button.textContent='Save profile photo ↗';}};
}
function modal(title,contents) {const node=document.createElement('dialog');node.className='dialog';node.innerHTML=`<div class="dialog-heading"><h2>${title}</h2><button class="quiet" data-close aria-label="Close dialog">✕</button></div>${contents}`;document.body.append(node);node.querySelector('[data-close]').onclick=()=>closeDialog(node);node.addEventListener('close',()=>node.remove());node.showModal();return node;}
async function createPoster() {
  if(me&&!me.universityId)return navigate('/choose-campus');
  const campus=universities.find(u=>u.id===me?.universityId)||universities.find(u=>u.slug===location.pathname.split('/')[1])||universities.find(u=>u.slug===selected);
  if(!campus){toast('Choose a campus before creating a poster.');return navigate('/');}
  if(!me)return navigate(`/login?next=create&campus=${encodeURIComponent(campus.slug)}`);
  const current=routeId;const [{designChooser}]=await Promise.all([import('./designer.js'),loadStylesheet('/designer.css')]);if(current!==routeId)return;
  const layer=modal('A canvas for your next idea.',designChooser(campus));layer.classList.add('designer-start');
  $('form',layer).onsubmit=async event=>{event.preventDefault();const button=$('form button',layer);button.disabled=true;try{await flush();const input=Object.fromEntries(new FormData(event.target));const p=await api('/api/drafts','POST',{universityId:campus.id,preset:input.preset,title:input.title,style:input.campusStyle?campus.style:'sunshine'});layer.close();navigate(`/studio/posters/${p.id}`);}catch(error){$('.error',layer).textContent=error.message;button.disabled=false;}};
}
async function detail(p,current) {
  app.innerHTML=`<a class="back-link" href="/${p.universityId}" data-nav>← Back to the wall</a>${me&&me.id===p.ownerId?`<div class="owner-bar" role="group" aria-label="Your poster"><span>You published this poster.</span><a class="button" href="/studio/posters/${p.id}" data-nav>Edit your poster ↗</a><button type="button" class="button-danger" id="delete-poster">Delete poster</button></div>`:''}<section class="poster-detail"><div>${poster(p,true)}</div><div class="detail-info"><span class="eyebrow"><span>${esc(p.category)}</span> / ${esc(universities.find(u=>u.id===p.universityId)?.shortName)}</span><h1 data-i18n-ignore>${esc(p.title)}</h1>${statusBadge(p)}<div class="detail-tools">${saveButton(p)}${p.date?`<a class="button" href="/api/posters/${p.id}/calendar" download>Add to calendar</a>`:''}<button id="share-poster">Share & QR code ↗</button>${officialLink(p,'button primary poster-official')}</div><p class="subtitle">${esc(p.subtitle)}</p><dl><div><dt>WHEN</dt><dd>${esc(dateText(p.date))}${p.time?` · ${esc(p.time)}`:''}</dd></div><div><dt>WHERE</dt><dd>${esc(p.location)}</dd></div>${p.organiser?`<div><dt>ORGANISED BY</dt><dd data-i18n-ignore>${esc(p.organiser)}</dd></div>`:''}<div><dt>SHARED BY</dt><dd>${esc(p.owner)}</dd></div></dl><p class="muted small">Times are local to campus.${p.time?'':' No time listed; the calendar entry will be all day.'}</p><a class="campus-map" href="${esc(universities.find(u=>u.id===p.universityId)?.mapUrl||'#')}" target="_blank" rel="noopener noreferrer">Open campus map ↗</a><p class="description" data-i18n-ignore>${linkify(p.description)}</p><p class="muted small">Published ${new Date(p.publishedAt).toLocaleDateString('en-AU')}${p.ownerId==='campus-team'?' · Sample / legacy notice':''}</p><section class="comments"><h2>Around this poster</h2><div id="comments"></div>${me?'<form id="comment-form" class="form"><label>Add to the conversation<textarea name="body" maxlength="1000" required rows="3" placeholder="A question, a thought, a hello…"></textarea></label><button class="primary">Post comment</button><p class="error" role="alert"></p></form>':`<a class="button" href="/login?next=${encodeURIComponent(location.pathname)}" data-nav>Sign in to comment ↗</a>`}</section></div></section>`;
  $('.comments').insertAdjacentHTML('beforebegin','<section id="event-registration" aria-label="Event registration"></section>');
  const [{mountEventRegistration}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;eventPanel=mountEventRegistration($('#event-registration'),{user:me,poster:p,api,navigate,toast});
  $('#share-poster').onclick=()=>sharePoster(p);$('#delete-poster')?.addEventListener('click',()=>deletePoster(p,()=>navigate(`/${p.universityId}`,true)));
  if(p.isTest&&p.photoPoster){
    $('.detail-info h1').insertAdjacentHTML('afterend','<aside class="test-event-alert"><strong>TEST EVENT</strong><p>This activity and its date are fictional. The venue exists, but no event is scheduled, no venue is booked and no tickets are available. Please do not attend based on this poster.</p></aside>');
    $('.campus-map').href=p.photoPoster.venueMap;
    $('.campus-map').textContent='Find this real venue on the map ↗';
    $('.description').insertAdjacentHTML('afterend',`<div class="photo-provenance"><a href="${esc(p.photoPoster.venueSource)}" target="_blank" rel="noopener noreferrer">Venue reference — official university source ↗</a><br>Illustrative photograph by <a href="${esc(p.photoPoster.photoSource)}" target="_blank" rel="noopener noreferrer">${esc(p.photoPoster.credit)} / Pexels ↗</a>, used under the <a href="${esc(p.photoPoster.license)}" target="_blank" rel="noopener noreferrer">Pexels licence</a>. This photo does not show the listed campus venue.</div>`);
  }
  if(!safeUrl(p.eventUrl))$('#share-poster').insertAdjacentHTML('afterend',contactOrganiser(p));
  const reviewable=me&&me.id!==p.ownerId&&p.ownerId!=='campus-team';
  if(reviewable)$('.campus-map').insertAdjacentHTML('afterend',`<div class="report-row"><button type="button" class="quiet report-link" id="report-poster"><span aria-hidden="true">⚑</span> Report this poster</button>${me.isModerator?'<button type="button" class="button-danger" id="moderate-poster">Take poster down (moderator)</button>':''}</div>`);
  $('#report-poster')?.addEventListener('click',()=>import('./moderation.js').then(m=>m.openReport({modal,closeDialog,api,toast,targetType:'poster',targetId:p.id})));
  $('#moderate-poster')?.addEventListener('click',()=>import('./moderation.js').then(m=>m.confirmRemoval({modal,closeDialog,api,toast,targetType:'poster',targetId:p.id,title:p.title,onRemoved:()=>navigate(`/${p.universityId}`,true)})));
  // The server returns the newest 100 comments; older pages load on request.
  let comments=[],olderComments=false,commentClientId=null;
  function drawComments(){$('#comments').innerHTML=(olderComments?'<button type="button" class="quiet comments-older">Show earlier comments</button>':'')+(comments.length?comments.map(c=>`<article class="comment"><strong data-i18n-ignore>${esc(c.author)}</strong><time>${new Date(c.createdAt).toLocaleDateString('en-AU')}</time>${me&&(me.id===c.authorId||me.id===p.ownerId)?`<button type="button" class="quiet comment-remove" data-comment="${esc(c.id)}">Remove</button>`:me?.isModerator?`<button type="button" class="quiet comment-remove" data-moderate-comment="${esc(c.id)}">Remove (moderator)</button>`:''}${me&&me.id!==c.authorId?`<button type="button" class="quiet comment-report" data-report-comment="${esc(c.id)}">Report</button>`:''}<p data-i18n-ignore>${esc(c.body)}</p></article>`).join(''):'<p class="muted">No comments yet. Start the conversation.</p>');
    $('.comments-older')?.addEventListener('click',()=>loadComments(true));
    document.querySelectorAll('[data-report-comment]').forEach(b=>b.onclick=()=>import('./moderation.js').then(m=>m.openReport({modal,closeDialog,api,toast,targetType:'comment',targetId:b.dataset.reportComment})));
    document.querySelectorAll('[data-moderate-comment]').forEach(b=>b.onclick=()=>import('./moderation.js').then(m=>m.confirmRemoval({modal,closeDialog,api,toast,targetType:'comment',targetId:b.dataset.moderateComment,onRemoved:()=>{comments=comments.filter(c=>c.id!==b.dataset.moderateComment);drawComments();}})));
    document.querySelectorAll('[data-comment]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this comment?'))return;b.disabled=true;try{await api(`/api/posters/${p.id}/comments/${b.dataset.comment}`,'DELETE');comments=comments.filter(c=>c.id!==b.dataset.comment);drawComments();toast('Comment removed.');}catch(error){b.disabled=false;toast(error.message,{kind:'error'});}});}
  async function loadComments(older=false) {try{const list=await api(`/api/posters/${p.id}/comments${older&&comments[0]?'?before='+encodeURIComponent(comments[0].id):''}`);if(current!==routeId)return;comments=older?[...list,...comments]:list;olderComments=list.length>=100;drawComments();}catch(error){toast(error.message,{kind:'error'});}}
  if($('#comment-form'))$('#comment-form').onsubmit=async event=>{event.preventDefault();const form=event.target;const button=$('button',form);button.disabled=true;commentClientId||=crypto.randomUUID();try{await api(`/api/posters/${p.id}/comments`,'POST',{body:form.elements.body.value,clientId:commentClientId});commentClientId=null;form.reset();$('.error',form).textContent='';await loadComments();}catch(error){$('.error',form).textContent=error.message;}finally{button.disabled=false;}};
  if($('#comment-form'))$('#comment-form').elements.body.addEventListener('input',()=>{commentClientId=null;});
  await loadComments();if(current===routeId)live(`wall=${p.universityId}`,message=>{if(message.type==='wall:changed'){api(`/api/posters/${p.id}`).then(()=>{if(current===routeId)loadComments();}).catch(error=>{if(current===routeId)errorPage(error.message);});}});
}
function field(label,name,type='text',max=100) {return `<label>${label}<input aria-label="${esc(label)}" data-field="${name}" name="${name}" type="${type}" maxlength="${max}" value="${esc(draft[name])}"></label>`;}
function imagePicker() {
  return `<section class="image-picker"><label>Upload an event image<input id="image-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted small" id="upload-message">JPEG, PNG or WebP · up to 5 MB. Images are resized for the poster.</p><div id="image-preview"></div><label>Or use an HTTPS image link<input data-field="heroImageUrl" type="url" maxlength="1500" value="${esc(draft.heroImageUrl.startsWith('/media/')?'':draft.heroImageUrl)}" placeholder="https://…"></label></section>`;
}
function imagePreview() {
  const node=$('#image-preview');if(!node||!draft)return;
  node.innerHTML=draft.heroImageUrl?`<div class="uploaded-image"><img src="${esc(draft.heroImageUrl)}" alt="Selected event image"><button type="button" class="quiet" id="remove-image">Remove image</button></div>`:'';
  if($('#remove-image')){const button=$('#remove-image');button.disabled=!connected||uploading;button.onclick=()=>{queueField('heroImageUrl','');imagePreview();};}
}
async function uploadHero(file) {
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Choose a JPEG, PNG or WebP image.');return;}
  if(file.size>5*1024*1024){toast('Choose an image smaller than 5 MB.');return;}
  const posterId=draft.id,current=routeId;let uploadedSrc=null;
  try {
    await flush();uploading=true;setConnection('Connected · Uploading image…');$('#upload-message').textContent=`Uploading ${file.name}…`;
    const response=await motionFetch(`/api/drafts/${posterId}/image`,{method:'POST',headers:{'content-type':file.type},body:file});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to upload image');
    if(current!==routeId)return;
    if(result.version>=draft.version){draft=result;for(const [field,entry] of pending)draft[field]=entry.value;syncInputs();preview();}
    uploadedSrc=result.heroImageUrl;$('#upload-message').textContent='Image uploaded and saved. You can choose another to replace it.';toast('Image ready.');
  }catch(error){toast(error.message,{kind:'error'});if(current===routeId&&$('#upload-message'))$('#upload-message').textContent=error.message;}
  finally{uploading=false;if(current===routeId){if(uploadedSrc)whiteboardPanel?.imageUploaded(uploadedSrc);if($('#image-file'))$('#image-file').value='';setConnection(connected?(pending.size?'Connected · Saving…':'Connected · Saved'):'Reconnecting…');}}
}
const fieldNames={title:'event title',subtitle:'subtitle',date:'date',time:'time',location:'location',category:'category',description:'description',template:'template',style:'colour palette',alignment:'alignment',heroImageUrl:'image'};
function sendEditing(field) {if(connected&&draft&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'poster:editing',posterId:draft.id,field}));}
function editingPresence(people) {
  if(!$('#presence'))return;
  $('#presence').textContent=people.map(person=>person.id===me.id?`${person.name} (you)`:person.name).join(' · ');
  if($('#studio-people'))$('#studio-people').innerHTML=people.map(person=>`<span class="studio-person"><b>${esc(person.name.slice(0,1))}</b>${esc(person.name)}${person.id===me.id?' · you':''}</span>`).join('');
  const others=people.filter(person=>person.id!==me.id);
  document.querySelectorAll('[data-field]').forEach(input=>{
    const label=input.closest('label');if(!label)return;let hint=$('.field-presence',label);
    if(!hint){hint=document.createElement('span');hint.className='field-presence';hint.setAttribute('aria-live','polite');label.append(hint);}
    const editors=others.filter(person=>person.editingFields?.includes(input.dataset.field));
    label.classList.toggle('peer-editing',editors.length>0);hint.textContent=editors.length?`${editors.map(person=>person.name).join(', ')} ${editors.length===1?'is':'are'} editing ${fieldNames[input.dataset.field]||input.dataset.field}`:'';
  });
}
function deletePoster(p,onDeleted) {
  if(!p)return;
  const layer=modal('Delete this poster?',`<p class="delete-poster-name" data-i18n-ignore>${esc(p.title||'Untitled event')}</p><p>${p.status==='DRAFT'?'This draft will be deleted for you and anyone you invited. This can’t be undone.':'It will disappear from the wall for everyone, along with its comments and bookings. This can’t be undone.'}</p><div class="delete-poster-actions"><button type="button" data-keep autofocus>Keep it</button><button type="button" class="button-danger" id="confirm-delete">Delete permanently</button></div><p class="error" role="alert"></p>`);
  $('[data-keep]',layer).onclick=()=>closeDialog(layer);
  $('#confirm-delete',layer).onclick=async e=>{const button=e.currentTarget;button.disabled=true;button.textContent='Deleting…';try{await api(`/api/drafts/${p.id}`,'DELETE');closeDialog(layer);onDeleted?.();toast('Poster deleted.');}catch(error){button.disabled=false;button.textContent='Delete permanently';$('.error',layer).textContent=error.message;}};
}
function sharePoster(p) {
  const link=new URL(`/${p.universityId}/posters/${p.slug}`,location.origin).href;
  const layer=modal('Bring a friend along.',`<p class="muted">Share this public poster, or put its QR code on a noticeboard.</p><img class="share-qr" src="/api/posters/${p.id}/qr" alt="QR code for ${esc(p.title)}"><label class="share-link">Poster link<input readonly value="${esc(link)}"></label><div class="share-actions"><button class="primary" id="copy-link">Copy link</button><a class="button" href="/api/posters/${p.id}/qr?download=1" download>Download QR code</a></div><p class="muted small" id="share-status" role="status"></p>`);
  $('#copy-link',layer).onclick=async()=>{try{await navigator.clipboard.writeText(link);$('#share-status',layer).textContent='Link copied. Ready to share.';}catch{$('input',layer).select();$('#share-status',layer).textContent='Select and copy the link above.';}};
}
async function studio(p) {
  const current=routeId;const [{studioMarkup},{mountWhiteboard,ensurePublicationDetails}]=await Promise.all([import('./designer.js'),import('./whiteboard.js'),loadStylesheet('/designer.css'),loadStylesheet('/whiteboard.css')]);if(current!==routeId)return;undoEdits=[];redoEdits=[];
  draft=p;selected=p.universityId;localStorage.setItem('campuswall-university',selected);header();const isOwner=me.id===p.ownerId;let publishing=false;
  app.innerHTML=studioMarkup(p,{field,options,imagePicker,poster,university:universities.find(u=>u.id===p.universityId),isOwner,styles,templates});
  whiteboardPanel=mountWhiteboard(app,{getDraft:()=>draft,user:me,isConnected:()=>connected&&!uploading,send:message=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));},onPending:()=>setConnection(pending.size||whiteboardPanel?.hasPending()?'Connected · Saving…':'Connected · Saved'),toast,flushAll:flush});
  $('#editor-form').onsubmit=e=>e.preventDefault();
  document.querySelectorAll('[data-field]').forEach(input=>{input.oninput=()=>queueField(input.dataset.field,input.value);input.onfocus=()=>sendEditing(input.dataset.field);input.onblur=()=>sendEditing(null);});
  $('[data-field="location"]').setAttribute('list','campus-locations');
  $('#image-file').onchange=event=>uploadHero(event.target.files[0]);
  $('#image-file').onfocus=()=>sendEditing('heroImageUrl');
  $('#image-file').onblur=()=>sendEditing(null);
  imagePreview();
  editingTimer=setInterval(()=>{if(!connected)return;const field=document.hasFocus()?document.activeElement?.dataset.field:null;sendEditing(field||null);},5000);
  $('#studio-details').onclick=()=>whiteboardPanel?.openEventDetails(['title','date','location'].find(name=>!String(draft?.[name]||'').trim())||'date');
  if(isOwner){$('#collaborators').onclick=()=>import('./collaborators.js').then(m=>m.manageCollaborators(p.id,{modal,api,toast}));$('#publish').onclick=async()=>{if(publishing)return;publishing=true;try{await flush();if(current!==routeId||!ensurePublicationDetails(draft,whiteboardPanel,toast))return;const result=await api(`/api/drafts/${p.id}/publish`,'POST');if(current!==routeId)return;const path=`/${result.universityId}/posters/${result.slug}`;await navigate(path);if(location.pathname===path&&app.querySelector('.poster-detail'))feedback.celebrate();else toast('Your poster is on the wall.');if(blankCanvas(draft?.canvas))toast('Your artwork was blank, so the wall shows a cover made from your event details.');}catch(error){if(current!==routeId)return;const missing=/Unable to publish: (title|date|location) is missing/.exec(error.message);if(missing)whiteboardPanel?.openEventDetails(missing[1]);toast(error.message,{kind:'error'});}finally{publishing=false;}};if($('#unpublish'))$('#unpublish').onclick=async()=>{try{await flush();await api(`/api/drafts/${p.id}/unpublish`,'POST');toast('Poster returned to a private draft.');route();}catch(error){toast(error.message,{kind:'error'});}};$('#delete').onclick=()=>deletePoster(draft||p,()=>{pending.clear();for(const t of timers.values())clearTimeout(t);timers.clear();navigate('/my-posters',true);});}
  readiness();setConnection('Connecting…');
  live(`poster=${p.id}`,message=>{
    if(message.type==='canvas:cursor'){whiteboardPanel?.receive(message);return;}
    if(message.type==='poster:state'){pending.clear();draft=message.poster;connected=true;whiteboardPanel?.receive(message);syncInputs();preview();setConnection('Connected · Saved');}
    if(message.type==='poster:updated'){
      if(message.poster.version<draft.version)return;
      if(message.field&&pending.get(message.field)?.requestId===message.requestId)pending.delete(message.field);
      draft=message.poster;for(const [field,entry] of pending)draft[field]=entry.value;
      whiteboardPanel?.receive(message);syncInputs();preview();setConnection(pending.size?'Connected · Saving…':'Connected · Saved');
    }
    if(message.type==='presence')editingPresence(message.people);
    if(message.type==='error'){whiteboardPanel?.receive(message);if(pending.get(message.field)?.requestId===message.requestId){pending.delete(message.field);clearTimeout(timers.get(message.field));timers.delete(message.field);}if(message.poster){draft=message.poster;for(const [field,entry] of pending)draft[field]=entry.value;syncInputs();preview();}toast(message.message,{kind:'error'});setConnection(connected?(pending.size?'Connected · Saving…':'Connected · Saved'):'Reconnecting…');}
  },true);
}
function setConnection(text) {if(!$('#save-status'))return;whiteboardPanel?.connectionChanged(connected&&!uploading);if(connected&&whiteboardPanel?.hasPending())text='Connected · Saving…';$('#save-status').textContent=uploading&&connected?'Connected · Uploading image…':text;document.querySelectorAll('[data-field]').forEach(input=>input.disabled=!connected||uploading);if($('#image-file'))$('#image-file').disabled=!connected||uploading;if($('#remove-image'))$('#remove-image').disabled=!connected||uploading;if($('#publish'))$('#publish').disabled=!connected||uploading;historyButtons();}
function syncInputs() {document.querySelectorAll('[data-field]').forEach(input=>{const raw=Object.hasOwn(designFields,input.dataset.field)?designValue(draft,input.dataset.field):draft[input.dataset.field]??'';const value=input.dataset.field==='heroImageUrl'&&raw.startsWith('/media/')?'':raw;if(input.value!==value)input.value=value;});document.querySelectorAll('[data-value-for]').forEach(output=>output.textContent=designValue(draft,output.dataset.valueFor));}
function preview() {if(!$('#preview'))return;$('#preview').innerHTML=poster(draft,true);$('#version').textContent=`Version ${draft.version}`;$('#poster-status').textContent=draft.status;readiness();imagePreview();}
function readiness() {const detailsButton=$('#studio-details');if(detailsButton&&draft){const missing=['title','date','location'].filter(name=>!String(draft[name]||'').trim()).length;detailsButton.textContent=missing?`Event details · ${missing} to add`:'Event details ✓';detailsButton.classList.toggle('needs-details',missing>0);}const checks=[['title','Event title'],['date','Date'],['location','Location']];$('#readiness').innerHTML=`<h3>Poster readiness</h3>${checks.map(([field,label])=>`<p>${draft[field]?'✓':'○'} ${label}</p>`).join('')}${!draft.time?'<p class="muted">○ Add a time to help people plan.</p>':''}${draft.description.length>500?'<p class="muted">△ A shorter description is easier to scan.</p>':''}${draft.hasUnpublishedChanges?'<p class="muted">Draft changes need republishing.</p>':''}<p class="muted small">${draft.status==='PUBLISHED'?'The wall shows your last published version.':'Only you and invited collaborators can see this draft.'}</p>`;}
function historyButtons(){if(whiteboardPanel){whiteboardPanel.historyButtons();return;}if($('#studio-undo'))$('#studio-undo').disabled=!connected||uploading||!undoEdits.length;if($('#studio-redo'))$('#studio-redo').disabled=!connected||uploading||!redoEdits.length;}
async function travelHistory(forward){try{await flush();const source=forward?redoEdits:undoEdits,target=forward?undoEdits:redoEdits,entry=source.at(-1);if(!entry)return;const expected=forward?entry.before:entry.after,replacement=forward?entry.after:entry.before;if(Object.entries(expected).some(([key,value])=>String(draft[key]??designValue(draft,key)??'')!==value)){source.pop();historyButtons();toast('A collaborator changed this field. Their edit has been kept.');return;}source.pop();target.push(entry);queueChanges(Object.entries(replacement).map(([field,value])=>({field,value})),{record:false});}catch(error){toast(error.message,{kind:'error'});}}
function queueField(field,value){queueChanges([{field,value}]);}
function queueChanges(changes,{immediate=false,record=true}={}){
  if(!connected||uploading)return;
  changes=changes.filter(({field,value})=>String(draft[field]??designValue(draft,field)??'')!==String(value));if(!changes.length)return;
  const before={},after={};for(const {field,value} of changes){before[field]=String(draft[field]??designValue(draft,field)??'');after[field]=String(value);}
  if(record){const last=undoEdits.at(-1),keys=Object.keys(after).sort().join(',');if(last&&last.keys===keys&&Date.now()-last.time<700&&Object.entries(before).every(([key,value])=>last.after[key]===value)){last.after=after;last.time=Date.now();}else undoEdits.push({before,after,keys,time:Date.now()});if(undoEdits.length>40)undoEdits.shift();redoEdits=[];}
  for(const {field,value} of changes){draft[field]=String(value);if(Object.hasOwn(designFields,field))draft.designVersion='1';pending.set(field,{value:String(value),requestId:crypto.randomUUID()});clearTimeout(timers.get(field));timers.delete(field);if(immediate)sendField(field);else timers.set(field,setTimeout(()=>{timers.delete(field);sendField(field);},250));}
  syncInputs();preview();setConnection('Connected · Saving…');
}
function sendField(field) {const entry=pending.get(field);if(!entry||!connected||socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({type:'poster:update',posterId:draft.id,field,value:entry.value,requestId:entry.requestId,clientVersion:draft.version}));}
try{[universities,{user:me}]=await Promise.all([api('/api/universities'),api('/api/auth/me')]);for(const u of universities)styles[u.style]=u.paletteLabel;if(!universities.some(u=>u.slug===selected))selected=universities.length===1?universities[0].slug:null;header();await route();afterRoute({focus:false});}catch(error){errorPage(error.message);}

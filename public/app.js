import {avatar} from './chat-ui.js';
import { campusToday, dayAfter, eventStatus, formatEventDate } from './event-utils.js';
import { validEmail, universityFromEmail } from './email-utils.js';
import { mountChat } from './chat.js';
import {canvasPoster} from './canvas-model.js';
import {designedPoster,designValue,designFields} from './poster-design.js';
import { photoPoster } from './photo-posters.js';
import {escapeHtml as esc,normaliseSearch,loadStylesheet,createSessionMount} from './ui-utils.js';
import {installMotion,withRequestMotion,motionFetch,closeDialog} from './motion.js';
installMotion();
const mountVoiceCalls=createSessionMount(()=>import('./voice-calls.js').then(module=>module.mountVoiceCalls));
const mountCommunityHeader=createSessionMount(()=>import('./community.js').then(module=>module.mountCommunityHeader));
document.addEventListener('error',event=>{if(event.target.matches?.('.user-avatar img'))event.target.remove();},true);
const $ = (s,root=document) => root.querySelector(s);
const app=$('#app');
const watchDocument=/^\/watch(?:\/|$)/.test(location.pathname);
const categories=['Social','Academic','Clubs','Sport','Arts','Career','Other'];
const templates={minimal:'Minimal event',photo:'Photo event',club:'Club recruitment',seminar:'Academic seminar',social:'Social event'};
const styles={sunshine:'Sunshine',sage:'Sage green',lavender:'Lavender',coral:'Warm coral',sky:'Sky blue',ink:'Midnight'};
let me=null,universities=[],selected=localStorage.getItem('campuswall-university'),socket=null,retry=null,routeId=0,draft=null;
const pending=new Map(),timers=new Map();
let stopped=false,connected=false,renderedPath=location.pathname+location.search,uploading=false,editingTimer=null,chatPanel=null,messagesPanel=null,gamesPanel=null,watchPanel=null,profilePanel=null,designerPanel=null,whiteboardPanel=null,communityPanel=null,eventPanel=null,watchExtras=null,wallPanel=null;let undoEdits=[],redoEdits=[];
async function api(path,method='GET',data,{signal}={}) {return withRequestMotion(async()=>{const response=await fetch(path,{method,signal,headers:{'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const value=await response.json();if(!response.ok){const error=new Error(value.error||'Unable to complete this request');error.status=response.status;throw error;}return value;});}
function toast(text) {const node=$('#toast');node.textContent=text;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),5000);}
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
  mountVoiceCalls({user:me,api,toast,navigate}).catch(error=>toast(error.message));
  const campus=universities.find(u=>u.slug===selected),brand=campus?.logo?`<img class="campus-logo" src="${esc(campus.logo.src)}" width="${campus.logo.width}" height="${campus.logo.height}" alt="${esc(campus.name)} logo" fetchpriority="high"><span class="brand-product">CampusWall</span>`:'<span class="brand-mark">▦</span> CampusWall<span class="brand-dot">.</span>';
  $('#header').innerHTML=`<a class="brand${campus?.logo?' school-brand':''}" href="/${selected||''}" aria-label="${esc(campus?`CampusWall — ${campus.shortName} home`:'CampusWall home')}" data-nav>${brand}</a>${me?`<div class="campus-picker account-campus" aria-label="Account university" title="Your account university is fixed">${esc(universities.find(u=>u.id===me.universityId)?.shortName||'Set your campus')}</div>`:`<label class="campus-picker"><span class="sr-only">Choose university</span><select id="campus"><option value="">Choose campus</option>${universities.map(u=>`<option value="${u.slug}" ${selected===u.slug?'selected':''}>${u.shortName}</option>`).join('')}</select></label>`}<nav>${me?`<button class="quiet profile-button" id="profile" aria-label="My profile">${avatar(me,'',false)}<span>${esc(me.name)}</span></button><button class="quiet" id="logout" title="Sign out">Sign out</button>`:`<a href="/login" data-nav>Sign in</a>`}<button class="primary" id="create">＋ Create poster</button></nav>`;
  $('#header nav').insertAdjacentHTML('afterbegin',`<a href="/community" data-nav>Campus life</a><a href="/watch" data-nav>Watch together</a><a href="/messages" data-nav>Messages</a><details class="nav-more"><summary>Explore</summary><div><a href="/games" data-nav>Games</a>${selected?`<a href="/${selected}/clubs" data-nav>Clubs & societies</a>`:''}${me?'<a href="/saved" data-nav>Saved events</a><a href="/my-posters" data-nav>My posters</a>':''}</div></details>`);
  if(me)$('#header nav').insertAdjacentHTML('beforeend','<a href="/community/notifications" id="community-bell" aria-label="Notifications" data-nav>◉<span id="community-unread" hidden></span></a>');
  mountCommunityHeader({user:me,api,onAuthExpired(){me=null;header();toast('Sign in again to view campus updates.');}}).catch(error=>toast(error.message));
  if($('#campus'))$('#campus').onchange=e=>{if(e.target.value)navigate(`/${e.target.value}${universities.some(u=>location.pathname===`/${u.slug}/clubs`)?'/clubs'+location.search:''}`);};$('#create').onclick=createPoster;
  if($('#profile'))$('#profile').onclick=()=>navigate('/people/'+me.id);
  if($('#logout'))$('#logout').onclick=async()=>{try{await flush();await mountVoiceCalls({user:null,api,toast,navigate});disconnect();await api('/api/auth/logout','POST');me=null;header();await navigate(`/${selected||''}`);}catch(error){toast(error.message);await route();}};
}
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
async function navigate(path,replace=false) {try{await flush();if(/^\/watch(?:\/|$)/.test(path)&&!watchDocument){location[replace?'replace':'assign'](path);return;}history[replace?'replaceState':'pushState']({},'',path);await route();window.scrollTo(0,0);}catch(error){toast(error.message);}}
function openAvatar(event){const node=event.target.closest?.('[data-profile-user]');if(!node)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();navigate('/people/'+node.dataset.profileUser);}
document.addEventListener('click',openAvatar,true);document.addEventListener('keydown',openAvatar,true);
document.addEventListener('click',event=>{const save=event.target.closest('[data-save]');if(save){toggleSaved(save);return;}const link=event.target.closest('a[data-nav]');if(link&&!event.ctrlKey&&!event.metaKey&&event.button===0){event.preventDefault();navigate(link.getAttribute('href'));}});
window.addEventListener('popstate',async()=>{try{await flush();await route();}catch(error){history.pushState({},'',renderedPath);toast(error.message);}});
window.addEventListener('beforeunload',event=>{if(pending.size||uploading){event.preventDefault();event.returnValue='';}});
function disconnect() {wallPanel?.destroy();wallPanel=null;communityPanel?.destroy();communityPanel=null;eventPanel?.destroy();eventPanel=null;watchExtras?.destroy();watchExtras=null;watchPanel?.destroy();watchPanel=null;profilePanel?.destroy();profilePanel=null;whiteboardPanel?.destroy();whiteboardPanel=null;designerPanel?.destroy();designerPanel=null;chatPanel?.destroy();chatPanel=null;messagesPanel?.destroy();messagesPanel=null;gamesPanel?.destroy();gamesPanel=null;stopped=true;clearTimeout(retry);clearInterval(editingTimer);if(socket){socket.onclose=null;socket.close();socket=null;}connected=false;pending.clear();for(const timer of timers.values())clearTimeout(timer);timers.clear();}
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
  if(p.canvas)return canvasPoster(p,large);
  if(p.designVersion==='1')return designedPoster(p,uni,dateText,large,large&&location.pathname.startsWith('/studio/posters/'));
  const safeStyle=Object.hasOwn(styles,p.style)?p.style:'sunshine',safeTemplate=Object.hasOwn(templates,p.template)?p.template:'minimal';
  return `<div class="poster ${safeStyle} ${safeTemplate} ${large?'large':''} ${p.alignment==='center'?'center':''}" aria-label="${esc(p.title||'Untitled poster')}"><div class="poster-top"><span>${esc(uni?.shortName||'CAMPUS')} / ${esc(p.category)}</span><span>↗</span></div>${p.heroImageUrl?`<img class="poster-image" src="${esc(p.heroImageUrl)}" alt="${esc(p.title||'Event image')}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="poster-art" aria-hidden="true"><span></span><i></i><b>✳</b></div>`}<div class="poster-copy"><p class="poster-kicker">${esc(p.subtitle||'Something good is happening.')}</p><h2>${esc(p.title||'Your next campus moment')}</h2></div><div class="poster-bottom"><strong>${esc(dateText(p.date))} ${p.time?`/ ${esc(p.time)}`:''}</strong><span>${esc(p.location||'Your campus, your place')}</span></div></div>`;
}
function statusBadge(p) {const status=eventStatus(p);return `<span class="event-status ${status.kind}">${status.label}</span>`;}
function saveButton(p) {return `<button class="save-button ${p.isSaved?'saved':''}" data-save="${p.id}" data-saved="${!!p.isSaved}" aria-pressed="${!!p.isSaved}" aria-label="${p.isSaved?'Unsave':'Save'} ${esc(p.title)}">${p.isSaved?'★ Saved':'☆ Save event'}</button>`;}
function contactOrganiser(p){return p.canMessageOwner&&me?.id!==p.ownerId?`<a class="button poster-contact" href="/messages?poster=${encodeURIComponent(p.id)}" data-nav aria-label="Message ${esc(p.owner)} about ${esc(p.title)}">Message organiser ↗</a>`:'';}
function card(p,privateView=false) {return `<article class="poster-card"><a class="poster-link" href="${privateView?`/studio/posters/${p.id}`:`/${p.universityId}/posters/${p.slug}`}" data-nav>${poster(p)}<div class="card-meta"><div class="meta-top"><span class="category">${esc(p.category)}</span><span${p.isTest?' class="test-card-label"':''}>${p.isTest?'Test event':privateView?esc(p.status):(p.ownerId==='campus-team'?'Sample notice':`${p.commentCount} comments`)}</span></div><h3>${esc(p.title||'Untitled event')}</h3><p>${esc(dateText(p.date))}${p.time?` · ${esc(p.time)}`:''}</p><p class="location">⌖ ${esc(p.location||'Location to come')}</p><div class="card-author">${p.isTest?'CampusWall test collection':esc(p.owner)} <span>↗</span></div></div></a>${privateView?'':`<div class="card-tools">${statusBadge(p)}${saveButton(p)}${contactOrganiser(p)}</div>`}</article>`;}
async function toggleSaved(button) {
  if(!me)return navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
  const posterId=button.dataset.save,wasSaved=button.dataset.saved==='true';button.disabled=true;
  try {
    const result=await api(`/api/posters/${posterId}/save`,wasSaved?'DELETE':'POST');
    document.querySelectorAll('[data-save]').forEach(b=>{if(b.dataset.save!==posterId)return;b.dataset.saved=String(result.isSaved);b.classList.toggle('saved',result.isSaved);b.setAttribute('aria-pressed',String(result.isSaved));b.setAttribute('aria-label',`${result.isSaved?'Unsave':'Save'} event`);b.textContent=result.isSaved?'★ Saved':'☆ Save event';});
    toast(result.isSaved?'Saved to your events.':'Event removed from your saved list.');
    if(location.pathname==='/saved'&&!result.isSaved)await route();
  }catch(error){toast(error.message);}finally{button.disabled=false;}
}
function errorPage(message) {app.innerHTML=`<section class="empty"><span class="eyebrow">LET’S TRY THAT AGAIN</span><h1>${esc(message)}</h1><a class="button" href="/${selected||''}" data-nav>Back to campus wall</a></section>`;}
async function route() {
  disconnect();draft=null;renderedPath=location.pathname+location.search;const current=++routeId;const path=location.pathname;
  app.innerHTML='<div class="loading" role="status">Finding your campus moments…</div>';
  try {
    const requestedCampus=universities.find(u=>u.slug===path.split('/')[1]);
    if(me&&!me.universityId){if(requestedCampus)selected=requestedCampus.slug;if(path!=='/choose-campus')return navigate('/choose-campus',true);header();return chooseAccountCampus();}
    if(path==='/choose-campus')return navigate(me?`/${me.universityId}`:'/login',true);
    if(me?.universityId&&requestedCampus&&requestedCampus.id!==me.universityId){toast('Your account stays on your own university.');return navigate(`/${me.universityId}${path.endsWith('/clubs')?'/clubs'+location.search:''}`,true);}
    if(path==='/') {if(selected&&universities.some(u=>u.slug===selected))return navigate(`/${selected}`,true);return chooser();}
    const uni=universities.find(u=>u.slug===path.split('/')[1]);if(uni){selected=uni.slug;localStorage.setItem('campuswall-university',selected);header();}
    if(path==='/community'||path.startsWith('/community/')){const [{mountCommunity}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;communityPanel=mountCommunity(app,{user:me,campus:universities.find(u=>u.id===selected),api,navigate,toast,path});return;}
    if(path==='/watch'||/^\/watch\/[a-f0-9-]{36}$/.test(path)){if(path!=='/watch'&&!me)return navigate('/login?next='+encodeURIComponent(path),true);const [{mountWatch}]=await Promise.all([import('./watch.js'),loadStylesheet('/watch.css')]);if(current!==routeId)return;watchPanel=mountWatch(app,{user:me,campus:universities.find(u=>u.id===selected),api,navigate,toast,roomId:path.split('/')[2],onAuthExpired(){me=null;header();toast('Sign in again to watch together.');navigate('/login?next='+encodeURIComponent(path),true);}});if(path.split('/')[2]&&me){const [{mountWatchExtras}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;$('.watch-audience').insertAdjacentHTML('beforebegin','<div id="watch-extras"></div>');watchExtras=mountWatchExtras($('#watch-extras'),{user:me,roomId:path.split('/')[2],api,navigate,toast});}return;}
    if(/^\/people\/[a-f0-9-]{36}$/.test(path)){const [{mountProfile}]=await Promise.all([import('./profile.js'),loadStylesheet('/profile.css'),loadStylesheet('/community.css')]);if(current!==routeId)return;profilePanel=mountProfile(app,{profileId:path.split('/')[2],user:me,universities,api,navigate,editPhoto:editProfile,toast});return;}
    if(path==='/login')return login();
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
    if(path==='/my-posters'){if(!me)return navigate('/login?next=/my-posters',true);const list=await api('/api/drafts');if(current!==routeId)return;app.innerHTML=`<section class="hero"><div><span class="eyebrow">YOUR LITTLE CORNER OF CAMPUS</span><h1>Made by you.<br><em>Better together.</em></h1></div><p>Drafts stay between you and your collaborators. Publish when you’re ready to share.</p></section><div class="section-label"><h2>My posters & collaborations</h2><button class="primary" id="new-draft">＋ Create poster</button></div>${list.length?`<div class="poster-grid">${list.map(p=>card(p,true)).join('')}</div>`:`<div class="empty"><h2>You haven’t created any posters yet.</h2><p>Your next campus moment starts here.</p></div>`}`;$('#new-draft').onclick=createPoster;return;}
    if(path.startsWith('/studio/posters/')){if(!me)return navigate(`/login?next=${encodeURIComponent(path)}`,true);const p=await api(`/api/drafts/${path.split('/').pop()}`);if(current!==routeId)return;return studio(p);}
    if(uni&&path===`/${uni.slug}/clubs`)return clubsPage(uni,current);
    if(uni&&path.includes('/posters/')){const p=await api(`/api/posters/${path.split('/').pop()}`);if(current!==routeId)return;if(p.universityId!==uni.id)throw new Error('This poster belongs to a different campus.');return detail(p,current);}
    if(uni)return wall(uni,current);
    errorPage('Page not found');
  } catch(error){if(current===routeId)errorPage(error.message);}
}
function chooser() {header();app.innerHTML=`<section class="chooser"><span class="eyebrow">WELCOME TO YOUR CAMPUS NOTICEBOARD</span><h1>Good things<br>happen <em>here.</em></h1><p>Which campus do you want to explore?</p><div class="university-grid">${universities.map((u,i)=>`<a href="/${u.slug}" data-campus-option="${u.slug}" data-nav><span class="uni-number">0${i+1}</span><strong>${esc(u.shortName)}</strong><span>${esc(u.name)}</span><b>↗</b></a>`).join('')}</div><p class="muted">Explore freely. No account needed.</p></section>`;}
function campusNavigation(uni,active) {
  return `<nav class="campus-navigation" aria-label="Explore ${esc(uni.shortName)}"><a href="/${uni.slug}" data-nav ${active==='events'?'aria-current="page"':''}>Events</a><a href="/${uni.slug}/clubs" data-nav ${active==='clubs'?'aria-current="page"':''}>Clubs & societies</a><a href="/games" data-nav>Games ↗</a></nav>`;
}
function clubCard(club) {
  const initials=club.name.replace(/^(?:ANU|USYD|UNSW|UniMelb|Monash|UQ|UWA|Adelaide)\s+/i,'').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase(),campus=universities.find(u=>u.id===club.universityId);
  return `<article class="club-card"><div class="club-card-heading"><div class="club-avatar" aria-hidden="true"><span>${esc(initials)}</span>${club.imageUrl?`<img src="${esc(club.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div><span class="club-campus">${esc(campus?.shortName||club.universityId)}</span></div><h2>${esc(club.name)}</h2><div class="club-categories">${club.categories.map(category=>`<span>${esc(category)}</span>`).join('')}</div><a class="club-profile" href="${esc(club.profileUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(club.name)} profile">Explore this club <span aria-hidden="true">↗</span></a></article>`;
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
async function wall(uni,current) {
  app.innerHTML=`${campusNavigation(uni,'events')}${me?'<div class="wall-community-shortcuts"><a href="/community/map" data-nav>⌖ Activity map</a><a href="/community/calendar" data-nav>▤ My calendar</a><a href="/community/teams" data-nav>↗ Find your team</a><a href="/community/clubs" data-nav>✳ Following clubs</a></div>':''}<section class="hero wall-hero"><div><span class="eyebrow"><span class="live-dot"></span> THE ${esc(uni.shortName)} NOTICEBOARD</span><h1>Your campus,<br><em>at a glance.</em><span class="hero-star" aria-hidden="true">✳</span></h1></div><div class="wall-hero-side"><p>The meetups, the big ideas, the little things.<br>Find something worth showing up for.</p><section id="campus-chat" class="campus-chat" aria-label="Campus chat"></section></div></section><section class="wall-controls" aria-label="Filter posters"><div class="category-tabs"><button data-category="" class="active">All posters</button>${categories.map(c=>`<button data-category="${c}">${c}</button>`).join('')}</div><div class="filter-row"><div class="date-tabs"><button data-date="">All dates</button><button data-date="today">Today</button><button data-date="week">This week</button><button class="active" data-date="upcoming">Upcoming</button><button data-date="past">Past events</button></div><label class="search"><span>⌕</span><input type="search" id="search" placeholder="Find your next thing…" aria-label="Search events"></label></div></section><div class="section-label"><h2>On the wall <span id="count"></span></h2><span class="muted">A campus full of possibilities ↙</span></div><div id="results" class="poster-grid"></div><section class="wall-cta"><div><span class="eyebrow">MAKE SOME NOISE</span><h2>Something happening?<br>Put it on the wall.</h2></div><button class="primary" id="wall-create">Create a poster ↗</button></section>`;
  mountHomepageChat();
  $('#results').insertAdjacentHTML('beforebegin','<p class="gallery-note"><strong>Photo test collection</strong> — Fictional activities at real campus venues. All test posters are labelled. Photos are illustrative.</p>');
  let category='',range='upcoming',request=0,searchTimer,controller,disposed=false;
  wallPanel={destroy(){disposed=true;clearTimeout(searchTimer);controller?.abort();}};
  async function load() {if(disposed||current!==routeId)return;controller?.abort();controller=new AbortController();const n=++request;const params=new URLSearchParams({university:uni.id,category,q:$('#search')?.value||''});if(range){if(range==='past')params.set('to',dayAfter(today(),-1));else params.set('from',today());if(range==='today')params.set('to',today());if(range==='week'){const d=new Date(`${today()}T12:00:00`);d.setDate(d.getDate()+(7-(d.getDay()||7)));params.set('to',`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}}try{const list=await api(`/api/posters?${params}`,'GET',undefined,{signal:controller.signal});if(current!==routeId||n!==request)return;$('#count').textContent=String(list.length);$('#results').innerHTML=list.length?list.map(p=>card(p)).join(''):'<div class="empty"><h2>No posters here yet.</h2><p>Try another filter, or be the first to share what’s happening on campus.</p></div>';}catch(error){if(current===routeId&&n===request&&error.name!=='AbortError')$('#results').innerHTML=`<p class="error">${esc(error.message)}</p>`;}}
  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));load();});
  document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{range=b.dataset.date;document.querySelectorAll('[data-date]').forEach(x=>x.classList.toggle('active',x===b));load();});
  $('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(load,200);};$('#wall-create').onclick=createPoster;
  await load();if(current===routeId)live(`wall=${uni.id}&chat=1`,message=>{chatPanel?.receive(message);if(message.type==='wall:changed')load();});
}
function login() {
  if(me?.universityId)return navigate(`/${me.universityId}`,true);
  let register=false;const params=new URLSearchParams(location.search),next=params.get('next')||`/${selected||''}`;
  const createCampus=next==='create'?universities.find(u=>u.slug===(params.get('campus')||selected)):null;
  if(createCampus){selected=createCampus.slug;localStorage.setItem('campuswall-university',selected);header();}
  function render() {app.innerHTML=`<section class="auth-layout"><div><span class="eyebrow">A CAMPUS MADE BY ITS PEOPLE</span><h1>Bring your<br><em>people together.</em></h1><p>Share an idea. Make a poster. Make it happen.</p><div class="auth-art" aria-hidden="true">✳</div></div><form id="auth" class="panel form"><span class="eyebrow">${register?'JOIN THE WALL':'WELCOME BACK'}</span><h2>${register?'Make yourself at home.':'Sign in to CampusWall.'}</h2>${register?`<label>Your university<select name="universityId" required><option value="">Choose your university</option>${options(Object.fromEntries(universities.map(u=>[u.id,u.name])),selected)}</select><span class="muted small">Your account stays on this university after registration.</span></label>`:''}${register?'<label>Display name<input name="name" autocomplete="name" maxlength="50" required placeholder="What should we call you?"></label>':''}<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" required placeholder="At least 8 characters"></label><p class="error" id="auth-error" role="alert"></p><button class="primary">${register?'Create account':'Sign in'} ↗</button><button type="button" class="quiet" id="switch-auth">${register?'Already have an account? Sign in':'New here? Create an account'}</button><p class="muted small">Your university selection doesn’t verify university membership.</p><a href="/${selected||''}" data-nav>← Keep exploring</a></form></section>`;
    if(register)$('[name="name"]').closest('label').insertAdjacentHTML('afterend','<label>Username (optional)<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="e.g. campus_alex"><span class="muted small">Letters, numbers or underscores. Leave blank to get a unique username.</span></label>');
    if(register){
      const form=$('#auth'),email=form.elements.email,school=form.elements.universityId;let manualCampus=school.value;
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
    $('#switch-auth').onclick=()=>{register=!register;render();};$('#auth').onsubmit=async event=>{event.preventDefault();const form=event.target;const submit=form.querySelector('button');submit.disabled=true;try{const input=Object.fromEntries(new FormData(form));if(register)input.universityId=form.elements.universityId.value;const result=await api(`/api/auth/${register?'register':'login'}`,'POST',input);me=result.user;header();if(next==='create'){await navigate(`/${me.universityId||createCampus?.slug||selected||''}`);if(me.universityId)createPoster();}else await navigate(next.startsWith('/')&&!next.startsWith('//')?next:`/${selected||''}`);}catch(error){$('#auth-error').textContent=error.message;submit.disabled=false;}};
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
 const node=modal('Make it yours.',`<p class="muted">Your photo appears in campus chat and private conversations.</p><form class="form profile-form"><div class="profile-preview">${avatar(me,'',false)}<div><strong>${esc(me.name)}</strong><p class="muted">@${esc(me.username)}</p></div></div><label>Choose a profile photo<input type="file" accept="image/jpeg,image/png,image/webp" required></label><p class="muted small">JPEG, PNG or WebP · up to 5 MB. Your photo is cropped to a square.</p><p class="error" role="alert"></p><button class="primary" type="submit">Save profile photo ↗</button></form>`);
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
  app.innerHTML=`<a class="back-link" href="/${p.universityId}" data-nav>← Back to the wall</a><section class="poster-detail"><div>${poster(p,true)}</div><div class="detail-info"><span class="eyebrow">${esc(p.category)} / ${esc(universities.find(u=>u.id===p.universityId)?.shortName)}</span><h1>${esc(p.title)}</h1>${statusBadge(p)}<div class="detail-tools">${saveButton(p)}${p.date?`<a class="button" href="/api/posters/${p.id}/calendar" download>Add to calendar</a>`:''}<button id="share-poster">Share & QR code ↗</button></div><p class="subtitle">${esc(p.subtitle)}</p><dl><div><dt>WHEN</dt><dd>${esc(dateText(p.date))}${p.time?` · ${esc(p.time)}`:''}</dd></div><div><dt>WHERE</dt><dd>${esc(p.location)}</dd></div><div><dt>SHARED BY</dt><dd>${esc(p.owner)}</dd></div></dl><p class="muted small">Times are local to campus.${p.time?'':' No time listed; the calendar entry will be all day.'}</p><a class="campus-map" href="${esc(universities.find(u=>u.id===p.universityId)?.mapUrl||'#')}" target="_blank" rel="noopener noreferrer">Open campus map ↗</a><p class="description">${esc(p.description)}</p><p class="muted small">Published ${new Date(p.publishedAt).toLocaleDateString('en-AU')}${p.ownerId==='campus-team'?' · Sample / legacy notice':''}</p>${me&&me.id===p.ownerId?`<a class="button" href="/studio/posters/${p.id}" data-nav>Edit your poster ↗</a>`:''}<section class="comments"><h2>Around this poster</h2><div id="comments"></div>${me?'<form id="comment-form" class="form"><label>Add to the conversation<textarea name="body" maxlength="1000" required rows="3" placeholder="A question, a thought, a hello…"></textarea></label><button class="primary">Post comment</button><p class="error" role="alert"></p></form>':`<a class="button" href="/login?next=${encodeURIComponent(location.pathname)}" data-nav>Sign in to comment ↗</a>`}</section></div></section>`;
  $('.comments').insertAdjacentHTML('beforebegin','<section id="event-registration" aria-label="Event registration"></section>');
  const [{mountEventRegistration}]=await Promise.all([import('./community.js'),loadStylesheet('/community.css')]);if(current!==routeId)return;eventPanel=mountEventRegistration($('#event-registration'),{user:me,poster:p,api,navigate,toast});
  $('#share-poster').onclick=()=>sharePoster(p);
  if(p.isTest&&p.photoPoster){
    $('.detail-info h1').insertAdjacentHTML('afterend','<aside class="test-event-alert"><strong>TEST EVENT</strong><p>This activity and its date are fictional. The venue exists, but no event is scheduled, no venue is booked and no tickets are available. Please do not attend based on this poster.</p></aside>');
    $('.campus-map').href=p.photoPoster.venueMap;
    $('.campus-map').textContent='Find this real venue on the map ↗';
    $('.description').insertAdjacentHTML('afterend',`<div class="photo-provenance"><a href="${esc(p.photoPoster.venueSource)}" target="_blank" rel="noopener noreferrer">Venue reference — official university source ↗</a><br>Illustrative photograph by <a href="${esc(p.photoPoster.photoSource)}" target="_blank" rel="noopener noreferrer">${esc(p.photoPoster.credit)} / Pexels ↗</a>, used under the <a href="${esc(p.photoPoster.license)}" target="_blank" rel="noopener noreferrer">Pexels licence</a>. This photo does not show the listed campus venue.</div>`);
  }
  $('#share-poster').insertAdjacentHTML('afterend',contactOrganiser(p));
  async function loadComments() {try{const list=await api(`/api/posters/${p.id}/comments`);if(current!==routeId)return;$('#comments').innerHTML=list.length?list.map(c=>`<article class="comment"><strong>${esc(c.author)}</strong><time>${new Date(c.createdAt).toLocaleDateString('en-AU')}</time><p>${esc(c.body)}</p></article>`).join(''):'<p class="muted">No comments yet. Start the conversation.</p>';}catch(error){toast(error.message);}}
  if($('#comment-form'))$('#comment-form').onsubmit=async event=>{event.preventDefault();const form=event.target;const button=$('button',form);button.disabled=true;try{await api(`/api/posters/${p.id}/comments`,'POST',{body:form.elements.body.value});form.reset();await loadComments();}catch(error){$('.error',form).textContent=error.message;}finally{button.disabled=false;}};
  await loadComments();if(current===routeId)live(`wall=${p.universityId}`,message=>{if(message.type==='wall:changed'){api(`/api/posters/${p.id}`).then(()=>loadComments()).catch(error=>errorPage(error.message));}});
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
  }catch(error){toast(error.message);if(current===routeId&&$('#upload-message'))$('#upload-message').textContent=error.message;}
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
function sharePoster(p) {
  const link=new URL(`/${p.universityId}/posters/${p.slug}`,location.origin).href;
  const layer=modal('Bring a friend along.',`<p class="muted">Share this public poster, or put its QR code on a noticeboard.</p><img class="share-qr" src="/api/posters/${p.id}/qr" alt="QR code for ${esc(p.title)}"><label class="share-link">Poster link<input readonly value="${esc(link)}"></label><div class="share-actions"><button class="primary" id="copy-link">Copy link</button><a class="button" href="/api/posters/${p.id}/qr?download=1" download>Download QR code</a></div><p class="muted small" id="share-status" role="status"></p>`);
  $('#copy-link',layer).onclick=async()=>{try{await navigator.clipboard.writeText(link);$('#share-status',layer).textContent='Link copied. Ready to share.';}catch{$('input',layer).select();$('#share-status',layer).textContent='Select and copy the link above.';}};
}
async function studio(p) {
  const current=routeId;const [{studioMarkup},{mountWhiteboard}]=await Promise.all([import('./designer.js'),import('./whiteboard.js'),loadStylesheet('/designer.css'),loadStylesheet('/whiteboard.css')]);if(current!==routeId)return;undoEdits=[];redoEdits=[];
  draft=p;selected=p.universityId;localStorage.setItem('campuswall-university',selected);header();const isOwner=me.id===p.ownerId;
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
  if(isOwner){$('#collaborators').onclick=()=>manageCollaborators(p.id);$('#publish').onclick=async()=>{try{await flush();const result=await api(`/api/drafts/${p.id}/publish`,'POST');toast('Your poster is on the wall.');await navigate(`/${result.universityId}/posters/${result.slug}`);}catch(error){toast(error.message);}};if($('#unpublish'))$('#unpublish').onclick=async()=>{try{await flush();await api(`/api/drafts/${p.id}/unpublish`,'POST');toast('Poster returned to a private draft.');route();}catch(error){toast(error.message);}};$('#delete').onclick=async()=>{if(!confirm('Delete this poster and its comments permanently?'))return;try{await api(`/api/drafts/${p.id}`,'DELETE');pending.clear();navigate('/my-posters');}catch(error){toast(error.message);}};}
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
    if(message.type==='error'){whiteboardPanel?.receive(message);if(pending.get(message.field)?.requestId===message.requestId){pending.delete(message.field);clearTimeout(timers.get(message.field));timers.delete(message.field);}if(message.poster){draft=message.poster;for(const [field,entry] of pending)draft[field]=entry.value;syncInputs();preview();}toast(message.message);setConnection(connected?(pending.size?'Connected · Saving…':'Connected · Saved'):'Reconnecting…');}
  },true);
}
function setConnection(text) {if(!$('#save-status'))return;whiteboardPanel?.connectionChanged(connected&&!uploading);if(connected&&whiteboardPanel?.hasPending())text='Connected · Saving…';$('#save-status').textContent=uploading&&connected?'Connected · Uploading image…':text;document.querySelectorAll('[data-field]').forEach(input=>input.disabled=!connected||uploading);if($('#image-file'))$('#image-file').disabled=!connected||uploading;if($('#remove-image'))$('#remove-image').disabled=!connected||uploading;if($('#publish'))$('#publish').disabled=!connected||uploading;historyButtons();}
function syncInputs() {document.querySelectorAll('[data-field]').forEach(input=>{const raw=Object.hasOwn(designFields,input.dataset.field)?designValue(draft,input.dataset.field):draft[input.dataset.field]??'';const value=input.dataset.field==='heroImageUrl'&&raw.startsWith('/media/')?'':raw;if(input.value!==value)input.value=value;});document.querySelectorAll('[data-value-for]').forEach(output=>output.textContent=designValue(draft,output.dataset.valueFor));}
function preview() {if(!$('#preview'))return;$('#preview').innerHTML=poster(draft,true);$('#version').textContent=`Version ${draft.version}`;$('#poster-status').textContent=draft.status;readiness();imagePreview();}
function readiness() {const checks=[['title','Event title'],['date','Date'],['location','Location']];$('#readiness').innerHTML=`<h3>Poster readiness</h3>${checks.map(([field,label])=>`<p>${draft[field]?'✓':'○'} ${label}</p>`).join('')}${!draft.time?'<p class="muted">○ Add a time to help people plan.</p>':''}${draft.description.length>500?'<p class="muted">△ A shorter description is easier to scan.</p>':''}${draft.hasUnpublishedChanges?'<p class="muted">Draft changes need republishing.</p>':''}<p class="muted small">${draft.status==='PUBLISHED'?'The wall shows your last published version.':'Only you and invited collaborators can see this draft.'}</p>`;}
function historyButtons(){if(whiteboardPanel){whiteboardPanel.historyButtons();return;}if($('#studio-undo'))$('#studio-undo').disabled=!connected||uploading||!undoEdits.length;if($('#studio-redo'))$('#studio-redo').disabled=!connected||uploading||!redoEdits.length;}
async function travelHistory(forward){try{await flush();const source=forward?redoEdits:undoEdits,target=forward?undoEdits:redoEdits,entry=source.at(-1);if(!entry)return;const expected=forward?entry.before:entry.after,replacement=forward?entry.after:entry.before;if(Object.entries(expected).some(([key,value])=>String(draft[key]??designValue(draft,key)??'')!==value)){source.pop();historyButtons();toast('A collaborator changed this field. Their edit has been kept.');return;}source.pop();target.push(entry);queueChanges(Object.entries(replacement).map(([field,value])=>({field,value})),{record:false});}catch(error){toast(error.message);}}
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
async function manageCollaborators(posterId) {
  const layer=modal('Better together.',`<p class="muted">Find a registered friend from your campus. You can edit together live; publishing stays with you.</p><label class="form">Find a friend by name or username<input id="friend-search" placeholder="Name or @username" autocomplete="off"></label><div id="friend-results" class="collaborator-search-results" aria-live="polite"></div><div id="collaborator-list"></div><form class="form"><label>Collaborator’s email<input name="email" type="email" required placeholder="friend@example.com"></label><button class="primary">Invite collaborator</button><p class="error" role="alert"></p></form>`);
  async function load(){try{const list=await api(`/api/drafts/${posterId}/collaborators`);$('#collaborator-list',layer).innerHTML=list.length?list.map(u=>`<div class="collaborator"><div><strong>${esc(u.name)}</strong><p class="muted small">${esc(u.email)}</p></div><button data-remove="${u.id}">Remove</button></div>`).join(''):'<p class="muted">You’re currently designing this poster alone.</p>';layer.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await api(`/api/drafts/${posterId}/collaborators/${b.dataset.remove}`,'DELETE');load();}catch(error){$('.error',layer).textContent=error.message;}});}catch(error){$('.error',layer).textContent=error.message;}}
  let searchTimer,searchVersion=0;
  $('#friend-search',layer).oninput=()=>{clearTimeout(searchTimer);const version=++searchVersion,q=$('#friend-search',layer).value.trim();if(q.length<2){$('#friend-results',layer).textContent='Type at least two characters.';return;}searchTimer=setTimeout(async()=>{try{const result=await api(`/api/drafts/${posterId}/collaborators/search?q=${encodeURIComponent(q)}`);if(!layer.isConnected||version!==searchVersion)return;$('#friend-results',layer).innerHTML=result.users.length?result.users.map(u=>`<div class="collaborator"><div><strong>${esc(u.name)}</strong><p class="muted small">@${esc(u.username)}</p></div><button type="button" data-invite="${esc(u.id)}">Invite</button></div>`).join(''):'No matching students from your campus.';layer.querySelectorAll('[data-invite]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/drafts/${posterId}/collaborators`,'POST',{userId:button.dataset.invite});await load();button.textContent='Invited';toast('Friend invited. Share the workspace link to start together.');}catch(error){$('.error',layer).textContent=error.message;button.disabled=false;}});}catch(error){if(layer.isConnected&&version===searchVersion)$('#friend-results',layer).textContent=error.message;}},250);};
  layer.addEventListener('close',()=>{clearTimeout(searchTimer);searchVersion++;});
  $('form',layer).onsubmit=async event=>{event.preventDefault();const button=$('form button',layer);button.disabled=true;try{await api(`/api/drafts/${posterId}/collaborators`,'POST',{email:event.target.elements.email.value});event.target.reset();$('.error',layer).textContent='';await load();toast('Collaborator invited. The draft is in their My posters page.');}catch(error){$('.error',layer).textContent=error.message;}finally{button.disabled=false;}};load();
}
try{[universities,{user:me}]=await Promise.all([api('/api/universities'),api('/api/auth/me')]);for(const u of universities)styles[u.style]=u.paletteLabel;header();await route();}catch(error){errorPage(error.message);}

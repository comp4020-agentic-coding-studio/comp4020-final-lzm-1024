// Getting-started guide for new students. Every visible sentence is a single
// text node so the static language catalogues can translate it unchanged.
import {escapeHtml as esc} from './ui-utils.js';

const GUEST='Open to guests',ACCOUNT='Sign in needed',MIXED='Guests can browse';

export const goals=[
  ['discover','Find something to do'],
  ['connect','Meet and talk to people'],
  ['create','Make a poster with friends'],
  ['hangout','Play or watch together'],
  ['personalise','Change language or theme'],
  ['help','Fix a problem']
];

export const quickStart=[
  ['Pick your campus','Choose your university on the home page, or go straight to it when only one is open. You can browse without an account.'],
  ['Browse the wall','Filter events by category or date, or search titles and places. Open a poster to see the details.'],
  ['Create an account','Sign up and choose your university. A university email picks it for you. Your campus cannot be changed later.'],
  ['Save it or ask','Save an event, add it to your calendar, or press Message organiser to ask a question.'],
  ['Make your own','Press Create poster, invite friends to edit with you, then publish it when it is ready.']
];
// While only one campus is open the home page and sign-up choose it for you, so these
// steps name it instead ({0} is the campus short name, translated as a pattern).
export const singleCampusStart={
  0:['Start on the {0} wall','CampusWall is open to {0} for now, so the home page takes you straight to its event wall. You can browse without an account.'],
  2:['Create an account','Sign up with your name, email and a password. Your account belongs to {0}, the only campus open for now.']
};

export const access=[
  ['Browse posters and clubs',true],
  ['Read campus chat',true],
  ['View profiles and game rules',true],
  ['Send chat and private messages',false],
  ['Save events and book a place',false],
  ['Create and publish posters',false],
  ['Play games and join watch rooms',false],
  ['Campus life: friends, groups, teams and map',false]
];

// href may be a function of the campus slug. where lists the clicks to reach it.
export const sections=[
  {id:'discover',eyebrow:'DISCOVER',title:'Find something to do',intro:'Events, clubs and plans happening around your campus.',features:[
    {icon:'▦',name:'Event wall',badge:GUEST,what:'Every upcoming event at your university in one place.',where:['Home','Events'],href:s=>`/${s}`,steps:['Use the category and date filters to narrow the list.','Search event titles, places and descriptions.','Open a poster for the time, place, map link and QR code.'],tip:'Posters marked TEST EVENT are examples. They are not real and cannot be booked.'},
    {icon:'✦',name:'Clubs & societies',badge:GUEST,what:'Club listings imported from your student union directory.',where:['Clubs & societies'],href:s=>s?`/${s}/clubs`:'/',steps:['Search by name, or filter by category and interest.','Open the official listing to reach the club’s own page.','Signed in? Follow a club to join its student discussion.'],tip:'Club discussions are written by students, not official club announcements.'},
    {icon:'✓',name:'Book a place',badge:ACCOUNT,what:'Register for events when the organiser opens bookings.',where:['Open a poster','Book a place'],steps:['If the event is full, you join the waitlist in order.','Your check-in ticket appears on the same page.','Cancel any time. The next person on the waitlist moves up.']},
    {icon:'▤',name:'Saved events & calendar',badge:ACCOUNT,what:'Keep the events you care about and see your plans together.',where:['Account menu','Saved events'],href:()=>'/saved',steps:['Press Save event on any poster.','Open My calendar to see bookings, saved events and screenings together.','Use Add to calendar to download an event for Google, Outlook or Apple Calendar.']},
    {icon:'⌖',name:'Activity map',badge:ACCOUNT,what:'See activities pinned on an interactive campus map.',where:['Campus life','Activity map'],href:()=>'/community/map',steps:['Click a marker to open the activity.','Organisers choose the pin when they set up the activity.']}
  ]},
  {id:'connect',eyebrow:'CONNECT',title:'Meet and talk to people',intro:'Chat with students at your university, one to one or in groups.',features:[
    {icon:'☺',name:'Campus chat',badge:MIXED,what:'A live chat room for your whole university, on your campus wall.',where:['Your campus wall','Campus chat'],href:s=>`/${s}`,steps:['Guests can read. Sign in to send.','Enter sends. Shift + Enter starts a new line.','The Campus broadcast panel shows prompts, not messages from real people.']},
    {icon:'✉',name:'Private messages',badge:ACCOUNT,what:'One-to-one conversations with students at your university.',where:['Messages','Find someone'],href:()=>'/messages',steps:['Search a name or username with at least two letters.','Or press Message organiser on any poster.','Use Attach file to share a file up to 10 MB.']},
    {icon:'☎',name:'Voice and video calls',badge:ACCOUNT,what:'Call a friend from inside a private conversation.',where:['Messages','Open a conversation','Voice call'],steps:['You both need to be online and signed in.','Your browser asks for the microphone, and the camera for video, only when you call or answer.','Stuck on Connecting? Open Connection help on both devices.']},
    {icon:'♡',name:'Friends, groups & teams',badge:ACCOUNT,what:'Build your circle and plan things together.',where:['Campus life','Friends'],href:()=>'/community/friends',steps:['Send a friend request. It starts once they accept.','Create a group conversation with your friends.','Open Find your team to apply to a team, or create one and accept members.']},
    {icon:'◐',name:'Profiles',badge:MIXED,what:'A personal page with your photo, headline and interests.',where:['Account menu','Your name'],steps:['Open the account menu (your photo) and choose your name to change your photo and introduction.','Click anyone’s avatar to visit their page.','Leave a note in a friend’s guestbook.']}
  ]},
  {id:'create',eyebrow:'CREATE TOGETHER',title:'Make a poster with friends',intro:'Design, plan and publish when you are ready. Drafts stay private until then.',features:[
    {icon:'✳',name:'Poster studio',badge:ACCOUNT,what:'Design an event poster from a starting template.',where:['Header','Create poster'],steps:['Choose a starting design and give it a working title.','Change text, colours, fonts and images. Changes save automatically.','Wait for Connected · Saved before you leave the page.']},
    {icon:'▣',name:'Collaborative whiteboard',badge:ACCOUNT,what:'A shared free canvas for brainstorming and planning.',where:['Create poster','Collaborative whiteboard'],steps:['Add notes, shapes, arrows, photos and drawings.','See your friends’ pointers move while you work.','Undo only reverses your own changes, never a friend’s.']},
    {icon:'＋',name:'Invite collaborators',badge:ACCOUNT,what:'Let friends from your university edit a draft with you.',where:['Studio','Invite friends'],steps:['Search a friend by name or username.','They will find the poster under My posters.','A copied link alone does not give anyone access.']},
    {icon:'↗',name:'Publish to the wall',badge:ACCOUNT,what:'Share the finished poster with your whole campus.',where:['Studio','Event details','Publish'],href:()=>'/my-posters',steps:['Open Event details and fill in the title, date and location.','Press Publish. Only the poster’s creator can publish.','Changed it later? Publish again to update the public version.']}
  ]},
  {id:'hangout',eyebrow:'HANG OUT',title:'Play or watch together',intro:'Lighter ways to spend time with people when an event feels like too much.',features:[
    {icon:'♜',name:'Games',badge:MIXED,what:'Ten two-player games, from Tic-tac-toe to Chess.',where:['Games'],href:()=>'/games',steps:['Create a table, or invite a campus friend to the second seat.','Both players mark themselves ready to start.','A rematch needs both players to agree.']},
    {icon:'▶',name:'Watch together',badge:ACCOUNT,what:'Watch a video in sync with friends while you chat.',where:['Watch together'],href:()=>'/watch',steps:['Name a room and paste a YouTube link or a public video link.','The host controls play and pause. Everyone controls their own sound.','Use Share room to send the link to friends at your university.'],tip:'Video keeps buffering? Choose 360p or 480p in the YouTube settings.'},
    {icon:'♬',name:'Scheduled screenings',badge:ACCOUNT,what:'Plan a watch party ahead of time and vote on what to watch.',where:['Campus life','Scheduled screenings'],href:()=>'/community/screenings',steps:['Subscribe to get a reminder when it starts.','Add videos to the shared playlist and vote for the next one.']}
  ]},
  {id:'personalise',eyebrow:'MAKE IT YOURS',title:'Change language or theme',intro:'Small settings that make the site easier to use.',features:[
    {icon:'Aa',name:'Language',badge:GUEST,what:'Use the site in English, Simplified Chinese, Spanish, French or Japanese.',where:['Account menu','Language'],steps:['Open the account menu (your photo, or Settings when signed out) and pick a language.','Your choice is remembered in this browser.','Press Translate to English under a message to translate it. The original stays visible.']},
    {icon:'◑',name:'Light and dark mode',badge:GUEST,what:'Choose the look that is easiest on your eyes.',where:['Account menu','Appearance'],steps:['Choose Light, Dark or Follow system.','Posters and drawings always keep their original colours.']}
  ]}
];

export const faq=[
  ['Why can’t I open another university’s wall?','Each account belongs to one university. Once you sign in, pages always return to your own campus.'],
  ['Publish says something is missing.','Open Event details and fill in the title, date and location. Text drawn on the poster does not count.'],
  ['My friend opened my link but cannot get in.','A link never grants access by itself. Invite them as a collaborator or to the room, and check they use the same university.'],
  ['A call stays on Connecting.','Some university and office networks block direct calls. Try another network and open Connection help on both devices.'],
  ['Is my university email verified?','No. Your email domain chooses your campus, but CampusWall does not check that you own the mailbox.'],
  ['Which events are real?','Posters labelled TEST EVENT are examples. Everything else was posted by students.']
];

const fixed=['NEW HERE? START WITH THIS','Find your way','around campus.','CampusWall helps you discover what is happening, find people to join you and plan things together. This guide shows every feature and where to find it.','You are browsing as a guest. Sign in when you want to join in.','You are signed in. Everything below works on your own university.','What do you want to do?','On this page','Quick start','What needs an account?','QUICK START','Your first five minutes','Guest','Signed in','Feature','Where to find it','Try it','SOMETHING NOT WORKING?','Common questions','READY?','Your campus is waiting.','Nothing you make is public until you choose to publish it.','Explore the wall','Create an account','My posters','Back to top','Getting started','New here? See how CampusWall works','Yes','Account needed',GUEST,ACCOUNT,MIXED];

// Used by the catalogue test so a new sentence cannot ship untranslated.
export function guideStrings(){
  const out=new Set(fixed);
  for(const [,label] of goals)out.add(label);
  for(const [t,d] of [...quickStart,...Object.values(singleCampusStart)]){out.add(t);out.add(d);}
  for(const [label] of access)out.add(label);
  for(const s of sections){out.add(s.eyebrow);out.add(s.title);out.add(s.intro);for(const f of s.features){out.add(f.name);out.add(f.what);f.where.forEach(w=>out.add(w));f.steps.forEach(x=>out.add(x));if(f.tip)out.add(f.tip);}}
  for(const [q,a] of faq){out.add(q);out.add(a);}
  out.delete('Aa');
  return [...out];
}

function feature(f,slug){
  const href=f.href?.(slug);
  return `<article class="guide-feature" id="guide-${esc(f.name.toLowerCase().replace(/[^a-z]+/g,'-'))}">
    <div class="guide-feature-head"><span class="guide-icon" aria-hidden="true">${esc(f.icon)}</span><span class="guide-badge${f.badge===GUEST?' open':f.badge===ACCOUNT?' account':''}">${esc(f.badge)}</span></div>
    <h3>${esc(f.name)}</h3><p class="guide-what">${esc(f.what)}</p>
    <div class="guide-where"><span class="guide-label">Where to find it</span><ol>${f.where.map(w=>`<li>${esc(w)}</li>`).join('')}</ol></div>
    <ul class="guide-steps">${f.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    ${f.tip?`<p class="guide-tip">${esc(f.tip)}</p>`:''}
    ${href?`<a class="guide-try" href="${esc(href)}" data-nav>Try it ↗</a>`:''}
  </article>`;
}

export function quickStartFor(campus,single){
  return quickStart.map((step,i)=>single&&campus?.shortName&&singleCampusStart[i]?singleCampusStart[i].map(text=>text.replace('{0}',campus.shortName)):step);
}

export function mountGuide(root,{user,campus,single=false}={}){
  const slug=campus?.slug||campus?.id||'';
  const toc=[['start','Quick start'],['access','What needs an account?'],...sections.map(s=>[s.id,s.title]),['help','Common questions']];
  root.innerHTML=`<div class="guide-page" id="guide-top">
  <section class="guide-hero">
    <span class="eyebrow">NEW HERE? START WITH THIS</span>
    <h1>Find your way<br><em>around campus.</em></h1>
    <p class="guide-lede">CampusWall helps you discover what is happening, find people to join you and plan things together. This guide shows every feature and where to find it.</p>
    <p class="guide-status"><span class="live-dot" aria-hidden="true"></span><span>${user?'You are signed in. Everything below works on your own university.':'You are browsing as a guest. Sign in when you want to join in.'}</span></p>
    <h2 class="guide-goals-title">What do you want to do?</h2>
    <div class="guide-goals">${goals.map(([id,label])=>`<a href="#${id}" data-guide-jump="${id}"><span>${esc(label)}</span><b aria-hidden="true">→</b></a>`).join('')}</div>
  </section>
  <div class="guide-layout">
    <nav class="guide-toc" aria-label="On this page"><span class="guide-label">On this page</span>${toc.map(([id,label])=>`<a href="#${id}" data-guide-jump="${id}">${esc(label)}</a>`).join('')}</nav>
    <div class="guide-content">
      <section class="guide-section" id="start" aria-labelledby="start-title">
        <span class="eyebrow">QUICK START</span><h2 id="start-title">Your first five minutes</h2>
        <ol class="guide-quick">${quickStartFor(campus,single).map(([t,d],i)=>`<li><span class="guide-step-number" aria-hidden="true">0${i+1}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`).join('')}</ol>
      </section>
      <section class="guide-section" id="access" aria-labelledby="access-title">
        <h2 id="access-title">What needs an account?</h2>
        <div class="guide-table-wrap"><table class="guide-access"><thead><tr><th scope="col">Feature</th><th scope="col">Guest</th><th scope="col">Signed in</th></tr></thead><tbody>${access.map(([label,guest])=>`<tr><th scope="row">${esc(label)}</th><td>${guest?'<span class="guide-yes" aria-label="Yes">✓</span>':'<span class="guide-no" aria-label="Account needed">—</span>'}</td><td><span class="guide-yes" aria-label="Yes">✓</span></td></tr>`).join('')}</tbody></table></div>
      </section>
      ${sections.map(s=>`<section class="guide-section" id="${s.id}" aria-labelledby="${s.id}-title"><span class="eyebrow">${esc(s.eyebrow)}</span><h2 id="${s.id}-title">${esc(s.title)}</h2><p class="guide-intro">${esc(s.intro)}</p><div class="guide-grid">${s.features.map(f=>feature(f,slug)).join('')}</div></section>`).join('')}
      <section class="guide-section" id="help" aria-labelledby="help-title">
        <span class="eyebrow">SOMETHING NOT WORKING?</span><h2 id="help-title">Common questions</h2>
        <div class="guide-faq">${faq.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
      </section>
      <section class="guide-cta">
        <div><span class="eyebrow">READY?</span><h2>Your campus is waiting.</h2><p>Nothing you make is public until you choose to publish it.</p></div>
        <div class="guide-cta-actions"><a class="button primary" href="/${esc(slug)}" data-nav>Explore the wall</a>${user?'<a class="button" href="/my-posters" data-nav>My posters</a>':'<a class="button" href="/login" data-nav>Create an account</a>'}</div>
      </section>
      <a class="guide-top-link" href="#guide-top" data-guide-jump="guide-top">Back to top</a>
    </div>
  </div>
</div>`;

  // In-page links scroll without touching history, so the SPA router never re-renders.
  const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function onClick(event){
    const link=event.target.closest('[data-guide-jump]');if(!link)return;
    const target=root.querySelector('#'+CSS.escape(link.dataset.guideJump));if(!target)return;
    event.preventDefault();target.scrollIntoView({behavior:reduce()?'auto':'smooth',block:'start'});
    if(target.matches('section'))target.setAttribute('tabindex','-1'),target.focus({preventScroll:true});
  }
  root.addEventListener('click',onClick);

  // Highlight the section being read in the side navigation.
  let observer;
  if('IntersectionObserver' in window){
    const toc=root.querySelector('.guide-toc');
    const links=new Map([...root.querySelectorAll('.guide-toc a')].map(a=>[a.dataset.guideJump,a]));
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        links.forEach(a=>a.removeAttribute('aria-current'));
        const link=links.get(entry.target.id);if(!link)continue;
        link.setAttribute('aria-current','true');
        revealInStrip(toc,link,reduce());
      }
    },{rootMargin:'-20% 0px -70% 0px'});
    root.querySelectorAll('.guide-section').forEach(s=>observer.observe(s));
  }
  return {destroy(){root.removeEventListener('click',onClick);observer?.disconnect();}};
}

// On phones the contents become a horizontal strip. Centre the highlighted
// chip by scrolling only the strip, never the page.
export function revealInStrip(strip,link,instant=false){
  if(!strip||strip.scrollWidth<=strip.clientWidth+1)return false;
  const s=strip.getBoundingClientRect(),l=link.getBoundingClientRect();
  if(l.left>=s.left&&l.right<=s.right)return false;
  const left=Math.max(0,Math.min(strip.scrollWidth-strip.clientWidth,strip.scrollLeft+(l.left-s.left)-(s.width-l.width)/2));
  strip.scrollTo({left,behavior:instant?'auto':'smooth'});
  return true;
}

import {avatar,refreshAvatars,mountEmoji} from './chat-ui.js';
import {escapeHtml as escape} from './ui-utils.js';
import {motionFetch} from './motion.js';
const drafts=new Map();
const campusBroadcasts=[
  'A little hello can turn a familiar face into a new friend.',
  'Looking for your people? Explore the clubs and societies on your campus.',
  'Found something interesting on the wall? Save it for later.',
  'A good study break starts with looking away from the screen.',
  'New to campus? Say hello and ask a question in the chat.',
  'Bring your curiosity. You do not need to be an expert to try something new.',
  'Small plans count too: a walk, a coffee, a conversation.',
  'Hosting something? Put the date, time and meeting spot on your poster.',
  'Your next favourite club might be one click away.',
  'Take a water break. Your next idea can wait a minute.',
  'Invite a friend to an event, or make a new one when you get there.',
  'Keep the conversation kind. There is a person behind every message.',
  'A question you ask today might help someone else tomorrow.',
  'Try one new thing this week, even if it is a small one.',
  'Check the event details before heading out, especially the date and location.',
  'Share an event link with someone who might enjoy it.',
  'A campus is made of people. Make a little room for someone new.',
  'Need a change of scenery? A short walk can give your day a fresh start.',
  'Organising together? Invite a collaborator to help with your poster.',
  'Good things often start with: “Anyone interested?”'
];

function mountBroadcast(root){
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,paused=motion.matches,hovered=false,focused=false,timer,transitionTimer,active=true;
  root.innerHTML=`<div class="chat-broadcast-heading"><span>✳ Campus broadcast</span><div><span class="chat-broadcast-count"></span><button type="button" class="chat-broadcast-pause"></button><button type="button" class="chat-broadcast-next" aria-label="Next campus broadcast">→</button></div></div><div class="chat-broadcast-window" aria-live="off"><div class="chat-broadcast-track"><p></p></div></div>`;
  const track=root.querySelector('.chat-broadcast-track'),count=root.querySelector('.chat-broadcast-count'),pause=root.querySelector('.chat-broadcast-pause');
  function settle(){clearTimeout(transitionTimer);track.classList.remove('advancing');track.replaceChildren(Object.assign(document.createElement('p'),{textContent:campusBroadcasts[index]}));}
  function controls(){count.textContent=`${String(index+1).padStart(2,'0')} / 20`;pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-label',paused?'Play campus broadcasts':'Pause campus broadcasts');}
  function schedule(){clearTimeout(timer);if(active&&!paused&&!hovered&&!focused&&!document.hidden)timer=setTimeout(()=>advance(),6000);}
  function advance(){
    settle();index=(index+1)%campusBroadcasts.length;
    if(motion.matches)settle();else{track.append(Object.assign(document.createElement('p'),{textContent:campusBroadcasts[index]}));track.classList.add('advancing');transitionTimer=setTimeout(settle,400);}
    controls();schedule();
  }
  pause.onclick=()=>{paused=!paused;controls();schedule();};root.querySelector('.chat-broadcast-next').onclick=advance;
  root.onmouseenter=()=>{hovered=true;schedule();};root.onmouseleave=()=>{hovered=false;schedule();};
  root.onfocusin=()=>{focused=true;schedule();};root.onfocusout=event=>{focused=root.contains(event.relatedTarget);schedule();};
  const visibility=()=>schedule(),reduceMotion=()=>{if(motion.matches){paused=true;settle();controls();schedule();}};
  document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',reduceMotion);
  settle();controls();schedule();
  return ()=>{active=false;clearTimeout(timer);clearTimeout(transitionTimer);document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',reduceMotion);};
}

export function mountChat(root,{user,university,loginPath,onAuthExpired}) {
  let active=true,connected=false,sending=false,loaded=false,newCount=0,messages=[];let destroyEmoji;
  const state=user?(drafts.get(`${user.id}:${university.id}`)||{body:'',clientId:null}):{body:'',clientId:null};
  if(user)drafts.set(`${user.id}:${university.id}`,state);
  root.innerHTML=`<div class="chat-heading"><div><span class="eyebrow">A LITTLE CAMPUS CONVERSATION</span><h2>Campus chat<span aria-hidden="true">↗</span></h2></div><span class="chat-connection" role="status" data-state="offline">Connecting…</span></div><p class="chat-intro">${escape(university.shortName)}’s conversation. Everyone can read.</p><div class="chat-scroll" role="log" aria-label="Public chat messages" aria-live="polite" aria-relevant="additions" tabindex="0"><p class="chat-empty">Loading the conversation…</p></div><button type="button" class="chat-new" hidden>New messages ↓</button><div class="chat-compose">${user?`<form><label class="sr-only" for="chat-message">Chat message</label><textarea id="chat-message" maxlength="500" rows="2" placeholder="Say hello, ask a question…">${escape(state.body)}</textarea><div class="chat-compose-footer"><span>Posting as <strong>${escape(user.name)}</strong><span class="chat-count"> · ${state.body.length}/500</span></span><button class="primary" type="submit" disabled>Send ↗</button></div><p class="chat-hint">Enter to send · Shift + Enter for a new line</p><p class="chat-error" role="alert"></p></form>`:`<label class="sr-only" for="chat-message">Chat message</label><textarea id="chat-message" rows="2" placeholder="Sign in to send a message" disabled></textarea><div class="chat-compose-footer"><span>Read freely. Sign in to join in.</span><a class="button primary" href="${escape(loginPath)}" data-nav>Sign in to chat ↗</a></div>`}</div>`;
  const log=root.querySelector('.chat-scroll'),empty=root.querySelector('.chat-empty'),newButton=root.querySelector('.chat-new'),input=root.querySelector('textarea'),button=root.querySelector('button[type="submit"]');
  const broadcast=document.createElement('section');broadcast.className='chat-broadcast';broadcast.setAttribute('aria-label','Campus broadcast');log.before(broadcast);const destroyBroadcast=mountBroadcast(broadcast);
  const atBottom=()=>log.scrollHeight-log.scrollTop-log.clientHeight<45;
  function bottom(){log.scrollTop=log.scrollHeight;newCount=0;newButton.hidden=true;}
  newButton.onclick=bottom;log.onscroll=()=>{if(atBottom()){newCount=0;newButton.hidden=true;}};
  function receiveMessages(incoming) {
    if(!active)return;
    const first=!loaded,stick=first||atBottom(),known=new Set(messages.map(message=>message.id));
    const all=new Map(messages.map(message=>[message.id,message]));for(const message of incoming)all.set(message.id,message);
    messages=[...all.values()].sort((a,b)=>a.seq-b.seq).slice(-100);
    let additions=0;
    for(const message of messages){
      if(known.has(message.id))continue;additions++;
      const article=document.createElement('article');article.className=`chat-message${user?.id===message.authorId?' own':''}`;article.dataset.id=message.id;article.dataset.seq=message.seq;
      const date=new Date(message.createdAt),time=date.toLocaleTimeString('en-AU',{timeZone:'Australia/Sydney',hour:'2-digit',minute:'2-digit'}),full=date.toLocaleString('en-AU',{timeZone:'Australia/Sydney'});
      article.innerHTML=`<div class="chat-message-meta">${avatar(message)}<strong>${escape(message.author)}</strong>${user?.id===message.authorId?'<span class="chat-you">you</span>':''}<time datetime="${escape(message.createdAt)}" title="${escape(full)}">${escape(date.toLocaleDateString('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short'}))} · ${escape(time)}</time></div><p>${escape(message.body)}</p>`;
      const next=[...log.querySelectorAll('article')].find(node=>Number(node.dataset.seq)>message.seq);log.insertBefore(article,next||null);
    }
    const currentIds=new Set(messages.map(message=>message.id));log.querySelectorAll('article').forEach(node=>{if(!currentIds.has(node.dataset.id))node.remove();});
    loaded=true;empty.hidden=messages.length>0;empty.textContent='No messages yet. Be the first to say hello.';
    if(stick)bottom();else if(additions){newCount+=additions;newButton.textContent=`${newCount} new ${newCount===1?'message':'messages'} ↓`;newButton.hidden=false;}
  }
  function updateButton(){if(button)button.disabled=!connected||sending||!input.value.trim();}
  function setConnection(value){if(!active)return;connected=value;const label=root.querySelector('.chat-connection');label.textContent=value?'Live':'Reconnecting…';label.dataset.state=value?'live':'offline';updateButton();}
  if(user){
    destroyEmoji=mountEmoji(root.querySelector("form"),input);
    input.oninput=()=>{state.body=input.value;state.clientId=null;root.querySelector('.chat-count').textContent=` · ${input.value.length}/500`;updateButton();};
    input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!button.disabled)root.querySelector('form').requestSubmit();}};
    root.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(sending||!connected||!input.value.trim())return;
      sending=true;input.disabled=true;updateButton();const text=input.value;
      const clientId=state.clientId ||= crypto.randomUUID();root.querySelector('.chat-error').textContent='';button.textContent='Sending…';
      try {
        const response=await motionFetch('/api/chat/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body:text,clientId,universityId:university.id})});
        const message=await response.json();if(!response.ok){if(response.status===401&&active)onAuthExpired();throw new Error(message.error||'Unable to send your message');}
        if(state.clientId===clientId){state.body='';state.clientId=null;}
        if(!active)return;receiveMessages([message]);input.value='';root.querySelector('.chat-count').textContent=' · 0/500';bottom();
      }catch(error){if(active)root.querySelector('.chat-error').textContent=error.message;}
      finally{sending=false;if(active){input.disabled=false;button.textContent='Send ↗';updateButton();}}
    };
  }
  // History is readable even while the live connection is still opening.
  motionFetch(`/api/chat/messages?university=${encodeURIComponent(university.id)}`).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load chat');return result;}).then(result=>receiveMessages(result.messages)).catch(()=>{if(active&&!loaded)empty.textContent='Waiting to load the conversation. Reconnecting…';});
  return {receive(message){if(message.type==='profile:updated'){refreshAvatars(root,message.person);for(const m of messages)if(m.authorId===message.person.id)m.avatarId=message.person.avatarId;}if(message.type==='chat:state')receiveMessages(message.messages);if(message.type==='chat:message')receiveMessages([message.message]);},setConnection,destroy(){active=false;destroyEmoji?.();destroyBroadcast();}};
}

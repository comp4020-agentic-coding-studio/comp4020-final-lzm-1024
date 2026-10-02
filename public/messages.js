import {startVoiceCall} from './voice-calls.js';
import {avatar,refreshAvatars,mountEmoji} from './chat-ui.js';
import {escapeHtml as esc} from './ui-utils.js';
const drafts=new Map();
const timeText=value=>new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

export function mountMessages(root,{user,api,navigate,onAuthExpired,conversationId}){
  let active=true,connected=false,conversations=new Map(),messages=[],peer=null,loaded=false,hasMore=false,sending=false,searchTimer,searchVersion=0,inboxRevision=0,loading=false,opening=false,readThrough=0,newCount=0;
  let destroyEmoji;
  const key=`${user.id}:${conversationId||''}`,state=drafts.get(key)||{body:'',clientId:null};drafts.set(key,state);
  root.innerHTML=`<section class="messages-page"><div class="messages-toolbar"><div><span class="eyebrow">A CONVERSATION OF YOUR OWN</span><h1>Messages<span>↗</span></h1><p>Your username: <strong>@${esc(user.username)}</strong></p></div><span class="dm-connection" role="status">Connecting…</span></div><div class="messages-layout" data-open="${!!conversationId}"><aside class="messages-sidebar"><label class="dm-search-label">Find someone<input type="search" class="dm-search" maxlength="50" aria-label="Search usernames" placeholder="Search a username or display name…" autocomplete="off"></label><p class="dm-search-hint">Enter at least 2 characters.</p><div class="dm-search-results" aria-live="polite"></div><div class="dm-list-heading"><h2>Conversations</h2><button type="button" class="dm-refresh" aria-label="Refresh conversations">↻</button></div><div class="dm-conversations"><p class="dm-empty">Loading conversations…</p></div></aside><section class="dm-room" aria-label="Private conversation"><div class="dm-room-content"><div class="dm-welcome"><span aria-hidden="true">✳</span><h2>A little hello goes a long way.</h2><p>Search for someone to start a private conversation.<br>Messages are visible only to the two of you.</p></div></div></section></div><p class="dm-page-error" role="alert"></p></section>`;
  const search=root.querySelector('.dm-search'),results=root.querySelector('.dm-search-results'),list=root.querySelector('.dm-conversations'),room=root.querySelector('.dm-room-content'),pageError=root.querySelector('.dm-page-error');
  async function request(path,method='GET',data){try{return await api(path,method,data);}catch(error){if(active&&error.status===401)onAuthExpired();throw error;}}
  function roomError(error){if(active){const target=root.querySelector('.dm-send-error')||pageError;target.textContent=error.message;}}
  function renderList(){
    if(!active)return;
    const sorted=[...conversations.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||(b.lastMessage?.seq||0)-(a.lastMessage?.seq||0));
    list.innerHTML=sorted.length?sorted.map(c=>`<button type="button" class="dm-conversation ${c.id===conversationId?'selected':''}" data-conversation="${esc(c.id)}" ${c.id===conversationId?'aria-current="true"':''}>${avatar(c.peer,"dm-avatar")}<span class="dm-conversation-copy"><strong>${esc(c.peer.name)}</strong><span class="dm-handle">@${esc(c.peer.username)}</span><span class="dm-snippet">${c.lastMessage?`${c.lastMessage.authorId===user.id?'You: ':''}${esc(c.lastMessage.body)}`:'Start the conversation'}</span></span>${c.unread?`<span class="dm-unread" aria-label="${c.unread} unread messages">${c.unread>99?'99+':c.unread}</span>`:''}</button>`).join(''):'<p class="dm-empty">No conversations yet. Find someone above to say hello.</p>';
    list.querySelectorAll('[data-conversation]').forEach(button=>{button.onclick=()=>navigate(`/messages?conversation=${encodeURIComponent(button.dataset.conversation)}`);});
  }
  function remember(c){if((conversations.get(c.id)?.version||0)>c.version)return;conversations.set(c.id,c);renderList();}
  async function refresh(){const version=inboxRevision;const data=await request('/api/messages/conversations');if(active&&version===inboxRevision){conversations=new Map(data.conversations.map(c=>[c.id,c]));renderList();}}
  root.querySelector('.dm-refresh').onclick=()=>{refresh().catch(roomError);if(peer)loadLatest();else openRoom();};
  search.oninput=()=>{
    clearTimeout(searchTimer);const version=++searchVersion,query=search.value.trim().replace(/^@/,'');results.innerHTML='';
    if(query.length<2)return;
    results.innerHTML='<p class="dm-empty">Finding people…</p>';
    searchTimer=setTimeout(async()=>{
      try{
        const data=await request(`/api/users/search?q=${encodeURIComponent(query)}`);if(!active||version!==searchVersion)return;
        results.innerHTML=data.users.length?`<h2>People found</h2>${data.users.map(person=>`<button type="button" class="dm-person" data-person="${esc(person.id)}" aria-label="Message ${esc(person.name)} @${esc(person.username)}">${avatar(person,"dm-avatar")}<span><strong>${esc(person.name)}</strong><span>@${esc(person.username)}</span></span><b aria-hidden="true">↗</b></button>`).join('')}`:'<p class="dm-empty">No users found. Try a different username or name.</p>';
        results.querySelectorAll('[data-person]').forEach(button=>{button.onclick=async()=>{button.disabled=true;try{const data=await request('/api/messages/conversations','POST',{userId:button.dataset.person});if(active)navigate(`/messages?conversation=${encodeURIComponent(data.conversation.id)}`);}catch(error){roomError(error);if(active)button.disabled=false;}};});
      }catch(error){if(active&&version===searchVersion){results.innerHTML='';roomError(error);}}
    },250);
  };
  const log=()=>root.querySelector('.dm-log');
  const atBottom=()=>!log()||log().scrollHeight-log().scrollTop-log().clientHeight<45;
  function updateButton(){const button=root.querySelector('.dm-send');if(button)button.disabled=!loaded||!connected||sending||!root.querySelector('.dm-input').value.trim();}
  function markRead(){
    if(!active||!loaded||document.hidden||!document.hasFocus()||!atBottom()||!messages.length)return;
    const through=messages.at(-1).seq;if(through<=readThrough)return;const previous=readThrough;readThrough=through;
    request(`/api/messages/conversations/${conversationId}/read`,'POST',{throughSeq:through}).then(data=>{if(active)remember(data.conversation);}).catch(()=>{if(active&&readThrough===through)readThrough=previous;});
  }
  function bottom(){if(!log())return;log().scrollTop=log().scrollHeight;newCount=0;root.querySelector('.dm-new').hidden=true;markRead();}
  function renderMessages(incoming,{older=false}={}){
    if(!active||!peer)return;
    const first=!loaded,stick=first||atBottom(),oldHeight=log().scrollHeight,oldTop=log().scrollTop,known=new Set(messages.map(m=>m.id));
    const merged=new Map(messages.map(m=>[m.id,m]));for(const m of incoming)merged.set(m.id,m);messages=[...merged.values()].sort((a,b)=>a.seq-b.seq);
    const visible=new Set([...log().querySelectorAll('[data-message]')].map(node=>node.dataset.message));
    for(const m of messages){if(visible.has(m.id))continue;const article=document.createElement('article');article.className=`dm-message ${m.authorId===user.id?'own':''}`;article.dataset.message=m.id;article.dataset.seq=m.seq;article.innerHTML=`<div>${avatar(m)}<strong>${m.authorId===user.id?'You':esc(m.author)}</strong><time datetime="${esc(m.createdAt)}">${esc(timeText(m.createdAt))}</time></div><p>${esc(m.body)}</p>`;const gameLink=/\/games\/([a-f0-9-]{36})(?![a-f0-9-])/.exec(m.body);if(gameLink){const a=document.createElement('a');a.href='/games/'+gameLink[1];a.className='dm-game-invite';a.dataset.nav='';a.textContent='Join game room ↗';article.append(a);}const next=[...log().querySelectorAll('[data-message]')].find(node=>Number(node.dataset.seq)>m.seq);log().insertBefore(article,next||null);}
    if(messages.length)log().querySelector('.dm-empty')?.remove();else log().querySelector('.dm-empty').textContent='No messages yet. Say hello to start the conversation.';
    loaded=true;root.querySelector('.dm-older').hidden=!hasMore;updateButton();
    if(older)log().scrollTop=oldTop+log().scrollHeight-oldHeight;
    else if(stick)bottom();else{const count=incoming.filter(m=>!known.has(m.id)).length;if(count){newCount+=count;const button=root.querySelector('.dm-new');button.textContent=`${newCount} new ${newCount===1?'message':'messages'} ↓`;button.hidden=false;}}
  }
  async function loadLatest(){
    if(!active||!peer||loading)return;loading=true;
    try{
      if(!loaded){const data=await request(`/api/messages/conversations/${conversationId}/messages`);if(active){hasMore=data.hasMore;renderMessages(data.messages);}}
      else{let more=true;while(active&&more){const data=await request(`/api/messages/conversations/${conversationId}/messages?after=${messages.at(-1)?.seq||0}`);if(!active)return;renderMessages(data.messages);more=data.hasMore;}}
    }catch(error){roomError(error);}finally{loading=false;}
  }
  function mountRoom(c){
    peer=c.peer;remember(c);
    room.innerHTML=`<div class="dm-room-heading"><a class="dm-back" href="/messages" data-nav aria-label="Back to conversations">←</a>${avatar(peer,"dm-avatar")}<div><h2>${esc(peer.name)}</h2><span>@${esc(peer.username)} · Private conversation</span></div></div><button type="button" class="dm-older" hidden>Load earlier messages ↑</button><div class="dm-log" role="log" aria-label="Private messages" aria-live="polite" aria-relevant="additions" tabindex="0"><p class="dm-empty">Loading messages…</p></div><button type="button" class="dm-new" hidden>New messages ↓</button><form class="dm-compose"><label class="sr-only" for="dm-message">Private message</label><textarea id="dm-message" class="dm-input" rows="2" maxlength="2000" placeholder="Message ${esc(peer.name)}…">${esc(state.body)}</textarea><div><span class="dm-count">${state.body.length}/2000</span><button type="submit" class="primary dm-send" disabled>Send ↗</button></div><p>Enter to send · Shift + Enter for a new line</p><p class="dm-send-error" role="alert"></p></form>`;
    root.querySelector('.dm-room-heading').insertAdjacentHTML('beforeend',`<button class="dm-call" type="button" aria-label="Voice call ${esc(peer.name)}"><span aria-hidden="true">☎</span> Voice call</button><a class="button dm-play" href="/games?invite=${encodeURIComponent(peer.id)}" data-nav>Play together ↗</a>`);
    root.querySelector('.dm-call').onclick=async e=>{e.currentTarget.disabled=true;try{await startVoiceCall(conversationId);}catch(error){roomError(error);}finally{if(active)root.querySelector('.dm-call').disabled=false;}};
    root.querySelector('.dm-new').onclick=bottom;log().onscroll=()=>{if(atBottom())bottom();};
    root.querySelector('.dm-older').onclick=async()=>{
      const button=root.querySelector('.dm-older');button.disabled=true;
      try{const data=await request(`/api/messages/conversations/${conversationId}/messages?before=${messages[0].seq}`);if(active){hasMore=data.hasMore;renderMessages(data.messages,{older:true});}}catch(error){roomError(error);}finally{if(active)button.disabled=false;}
    };
    const input=root.querySelector('.dm-input');destroyEmoji=mountEmoji(root.querySelector('.dm-compose'),input);input.oninput=()=>{state.body=input.value;state.clientId=null;root.querySelector('.dm-count').textContent=`${input.value.length}/2000`;updateButton();};
    input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!root.querySelector('.dm-send').disabled)root.querySelector('.dm-compose').requestSubmit();}};
    root.querySelector('.dm-compose').onsubmit=async event=>{
      event.preventDefault();if(sending||!connected||!loaded||!input.value.trim())return;
      sending=true;input.disabled=true;updateButton();const text=input.value,clientId=state.clientId ||= crypto.randomUUID();root.querySelector('.dm-send-error').textContent='';
      try{const data=await request(`/api/messages/conversations/${conversationId}/messages`,'POST',{body:text,clientId});if(state.clientId===clientId){state.body='';state.clientId=null;}if(!active)return;remember(data.conversation);renderMessages([data.message]);input.value='';root.querySelector('.dm-count').textContent='0/2000';bottom();}
      catch(error){roomError(error);}finally{sending=false;if(active){input.disabled=false;updateButton();}}
    };
  }
  const visibility=()=>markRead();document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',visibility);
  refresh().catch(roomError);
  async function openRoom(){if(!active||!conversationId||peer||opening)return;opening=true;try{const data=await request(`/api/messages/conversations/${encodeURIComponent(conversationId)}`);if(active){mountRoom(data.conversation);loadLatest();}}catch(error){roomError(error);if(active)room.innerHTML='<div class="dm-welcome"><h2>Unable to open this conversation.</h2><a class="button" href="/messages" data-nav>Back to conversations ↗</a></div>';}finally{opening=false;}}
  openRoom();
  return {
    receive(event){
      if(!active)return;
      if(event.type==='profile:updated'){refreshAvatars(root,event.person);for(const c of conversations.values())if(c.peer.id===event.person.id)Object.assign(c.peer,event.person);if(peer?.id===event.person.id)Object.assign(peer,event.person);}
      if(event.type==='inbox:state'){inboxRevision++;conversations=new Map(event.conversations.map(c=>[c.id,c]));renderList();if(peer)loadLatest();else openRoom();}
      if(event.type==='inbox:message'||event.type==='inbox:read'){inboxRevision++;remember(event.conversation);if(event.message&&event.conversation.id===conversationId&&peer){if(loaded)renderMessages([event.message]);else messages.push(event.message);}}
    },
    setConnection(value){if(!active)return;connected=value;root.querySelector('.dm-connection').textContent=value?'Connected':'Reconnecting…';root.querySelector('.dm-connection').dataset.connected=String(value);updateButton();},
    destroy(){active=false;destroyEmoji?.();clearTimeout(searchTimer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);}
  };
}

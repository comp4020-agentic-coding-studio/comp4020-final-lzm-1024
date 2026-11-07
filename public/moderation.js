import {escapeHtml as esc} from './ui-utils.js';

const reasons=[['spam','Spam or advertising'],['harassment','Harassment or hate'],['inappropriate','Inappropriate content'],['misleading','Misleading or fake event'],['other','Something else']];
const reasonLabel=Object.fromEntries(reasons);

// A report goes to the campus moderators; the reported person is not told who sent it.
export function openReport({modal,closeDialog,api,toast,targetType,targetId}){
  const layer=modal(targetType==='poster'?'Report this poster':'Report this comment',`<p class="muted">A moderator will review it. Nobody is told who reported them.</p><form class="form report-form"><fieldset class="report-reasons"><legend>What’s wrong?</legend>${reasons.map(([value,label])=>`<label class="report-reason"><input type="radio" name="reason" value="${value}" required><span>${label}</span></label>`).join('')}</fieldset><label>Anything moderators should know? (optional)<textarea name="note" maxlength="300" rows="3"></textarea></label><p class="error" role="alert"></p><div class="delete-poster-actions"><button type="button" data-keep>Cancel</button><button class="primary">Send report</button></div></form>`);
  layer.querySelector('[data-keep]').onclick=()=>closeDialog(layer);
  layer.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,button=f.querySelector('.primary');button.disabled=true;
    try{await api('/api/reports','POST',{targetType,targetId,reason:f.elements.reason.value,note:f.elements.note.value});closeDialog(layer);toast('Thanks. A moderator will review your report.');}
    catch(error){f.querySelector('.error').textContent=error.message;button.disabled=false;}};
}

// Moderator actions ask once, then report what the server accepted.
export function confirmRemoval({modal,closeDialog,api,toast,targetType,targetId,title,onRemoved}){
  const poster=targetType==='poster';
  const layer=modal(poster?'Take this poster off the wall?':'Remove this comment?',`${title?`<p class="delete-poster-name" data-i18n-ignore>${esc(title)}</p>`:''}<p>${poster?'It disappears from the wall and returns to its creator as a draft they can’t publish again. They are told a moderator removed it.':'The comment is deleted and its author is told a moderator removed it.'}</p><div class="delete-poster-actions"><button type="button" data-keep autofocus>Cancel</button><button type="button" class="button-danger" data-remove>${poster?'Take it down':'Remove comment'}</button></div><p class="error" role="alert"></p>`);
  layer.querySelector('[data-keep]').onclick=()=>closeDialog(layer);
  layer.querySelector('[data-remove]').onclick=async e=>{const button=e.currentTarget;button.disabled=true;
    try{await api(`/api/moderation/${targetType}/${encodeURIComponent(targetId)}`,'POST',{action:'remove'});closeDialog(layer);toast(poster?'Poster taken off the wall.':'Comment removed.');onRemoved?.();}
    catch(error){button.disabled=false;layer.querySelector('.error').textContent=error.message;}};
}

export function mountModeration(root,{api,toast,modal,closeDialog,campusId}){
  let active=true;
  root.innerHTML=`<section class="account-page moderation-page"><span class="eyebrow">MODERATION</span><h1>Reports to review</h1><p class="muted">Reports from students on your campus. Reporters stay anonymous. Decisions take effect straight away.</p><div id="report-list" aria-live="polite"><p class="muted">Loading…</p></div>
  <form class="panel form" id="issue-code"><h2>Help a student sign back in</h2><p class="muted small">Only after checking in person that you’re talking to the account’s owner. The code works once and expires in 24 hours.</p><label>Their username<input name="username" maxlength="25" required placeholder="@username" autocomplete="off" spellcheck="false"></label><p class="error" role="alert"></p><button class="primary">Create a one-time code</button><div id="issued-code" aria-live="polite"></div></form></section>`;
  const list=root.querySelector('#report-list');
  async function load(){
    try{const {reports}=await api('/api/moderation/reports');if(!active)return;
      list.innerHTML=reports.length?reports.map(r=>`<article class="panel moderation-item" data-type="${r.targetType}" data-id="${esc(r.targetId)}"><div class="moderation-meta"><span class="category">${r.targetType==='poster'?'Poster':'Comment'}</span><span>${r.count===1?'1 report':`${r.count} reports`}</span></div>
        <h2 data-i18n-ignore>${esc(r.title)}</h2>${r.targetType==='comment'?`<blockquote data-i18n-ignore>${esc(r.body)}</blockquote>`:''}<p class="small">By <span data-i18n-ignore>${esc(r.author)}</span> · <a href="/${esc(campusId)}/posters/${esc(r.slug)}" target="_blank" rel="noopener">Open poster ↗</a></p>
        <ul class="moderation-reasons">${Object.entries(r.reasons).map(([reason,n])=>`<li><span>${reasonLabel[reason]||reason}</span>${n>1?`<span data-i18n-ignore> × ${n}</span>`:''}</li>`).join('')}</ul>${r.notes.length?`<div class="moderation-notes">${r.notes.map(n=>`<p data-i18n-ignore>“${esc(n)}”</p>`).join('')}</div>`:''}
        <div class="delete-poster-actions"><button type="button" data-dismiss>Dismiss – nothing wrong</button><button type="button" class="button-danger" data-take-down>${r.targetType==='poster'?'Take poster down':'Remove comment'}</button></div></article>`).join(''):'<div class="panel"><p>Nothing to review. <span aria-hidden="true">🎉</span></p></div>';
      list.querySelectorAll('.moderation-item').forEach(item=>{
        const type=item.dataset.type,targetId=item.dataset.id;
        item.querySelector('[data-take-down]').onclick=()=>confirmRemoval({modal,closeDialog,api,toast,targetType:type,targetId,title:item.querySelector('h2').textContent,onRemoved:load});
        item.querySelector('[data-dismiss]').onclick=async e=>{e.currentTarget.disabled=true;try{await api(`/api/moderation/${type}/${encodeURIComponent(targetId)}`,'POST',{action:'dismiss'});toast('Report dismissed.');load();}catch(error){e.currentTarget.disabled=false;toast(error.message,{kind:'error'});}};
      });
    }catch(error){if(active)list.innerHTML=`<p class="error">${esc(error.message)}</p>`;}
  }
  root.querySelector('#issue-code').onsubmit=async e=>{e.preventDefault();const f=e.target,button=f.querySelector('button');button.disabled=true;f.querySelector('.error').textContent='';
    try{const r=await api('/api/moderation/recovery','POST',{username:f.elements.username.value});if(!active)return;f.reset();
      root.querySelector('#issued-code').innerHTML=`<p>One-time code for <strong data-i18n-ignore>${esc(r.student.name)}</strong> <span data-i18n-ignore>@${esc(r.student.username)}</span>:</p><p class="recovery-code" data-i18n-ignore>${esc(r.code)}</p><p class="small">They enter it on the “Forgot your password?” page within 24 hours.</p>`;}
    catch(error){if(active)f.querySelector('.error').textContent=error.message;}finally{button.disabled=false;}};
  load();
  return {destroy(){active=false;}};
}

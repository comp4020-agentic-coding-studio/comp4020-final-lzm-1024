const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>entities[character]);
export const normaliseSearch=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
// Dates and times follow the interface language; English stays Australian English.
const dateLocales={'zh-CN':'zh-CN',es:'es-ES',fr:'fr-FR',ja:'ja-JP'};
export const dateLocale=()=>dateLocales[globalThis.document?.documentElement?.lang]||'en-AU';

export const blockPrompt={title:'Block this student?',message:'You will not be able to message, call, befriend or invite each other. They will not be told.',confirm:'Block'};
// A translated replacement for window.confirm, whose prompt cannot be translated or
// styled. Cancel has focus first; Escape or Cancel resolve false, only the action true.
export function confirmAction({title,message,confirm,cancel='Cancel'}){
  return new Promise(resolve=>{
    const node=document.createElement('dialog');node.className='dialog confirm-dialog';node.setAttribute('aria-labelledby','confirm-action-title');
    node.innerHTML=`<div class="dialog-heading"><h2 id="confirm-action-title">${escapeHtml(title)}</h2></div><p>${escapeHtml(message)}</p><div class="confirm-actions"><button type="button" data-cancel autofocus>${escapeHtml(cancel)}</button><button type="button" class="button-danger" data-confirm>${escapeHtml(confirm)}</button></div>`;
    // Buttons answer at once; Escape (or any other close) counts as Cancel.
    let done=false;const finish=answer=>{if(done)return;done=true;if(node.open)node.close();node.remove();resolve(answer);};
    node.querySelector('[data-cancel]').onclick=()=>finish(false);
    node.querySelector('[data-confirm]').onclick=()=>finish(true);
    node.addEventListener('close',()=>finish(false));
    document.body.append(node);node.showModal();
  });
}

// Load account services only for a signed-in user. A late import must never
// recreate a service for an account that has already signed out or changed.
export function createSessionMount(load){
  let mount,loading,generation=0;
  return async options=>{
    const current=++generation;
    if(mount)return mount(options);
    if(!options.user)return;
    loading??=Promise.resolve().then(load).then(value=>mount=value).catch(error=>{loading=null;throw error;});
    try{const ready=await loading;if(current===generation)return ready(options);}
    catch(error){if(current===generation)throw error;}
  };
}

const stylesheets=new Map();
// The page's import map also lists each stylesheet's long-cached address.
let versions;
function versioned(href){
  if(!versions)try{versions=JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports;}catch{versions={};}
  return versions[href]||href;
}
export function loadStylesheet(href){
  if(stylesheets.has(href))return stylesheets.get(href);
  const promise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=versioned(href);
    link.onload=()=>resolve();
    link.onerror=()=>{link.remove();stylesheets.delete(href);reject(new Error('Unable to load page styles. Please try again.'));};
    document.head.append(link);
  });
  stylesheets.set(href,promise);return promise;
}

// A web address people may follow: http(s) only, otherwise ''.
export function safeUrl(value){try{const url=new URL(String(value||'').trim());return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
// Escaped text with http(s) addresses turned into links. Nothing else becomes markup.
export function linkify(text){
  return String(text??'').split(/(https?:\/\/[^\s<>"']+)/g).map((part,i)=>{
    if(i%2===0)return escapeHtml(part);
    const trail=part.match(/[).,;:!?]+$/)?.[0]||'',raw=trail?part.slice(0,-trail.length):part,href=safeUrl(raw);
    if(!href)return escapeHtml(part);
    const label=raw.replace(/^https?:\/\/(www\.)?/,'');
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${escapeHtml(label.length>48?label.slice(0,45)+'…':label)}</a>${escapeHtml(trail)}`;
  }).join('');
}
